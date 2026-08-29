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
    const siteUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!siteUrl || !serviceKey) {
      throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(siteUrl, serviceKey);

    // 1. Obtener la fecha de hace exactamente 30 días
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    // Formatear fechas para asegurar comparación correcta en base de datos (Ignorando horas para que cubra todo el día)
    const startDate = new Date(thirtyDaysAgo);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(thirtyDaysAgo);
    endDate.setHours(23, 59, 59, 999);

    // 2. Buscar pacientes cuya última sesión (completed) haya sido hace 30 días
    // Y que no tengan citas futuras ni se les haya enviado recordatorio recientemente.
      const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select(`
        id, 
        patient_id, 
        organization_id, 
        therapist_id,
        patients!inner (id, name, phone, last_reminder_sent_at)
      `)
      .eq('status', 'completed')
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString());

    if (aptError) {
      throw aptError;
    }

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ message: 'No hay pacientes inactivos para hoy' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const processedPatients = new Set();
    const results = [];

    // 3. Procesar cada paciente encontrado
    for (const apt of appointments) {
      const patientId = apt.patient_id;
      const patient = apt.patients;
      const therapistId = apt.therapist_id;

      // Evitar procesar el mismo paciente dos veces en el mismo ciclo
      if (processedPatients.has(patientId)) continue;
      processedPatients.add(patientId);

      // Verificar que no se haya enviado un recordatorio recientemente (ej. en los últimos 20 días)
      if (patient.last_reminder_sent_at) {
        const lastSent = new Date(patient.last_reminder_sent_at);
        const daysSinceLastSent = (today.getTime() - lastSent.getTime()) / (1000 * 3600 * 24);
        if (daysSinceLastSent < 20) {
           console.log(`Skipping patient ${patient.name} - reminder sent ${Math.round(daysSinceLastSent)} days ago`);
           continue;
        }
      }

      // Verificar si el paciente tiene citas futuras (status = scheduled)
      const { data: futureApts, error: futureError } = await supabase
        .from('appointments')
        .select('id')
        .eq('patient_id', patientId)
        .eq('status', 'scheduled')
        .gte('start_time', new Date().toISOString())
        .limit(1);

      if (futureError) {
        console.error('Error verificando citas futuras:', futureError);
        continue;
      }

      if (futureApts && futureApts.length > 0) {
         // El paciente ya tiene otra cita agendada, no necesita recordatorio
         console.log(`Skipping patient ${patient.name} - already has future appointments`);
         continue;
      }

      // Obtener el slug y nombre del psicólogo para el enlace de reservas y el texto
      let therapistSlug = '';
      let therapistName = 'tu especialista';
      if (therapistId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('slug, full_name, prefix')
          .eq('id', therapistId)
          .single();
          
        if (profileData) {
          therapistSlug = profileData.slug || '';
          therapistName = profileData.full_name ? profileData.full_name.split(' ')[0] : 'tu especialista';
        }
      }

      // Formatear la fecha de hace 30 días para el mensaje
      const dateStr = startDate.toLocaleDateString('es-MX', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });

      // 4. Enviar WhatsApp vía meta-whatsapp
      if (patient.phone) {
        const shortName = patient.name ? patient.name.split(' ')[0] : 'Paciente';
        // variables: {{1}} = Nombre paciente, {{2}} = Nombre psicólogo, {{3}} = Fecha
        const variables = [shortName, therapistName, dateStr]; 
        const buttonVariables = therapistSlug ? [therapistSlug] : [];

        try {
          console.log(`Sending reminder to ${patient.name} (${patient.phone})`);
          const waRes = await fetch(`${siteUrl}/functions/v1/meta-whatsapp`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action: 'send',
              phone: patient.phone,
              organization_id: apt.organization_id,
              patient_id: patientId,
              template_id: 'recordatorio_inactivid', // <-- Nombre de la plantilla en Meta (corregido)
              template_variables: variables,
              template_button_variables: buttonVariables
            })
          });
          
          const waData = await waRes.json();
          if (waRes.ok && waData.success) {
            results.push({ patientId, success: true });
            
            // 5. Actualizar fecha de último recordatorio enviado
            await supabase
              .from('patients')
              .update({ last_reminder_sent_at: new Date().toISOString() })
              .eq('id', patientId);
              
          } else {
            console.error(`WhatsApp FAILED for ${patient.name}:`, waData);
            results.push({ patientId, success: false, error: waData.error });
          }
        } catch (err: any) {
           console.error(`WhatsApp FAILED Exception for ${patient.name}:`, err.message);
           results.push({ patientId, success: false, error: err.message });
        }
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err: any) {
    console.error('Error en patient-inactivity-reminder:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
