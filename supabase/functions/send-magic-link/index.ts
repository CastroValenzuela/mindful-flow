import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const jsonBody = await req.json()
    const { email, redirectTo, type, code, magicToken, patientName } = jsonBody

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('[send-magic-link] Missing RESEND_API_KEY')
      return new Response(JSON.stringify({ error: 'Email service configuration missing' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      })
    }

    // ── PATIENT PORTAL LOGIN FLOW ───────────────────────────────────────────
    if (type === 'patient_portal' && (code || magicToken)) {
      const siteUrl = Deno.env.get('SITE_URL') || 'https://app.saudade.mx'
      const actionLink = magicToken 
        ? `${siteUrl}/portal/login?token=${magicToken}` 
        : `${siteUrl}/portal/login`
      const pName = patientName ? patientName.split(' ')[0] : 'Paciente'

      const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de Acceso a tu Portal Saudade</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      padding: 40px 16px;
      background-color: #F8FAFC;
    }
    .card {
      max-width: 520px;
      margin: 0 auto;
      background-color: #FFFFFF;
      border-radius: 24px;
      border: 1px solid #E2E8F0;
      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.05);
      padding: 36px 32px;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #0284C7 0%, #0D9488 100%);
      border-radius: 14px;
      margin-bottom: 20px;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
      color: #FFFFFF;
      font-size: 22px;
      font-weight: 900;
      line-height: 44px;
      text-align: center;
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0F172A;
      margin: 0 0 8px 0;
      line-height: 1.3;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
      margin: 0 0 20px 0;
    }
    .otp-container {
      background: linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%);
      border: 1px solid #A7F3D0;
      border-radius: 18px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-label {
      font-size: 11px;
      font-weight: 700;
      color: #047857;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 6px;
    }
    .otp-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 34px;
      font-weight: 900;
      letter-spacing: 8px;
      color: #065F46;
    }
    .btn-container {
      text-align: center;
      margin: 24px 0 16px 0;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #0284C7 0%, #0D9488 100%);
      color: #FFFFFF !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 700;
      padding: 14px 32px;
      border-radius: 12px;
      box-shadow: 0 8px 16px -4px rgba(2, 132, 199, 0.3);
    }
    .security-note {
      background-color: #F8FAFC;
      border-radius: 14px;
      border: 1px solid #F1F5F9;
      padding: 14px 16px;
      font-size: 12px;
      color: #64748B;
      line-height: 1.5;
      margin-top: 24px;
    }
    .footer {
      text-align: center;
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid #F1F5F9;
      font-size: 11px;
      color: #94A3B8;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="logo-badge">S.</div>
      <h1>¡Hola, ${pName}! 👋</h1>
      <p>Has solicitado acceso a tu <strong>Portal del Paciente en Saudade</strong>. Puedes ingresar copiando tu código de 6 dígitos o haciendo clic en el botón directo:</p>

      ${code ? `
      <div class="otp-container">
        <div class="otp-label">Tu Código de Acceso (Válido 10 min)</div>
        <div class="otp-code">${code}</div>
      </div>
      ` : ''}

      <div class="btn-container">
        <a href="${actionLink}" class="btn" target="_blank">Ingresar con 1 Clic a mi Portal →</a>
      </div>

      <div class="security-note">
        <strong>🔒 Confidencialidad y Seguridad:</strong> Este código expira en 10 minutos y es de un solo uso. Si no solicitaste este acceso, por favor ignora este correo.
      </div>

      <div class="footer">
        <strong>Saudade</strong> · Gestión Clínica e Inteligencia Terapéutica<br>
        Alineado con los estándares de la NOM-024-SSA3-2012
      </div>
    </div>
  </div>
</body>
</html>
      `

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Saudade <notificaciones@saudade.mx>',
          to: [email],
          subject: code ? `🔑 Tu código de acceso al Portal Saudade: ${code}` : '🔑 Tu enlace de acceso al Portal Saudade',
          html: htmlContent,
        }),
      })

      const resendData = await resendRes.json()
      if (!resendRes.ok) {
        console.error('[send-magic-link] Resend error:', resendData)
        return new Response(JSON.stringify({ error: resendData.message || 'Error dispatching email' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        })
      }

      return new Response(JSON.stringify({ success: true, id: resendData.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // ── THERAPIST / ADMIN AUTH MAGIC LINK (EXISTING FLOW) ───────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: redirectTo || `${Deno.env.get('SITE_URL') || 'https://app.saudade.mx'}/`
      }
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[send-magic-link] Error generating link:', linkError)
      return new Response(JSON.stringify({ error: linkError?.message || 'Failed to generate link' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const actionLink = linkData.properties.action_link

    // Dispatch default admin magic link
    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceso Seguro a Saudade</title>
</head>
<body style="font-family: -apple-system, sans-serif; background-color: #F8FAFC; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 20px; border: 1px solid #E2E8F0; padding: 32px;">
    <h2 style="color: #0F172A;">Inicia sesión en Saudade</h2>
    <p style="color: #475569;">Haz clic en el botón para acceder a tu cuenta:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${actionLink}" style="background: #0284C7; color: #FFFFFF; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; display: inline-block;">Ingresar a mi Cuenta →</a>
    </div>
    <p style="font-size: 12px; color: #94A3B8;">Este enlace expira en 10 minutos y solo puede usarse una vez.</p>
  </div>
</body>
</html>
    `

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Saudade <notificaciones@saudade.mx>',
        to: [email],
        subject: '✨ Tu enlace de acceso seguro a Saudade',
        html: htmlContent,
      }),
    })

    const resendData = await resendRes.json()
    if (!resendRes.ok) {
      console.error('[send-magic-link] Resend error:', resendData)
      return new Response(JSON.stringify({ error: resendData.message || 'Error dispatching email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err: any) {
    console.error('[send-magic-link] Unexpected error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
