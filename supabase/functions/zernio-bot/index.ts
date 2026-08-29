import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const ZERNIO_ACCOUNT_ID = "6a8694e377555aae01418448";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const rawBody = await req.text();
    let payload = {};
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      payload = { unparseable: rawBody };
    }
    
    // Evitar que Zernio mande el mismo webhook dos veces por timeout
    const eventId = payload?.id;
    if (eventId) {
      const { data: existing } = await supabase.from("debug_zernio_logs")
        .select("id")
        .eq("log_data->payload->>id", eventId)
        .limit(1);
        
      if (existing && existing.length > 0) {
        console.log("Duplicate webhook ignored:", eventId);
        return new Response(JSON.stringify({ success: true, note: "Duplicate ignored" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Log initial receipt
    await supabase.from("debug_zernio_logs").insert({
      log_data: { step: "webhook_received", payload }
    });

    // Determine the structure
    // El payload REAL de Zernio viene así:
    // { event: "message.received", message: { text: "...", conversationId: "..." }, sender: {...} }
    const messageText = payload?.message?.text || "";
    const conversationId = payload?.message?.conversationId || payload?.conversation?.id || "";
    const source = payload?.message?.direction || ""; // "incoming" or "outgoing"

    // Ignorar si no hay texto o es un mensaje saliente
    if (source === "outgoing" || !messageText || !conversationId) {
      return new Response(JSON.stringify({ success: true, note: "Ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const ZERNIO_API_KEY = Deno.env.get("ZERNIO_API_KEY");

    let replyText = "¡Hola! Gracias por escribir a Saudade. Pronto un asesor se pondrá en contacto contigo.";

    if (GROQ_API_KEY) {
      try {
        const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [
              {
                role: "system",
                content: `Eres un Asesor de Ventas amable, persuasivo y cero técnico para Saudade, el software líder para psicólogos.
Beneficios: ahorrar tiempo, menos estrés, recordatorios por WhatsApp, agenda y expediente.
REGLA DE ORO: Sé SÚPER CORTO y conciso. Máximo 2 oraciones. Invita a: https://app.saudade.mx/portal/login`
              },
              { role: "user", content: messageText }
            ]
          })
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          replyText = aiData.choices?.[0]?.message?.content || replyText;
        }
      } catch (e) { console.error("Groq error:", e); }
    }

    // Send via Zernio API
    if (ZERNIO_API_KEY) {
      const zernioRes = await fetch(
        `https://zernio.com/api/v1/inbox/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ZERNIO_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            accountId: ZERNIO_ACCOUNT_ID,
            message: replyText
          })
        }
      );
      
      const zResult = await zernioRes.json();
      
      await supabase.from("debug_zernio_logs").insert({
        log_data: { step: "zernio_send_result", result: zResult, sentText: replyText }
      });
    }

    return new Response(JSON.stringify({ success: true, ai_reply: replyText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error) {
    await supabase.from("debug_zernio_logs").insert({
      log_data: { step: "fatal_error", message: error.message }
    });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})
