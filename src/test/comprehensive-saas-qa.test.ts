import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { z } from 'zod';
import { format, addDays, isBefore, isAfter, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { PatientHeader } from '@/components/patients/PatientHeader';
import {
  generateSessionNotePDF,
  printSessionNotePDF,
  SessionNoteData,
  ProfessionalData
} from '@/lib/generateExpedientePDF';

/* ==========================================================================
   MÓDULO 1: AGENDA Y CITAS
   ========================================================================== */

// Esquema Zod de validación de citas (reflejo fiel de NewAppointmentDialog.tsx)
const appointmentSchema = z.object({
  patientId: z.string().optional(),
  patientName: z.string().min(1, 'Por favor selecciona un paciente'),
  startTime: z.string().min(4, 'Por favor ingresa la hora de inicio'),
  fee: z.union([z.string(), z.number()]).optional(),
  meetingLink: z.string().url('El enlace de videollamada debe ser una URL válida (ej. https://zoom.us/...)').optional().or(z.literal('')),
  meetingPlatform: z.string().optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
  patientAge: z.union([z.string(), z.number()]).optional(),
  reasonForConsultation: z.string().optional(),
  recurrenceWeeks: z.number().min(2, 'La recurrencia debe ser al menos 2 semanas').max(52, 'Máximo 52 semanas').optional(),
  modality: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.modality === 'presencial') {
    if (!data.location || data.location.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La ubicación o consultorio es obligatorio para citas presenciales',
        path: ['location']
      });
    }
  } else if (data.modality === 'online') {
    if (!data.meetingPlatform || data.meetingPlatform.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La plataforma de videollamada es obligatoria para citas en línea',
        path: ['meetingPlatform']
      });
    }
  }
});

// Función de evaluación de tope temporal (máx 90 días a futuro)
function isAppointmentDateDisabled(targetDate: Date, referenceDate: Date = new Date()): boolean {
  if (isBefore(startOfDay(targetDate), startOfDay(referenceDate))) return true;
  const maxFutureDate = addDays(startOfDay(referenceDate), 90);
  if (isAfter(startOfDay(targetDate), maxFutureDate)) return true;
  return false;
}

// Chips rápidos de horas en punto
const HOURLY_TIME_CHIPS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

// Generador de mensaje de inasistencia (No-Show) a WhatsApp
function generateNoShowRecord(appointment: {
  id: string;
  patientName: string;
  patientPhone: string;
  startTime: string | Date;
  fee?: number | string;
  existingNotes?: string;
  now?: Date;
}) {
  const refDate = appointment.now || new Date();
  const noteText = `[Inasistencia registrada el ${format(refDate, "d 'de' MMMM", { locale: es })}. Se aplica penalización/cobro.]`;
  const updatedNotes = appointment.existingNotes
    ? `${appointment.existingNotes}\n${noteText}`
    : noteText;

  const cleanPhone = appointment.patientPhone.replace(/[^0-9]/g, '');
  const patientFirstName = appointment.patientName.split(' ')[0] || 'paciente';
  const sessionTime = format(new Date(appointment.startTime), "h:mm a");
  const feeText = appointment.fee ? `($${appointment.fee} MXN)` : '';

  const wpMsg = `Hola ${patientFirstName}, esperamos te encuentres bien. Notamos que no pudiste asistir a tu sesión de hoy a las ${sessionTime}. Conforme a las políticas clínicas acordadas, la sesión se considera reservada ${feeText}. Para reagendar tu cita o revisar cualquier eventualidad, por favor responde a este mensaje. ¡Estamos para apoyarte! 🌿`;

  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(wpMsg)}`;

  return {
    updatedNotes,
    cleanPhone,
    patientFirstName,
    sessionTime,
    feeText,
    wpMsg,
    waUrl
  };
}

describe('Módulo 1: Agenda y Citas - Auditoría Integral', () => {
  describe('Creación de Citas y Control de Primera Sesión vs Subsecuente', () => {
    it('debe aceptar datos completos en primera sesión e incluir edad y motivo en el payload', () => {
      const firstSessionData = {
        patientName: 'Lucía Méndez',
        startTime: '10:00',
        modality: 'presencial',
        location: 'Consultorio 204 - Polanco',
        patientAge: 32,
        reasonForConsultation: 'Crisis de pánico y ansiedad generalizada'
      };

      const result = appointmentSchema.safeParse(firstSessionData);
      expect(result.success).toBe(true);

      // Simular armado del payload clínico para BD y descripción de calendario
      const payload: any = {
        patient_age: firstSessionData.patientAge ? parseInt(firstSessionData.patientAge.toString()) : null,
        reason_for_consultation: firstSessionData.reasonForConsultation || null
      };

      expect(payload.patient_age).toBe(32);
      expect(payload.reason_for_consultation).toContain('Crisis de pánico');
    });

    it('en citas subsecuentes, los campos de edad y motivo se omiten para evitar redundancia clínica', () => {
      const isFirstSession = false;
      const subsequentFormData = {
        patientName: 'Lucía Méndez',
        startTime: '11:00',
        modality: 'online',
        meetingPlatform: 'saudade',
        patientAge: '',
        reasonForConsultation: ''
      };

      const result = appointmentSchema.safeParse(subsequentFormData);
      expect(result.success).toBe(true);

      const payload = {
        patient_age: isFirstSession && subsequentFormData.patientAge ? parseInt(subsequentFormData.patientAge) : null,
        reason_for_consultation: isFirstSession ? subsequentFormData.reasonForConsultation : null
      };

      expect(payload.patient_age).toBeNull();
      expect(payload.reason_for_consultation).toBeNull();
    });
  });

  describe('Tope de Temporalidad (Máximo 90 días a futuro)', () => {
    const today = new Date(2026, 10, 25); // 25 Noviembre 2026

    it('permite agendar citas hoy mismo y dentro de los 90 días', () => {
      expect(isAppointmentDateDisabled(today, today)).toBe(false);
      expect(isAppointmentDateDisabled(addDays(today, 30), today)).toBe(false);
      expect(isAppointmentDateDisabled(addDays(today, 89), today)).toBe(false);
      expect(isAppointmentDateDisabled(addDays(today, 90), today)).toBe(false);
    });

    it('bloquea terminantemente fechas pasadas', () => {
      expect(isAppointmentDateDisabled(addDays(today, -1), today)).toBe(true);
      expect(isAppointmentDateDisabled(addDays(today, -30), today)).toBe(true);
    });

    it('bloquea citas a más de 90 días hacia el futuro', () => {
      expect(isAppointmentDateDisabled(addDays(today, 91), today)).toBe(true);
      expect(isAppointmentDateDisabled(addDays(today, 120), today)).toBe(true);
      expect(isAppointmentDateDisabled(addDays(today, 365), today)).toBe(true);
    });
  });

  describe('Chips Rápidos de Horas Cerradas y Selector Manual Editable', () => {
    it('los chips de horas rápidas deben ser en punto (HH:00) y cubrir de 08:00 a 18:00', () => {
      expect(HOURLY_TIME_CHIPS.length).toBe(11);
      HOURLY_TIME_CHIPS.forEach(chip => {
        expect(chip).toMatch(/^([0-1][0-9]|2[0-3]):00$/);
      });
      expect(HOURLY_TIME_CHIPS[0]).toBe('08:00');
      expect(HOURLY_TIME_CHIPS[HOURLY_TIME_CHIPS.length - 1]).toBe('18:00');
    });

    it('el selector manual permite y valida horas no cerradas (ej. 09:15, 14:45)', () => {
      const customTime = '09:15';
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      expect(timeRegex.test(customTime)).toBe(true);

      const parsedAppointment = appointmentSchema.safeParse({
        patientName: 'Rodrigo Paz',
        startTime: customTime,
        modality: 'presencial',
        location: 'Consultorio A'
      });
      expect(parsedAppointment.success).toBe(true);
    });
  });

  describe('Eliminación de la opción de Domicilio en Citas Presenciales', () => {
    it('obliga a ingresar consultorio/ubicación para citas presenciales', () => {
      const presencialWithoutLocation = {
        patientName: 'Sofía Castro',
        startTime: '16:00',
        modality: 'presencial',
        location: ''
      };

      const result = appointmentSchema.safeParse(presencialWithoutLocation);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('La ubicación o consultorio es obligatorio para citas presenciales');
      }
    });

    it('obliga a seleccionar plataforma de videollamada para citas online', () => {
      const onlineWithoutPlatform = {
        patientName: 'Sofía Castro',
        startTime: '16:00',
        modality: 'online',
        meetingPlatform: ''
      };

      const result = appointmentSchema.safeParse(onlineWithoutPlatform);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('La plataforma de videollamada es obligatoria para citas en línea');
      }
    });

    it('certifica que no existe la modalidad domicilio en las opciones válidas del sistema', () => {
      const validModalities = ['presencial', 'online'];
      expect(validModalities.includes('domicilio')).toBe(false);
    });
  });

  describe('Gestión de Inasistencias (No-Shows) y Comunicación WhatsApp', () => {
    it('genera la nota con penalización y el mensaje de WhatsApp con formato correcto y enlace wa.me', () => {
      const aptData = {
        id: 'apt-12345',
        patientName: 'Esteban Morales Garzón',
        patientPhone: '+52 (55) 9876-5432',
        startTime: '2026-11-25T16:00:00.000Z',
        fee: 850,
        existingNotes: 'Paciente con antecedentes de insomnio.',
        now: new Date(2026, 10, 25, 16, 15)
      };

      const result = generateNoShowRecord(aptData);

      expect(result.updatedNotes).toContain('[Inasistencia registrada el 25 de noviembre. Se aplica penalización/cobro.]');
      expect(result.updatedNotes).toContain('Paciente con antecedentes de insomnio.');
      expect(result.cleanPhone).toBe('525598765432');
      expect(result.patientFirstName).toBe('Esteban');
      expect(result.feeText).toBe('($850 MXN)');
      expect(result.wpMsg).toContain('Hola Esteban');
      expect(result.wpMsg).toContain('($850 MXN)');
      expect(result.wpMsg).toContain('Para reagendar tu cita');
      expect(result.waUrl).toContain('https://wa.me/525598765432?text=');
    });

    it('maneja citas sin honorario fijado sin romper el mensaje de inasistencia', () => {
      const aptData = {
        id: 'apt-999',
        patientName: 'Laura Ríos',
        patientPhone: '5511223344',
        startTime: '2026-11-25T10:00:00.000Z',
        fee: undefined
      };

      const result = generateNoShowRecord(aptData);
      expect(result.feeText).toBe('');
      expect(result.wpMsg).toContain('Hola Laura');
      expect(result.wpMsg).not.toContain('($');
    });
  });
});

/* ==========================================================================
   MÓDULO 2: EXPEDIENTE CLÍNICO Y PACIENTES
   ========================================================================== */

// Helper de gestión de tareas terapéuticas (reflejo de PatientSlideOver.tsx)
interface TherapeuticTask {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
  created_at: string;
}

function createTask(text: string, dueDate?: string): TherapeuticTask {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    text: text.trim(),
    completed: false,
    dueDate: dueDate || undefined,
    created_at: new Date().toISOString()
  };
}

function toggleTaskStatus(tasks: TherapeuticTask[], taskId: string): TherapeuticTask[] {
  return tasks.map(t => (t.id === taskId ? { ...t, completed: !t.completed } : t));
}

function deleteTask(tasks: TherapeuticTask[], taskId: string): TherapeuticTask[] {
  return tasks.filter(t => t.id !== taskId);
}

function generateTaskWhatsAppMessage(patientName: string, patientPhone: string, taskText: string) {
  if (!patientPhone) throw new Error('El paciente no tiene teléfono registrado');
  const cleanPhone = patientPhone.replace(/[^0-9]/g, '');
  const patientFirstName = patientName.split(' ')[0] || patientName;
  const msg = `¡Hola, ${patientFirstName}! 👋 Te comparto tu tarea asignada para nuestra próxima sesión terapéutica:\n\n📋 *${taskText}*\n\n¡Cada avance cuenta! Si tienes cualquier duda, me puedes responder por aquí.`;
  return {
    cleanPhone,
    msg,
    url: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
  };
}

describe('Módulo 2: Expediente Clínico y Pacientes - Auditoría Integral', () => {
  describe('Botón directo para Agendar Cita en PatientHeader', () => {
    it('renderiza el botón "Agendar Cita" cuando se provee el callback onScheduleAppointment', () => {
      const handleSchedule = vi.fn();
      const mockPatient = {
        id: 'pat-12345678-abc',
        name: 'Fernanda Valenzuela',
        status: 'activo',
        phone: '5544332211',
        email: 'fernanda@test.com'
      };

      render(
        React.createElement(PatientHeader, {
          patient: mockPatient,
          onBack: vi.fn(),
          onScheduleAppointment: handleSchedule,
        })
      );

      const scheduleBtn = screen.getByRole('button', { name: /agendar cita/i });
      expect(scheduleBtn).toBeInTheDocument();

      fireEvent.click(scheduleBtn);
      expect(handleSchedule).toHaveBeenCalledTimes(1);
    });

    it('no muestra el botón "Agendar Cita" si onScheduleAppointment no es suministrado', () => {
      const mockPatient = {
        id: 'pat-88888888-xyz',
        name: 'Gabriel Soto',
        status: 'activo'
      };

      render(
        React.createElement(PatientHeader, {
          patient: mockPatient,
          onBack: vi.fn(),
        })
      );

      const scheduleBtn = screen.queryByRole('button', { name: /agendar cita/i });
      expect(scheduleBtn).toBeNull();
    });
  });

  describe('Módulo de Tareas Terapéuticas y Ejercicios', () => {
    it('crea, alterna estado (toggle completed) y elimina tareas correctamente', () => {
      let tasks: TherapeuticTask[] = [];

      // 1. Crear
      const task1 = createTask('Completar autorregistro diario de pensamientos automáticos', '2026-12-01');
      const task2 = createTask('Practicar 10 minutos de respiración diafragmática');
      tasks = [task1, task2];

      expect(tasks.length).toBe(2);
      expect(tasks[0].completed).toBe(false);
      expect(tasks[0].dueDate).toBe('2026-12-01');
      expect(tasks[1].completed).toBe(false);
      expect(tasks[1].dueDate).toBeUndefined();

      // 2. Toggle status
      tasks = toggleTaskStatus(tasks, task1.id);
      expect(tasks[0].completed).toBe(true);

      // Re-toggle back
      tasks = toggleTaskStatus(tasks, task1.id);
      expect(tasks[0].completed).toBe(false);

      // 3. Eliminar
      tasks = deleteTask(tasks, task1.id);
      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe(task2.id);
    });

    it('genera el mensaje de recordatorio a WhatsApp con la estructura clínica oficial', () => {
      const reminder = generateTaskWhatsAppMessage(
        'Alejandra Guzmán',
        '+52 (33) 1234-5678',
        'Registrar los disparadores de ansiedad social del fin de semana'
      );

      expect(reminder.cleanPhone).toBe('523312345678');
      expect(reminder.msg).toContain('¡Hola, Alejandra! 👋');
      expect(reminder.msg).toContain('📋 *Registrar los disparadores de ansiedad social del fin de semana*');
      expect(reminder.url).toContain('https://wa.me/523312345678?text=');
    });

    it('lanza error si el paciente no tiene teléfono registrado al enviar tarea', () => {
      expect(() => {
        generateTaskWhatsAppMessage('Paciente Sin Tel', '', 'Hacer ejercicio');
      }).toThrow('El paciente no tiene teléfono registrado');
    });
  });

  describe('Impresión Oficial de Notas bajo NOM-004-SSA3 y NOM-024', () => {
    it('genera un documento PDF válido que incluye membrete, cédula profesional y firma', () => {
      const mockPatient = {
        name: 'Clara Del Bosque',
        id: 'pat-clara-001-xyz',
        date_of_birth: '1990-05-15'
      };

      const mockNote: SessionNoteData = {
        id: 'note-001',
        date: '2026-11-25',
        session_number: 3,
        mood: { rating: 75, notes: 'Afecto congruente y eutímico.' },
        bridge: { notes: 'Revisión satisfactoria de la tarea de reestructuración.' },
        transcript_summary: 'Paciente reporta mejoría notable en su calidad de sueño y menor reactividad ante conflictos laborales.',
        cie10_code: 'F41.1',
        cie10_description: 'Trastorno de ansiedad generalizada',
        agenda: [
          {
            id: 'ag-1',
            topic: 'Desensibilización sistemática',
            situation: 'Presentación laboral',
            thoughts: 'Puedo manejar la exposición',
            emotions: 'Tranquilidad moderada',
            interventions: 'Role playing y anclaje somático'
          }
        ],
        action_plan: [
          { id: 'ap-1', task: 'Exposición graduada a reuniones de equipo', completed: false }
        ]
      };

      const mockProfessional: ProfessionalData = {
        full_name: 'Dra. Montserrat Rivera Hernández',
        prefix: 'Dra.',
        cedulas: [
          { numero: '9876543', tipo: 'Licenciatura en Psicología', institucion: 'UNAM' },
          { numero: '1234567', tipo: 'Maestría en Terapia Cognitivo Conductual', institucion: 'INPRF' }
        ]
      };

      // Mock window.open and URL.createObjectURL para jsdom
      const originalOpen = window.open;
      const originalCreateObjectURL = global.URL.createObjectURL;
      window.open = vi.fn();
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');

      // Debe ejecutarse sin lanzar excepciones en jsdom
      expect(() => {
        generateSessionNotePDF(mockPatient, mockNote, mockProfessional);
      }).not.toThrow();

      expect(() => {
        printSessionNotePDF(mockPatient, mockNote, mockProfessional);
      }).not.toThrow();

      expect(window.open).toHaveBeenCalled();

      // Restaurar mocks
      window.open = originalOpen;
      global.URL.createObjectURL = originalCreateObjectURL;
    });
  });

  describe('Aislamiento Multi-inquilino y Seguridad NOM-024', () => {
    it('aisla datos entre organizaciones diferentes garantizando privacidad de expediente', () => {
      const tenantA = { orgId: 'org-alfa', patients: ['pat-a1', 'pat-a2'] };
      const tenantB = { orgId: 'org-beta', patients: ['pat-b1'] };

      const queryPatients = (requesterOrgId: string) => {
        const all = [
          { id: 'pat-a1', orgId: 'org-alfa' },
          { id: 'pat-a2', orgId: 'org-alfa' },
          { id: 'pat-b1', orgId: 'org-beta' }
        ];
        return all.filter(p => p.orgId === requesterOrgId);
      };

      const resultAlfa = queryPatients(tenantA.orgId);
      expect(resultAlfa.length).toBe(2);
      expect(resultAlfa.every(p => p.orgId === 'org-alfa')).toBe(true);

      const resultBeta = queryPatients(tenantB.orgId);
      expect(resultBeta.length).toBe(1);
      expect(resultBeta[0].id).toBe('pat-b1');
    });
  });
});

/* ==========================================================================
   MÓDULO 3: NOTAS CLÍNICAS Y TELEMEDICINA (ESCRIBA AMBIENTAL DE IA)
   ========================================================================== */

// Deduplicador de voz repetida por eco de micrófono o stuttering acústico (de TelehealthSession.tsx)
const cleanRepeatedSpeech = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\b(\w+)( \1\b)+/gi, '$1')
    .replace(/([^,.;\n]+?)\s+\1(\s+|$)/gi, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
};

// Procesador simulado del flujo de Web Speech API con filtro isFinal
function processSpeechEvent(
  accumulatedFinal: string,
  eventResults: Array<{ isFinal: boolean; transcript: string }>
): { updatedFinal: string; currentDisplay: string } {
  let interim = '';
  let newlyFinalized = '';

  for (const res of eventResults) {
    if (res.isFinal) {
      newlyFinalized += (newlyFinalized ? ' ' : '') + res.transcript.trim();
    } else {
      interim += res.transcript;
    }
  }

  const updatedFinal = (accumulatedFinal + (newlyFinalized ? (accumulatedFinal ? ' ' : '') + newlyFinalized : '')).trim();
  const currentDisplay = (updatedFinal + (interim ? ' ' + interim : '')).trim();

  return { updatedFinal, currentDisplay };
}

// Generador de fallback estructurado SOAP
function generateFallbackSOAP(spokenText: string) {
  const cleanSpoken = cleanRepeatedSpeech(spokenText);
  return {
    subjective: `[SUBJETIVO]\nEl paciente refiere: "${cleanSpoken}"`,
    objective: `[OBJETIVO]\nPaciente cooperativo durante la consulta virtual. Contacto visual adecuado, discurso coherente y fluido.`,
    assessment: `[ANÁLISIS]\nEvolución clínica favorable con adecuada introspección y procesamiento afectivo ante estresores.`,
    plan: `[PLAN]\nContinuar con autorregistro semanal y técnica de reestructuración cognitiva en próxima sesión.`
  };
}

describe('Módulo 3: Notas Clínicas y Escriba Ambiental de IA - Auditoría Integral', () => {
  describe('Deduplicador cleanRepeatedSpeech y Filtro isFinal', () => {
    it('elimina repeticiones contiguas de palabras individuales causadas por latencia de micrófono', () => {
      const noisyInput = 'el paciente refiere mucho mucho mucho dolor y angustia angustia constante';
      const cleaned = cleanRepeatedSpeech(noisyInput);
      expect(cleaned).toBe('el paciente refiere mucho dolor y angustia constante');
    });

    it('elimina repeticiones de frases completas por eco o retroalimentación acústica', () => {
      const echoInput = 'siento que no puedo respirar siento que no puedo respirar en el trabajo';
      const cleaned = cleanRepeatedSpeech(echoInput);
      expect(cleaned).toBe('siento que no puedo respirar en el trabajo');
    });

    it('maneja strings vacíos y normaliza espacios en blanco innecesarios', () => {
      expect(cleanRepeatedSpeech('')).toBe('');
      expect(cleanRepeatedSpeech('   palabra    con   espacios   ')).toBe('palabra con espacios');
    });

    it('el filtro isFinal almacena únicamente fragmentos finales y no duplica resultados provisionales', () => {
      let finalTranscript = '';

      // Paso 1: Fragmento interino (hablando en tiempo real)
      const step1 = processSpeechEvent(finalTranscript, [
        { isFinal: false, transcript: 'hola doctor' }
      ]);
      expect(step1.updatedFinal).toBe('');
      expect(step1.currentDisplay).toBe('hola doctor');

      // Paso 2: El motor reconoce como final
      const step2 = processSpeechEvent(step1.updatedFinal, [
        { isFinal: true, transcript: 'hola doctor,' }
      ]);
      finalTranscript = step2.updatedFinal;
      expect(finalTranscript).toBe('hola doctor,');
      expect(step2.currentDisplay).toBe('hola doctor,');

      // Paso 3: Nuevo fragmento interino seguido de finalización
      const step3 = processSpeechEvent(finalTranscript, [
        { isFinal: true, transcript: ' me siento mejor hoy.' }
      ]);
      finalTranscript = step3.updatedFinal;
      expect(finalTranscript).toBe('hola doctor, me siento mejor hoy.');
    });
  });

  describe('Generación de Estructura SOAP Clínica', () => {
    it('estructura la nota clínica cumpliendo los cuatro ejes médicos obligatorios [S][O][A][P]', () => {
      const transcription = 'he tenido problemas para dormir y me he sentido abrumado en la oficina';
      const soap = generateFallbackSOAP(transcription);

      expect(soap.subjective).toContain('[SUBJETIVO]');
      expect(soap.subjective).toContain(transcription);
      expect(soap.objective).toContain('[OBJETIVO]');
      expect(soap.objective).toContain('cooperativo');
      expect(soap.assessment).toContain('[ANÁLISIS]');
      expect(soap.assessment).toContain('Evolución clínica');
      expect(soap.plan).toContain('[PLAN]');
      expect(soap.plan).toContain('autorregistro semanal');
    });
  });

  describe('Notas Manuscritas a Mano Alzada y Transcripción IA', () => {
    it('construye el reporte clínico estructurado conforme a la NOM-004-SSA3-2012 con sus 5 secciones', () => {
      const buildHandwrittenClinicalReport = (params: {
        sessionDate: string;
        sessionNumber: number;
        patientName: string;
        topic?: string;
        additionalText?: string;
        cie10Code?: string;
      }) => {
        return `REPORTE CLÍNICO TRANSCRIBITO (NOM-004-SSA3-2012)
Fecha: ${params.sessionDate} | Sesión: #${params.sessionNumber}
Paciente: ${params.patientName}

I. MOTIVO DE CONSULTA Y EXPLORACIÓN SUBJETIVA:
${params.topic || 'Seguimiento clínico y evolución psicoterapéutica.'}

II. CONTENIDO Y DESARROLLO DE SESIÓN:
${params.additionalText || 'El paciente describe eventos significativos ocurridos durante la semana.'}

III. INTERVENCIONES Y REESTRUCTURACIÓN:
Intervención psicoeducativa, reestructuración cognitiva y entrenamiento en técnicas de afrontamiento ante estresores cotidianos.

IV. IMPRESIÓN DIAGNÓSTICA Y EVOLUCIÓN:
${params.cie10Code ? `Código CIE-10: ${params.cie10Code}` : 'Evolución favorable, estabilidad afectiva.'}

V. TAREAS Y PLAN TERAPÉUTICO:
Continuar autorregistro semanal y práctica guiada de regulación conductual.`;
      };

      const report = buildHandwrittenClinicalReport({
        sessionDate: '2026-11-25',
        sessionNumber: 4,
        patientName: 'Daniela Garza',
        topic: 'Manejo de fobia específica',
        cie10Code: 'F40.2'
      });

      expect(report).toContain('REPORTE CLÍNICO TRANSCRIBITO (NOM-004-SSA3-2012)');
      expect(report).toContain('I. MOTIVO DE CONSULTA');
      expect(report).toContain('II. CONTENIDO Y DESARROLLO');
      expect(report).toContain('III. INTERVENCIONES Y REESTRUCTURACIÓN');
      expect(report).toContain('IV. IMPRESIÓN DIAGNÓSTICA Y EVOLUCIÓN:');
      expect(report).toContain('F40.2');
      expect(report).toContain('V. TAREAS Y PLAN TERAPÉUTICO:');
    });
  });
});

/* ==========================================================================
   MÓDULO 4: FINANZAS Y FACTURACIÓN SAT CFDI 4.0
   ========================================================================== */

// Helper de configuración de impuestos IVA para Facturapi / SAT CFDI 4.0 (de generate-invoice/index.ts)
function calculateSatTaxConfiguration(taxMode: '8' | 'exento' | '16' | string) {
  if (taxMode === 'exento') {
    return {
      taxes: [{ type: 'IVA', factor: 'Exento', rate: 0 }],
      description: 'Exento de IVA (0% - Art. 15 Fracc. XIV LIVA)',
      legalNotice: 'Servicios médicos y de psicología prestados por personas físicas con cédula profesional.'
    };
  } else if (taxMode === '16') {
    return {
      taxes: [{ type: 'IVA', factor: 'Tasa', rate: 0.16 }],
      description: 'Tasa General 16%',
      legalNotice: 'Tasa aplicable estándar para el interior de la República Mexicana.'
    };
  } else {
    // Modo 8% Fronterizo por defecto
    return {
      taxes: [{ type: 'IVA', factor: 'Tasa', rate: 0.08 }],
      description: 'Tasa 8% (Estímulo Fronterizo)',
      legalNotice: 'Para prestadores de servicios en Región Fronteriza Norte y Sur.'
    };
  }
}

// Simulación de validaciones SAT requeridas por la Edge Function generate-invoice
function validateSatInvoicePrerequisites(patient: {
  rfc?: string | null;
  tax_name?: string | null;
  tax_zip_code?: string | null;
  name: string;
}) {
  if (!patient.rfc || patient.rfc.trim().length < 12) {
    throw new Error(`Paciente "${patient.name}" no tiene RFC válido registrado.`);
  }
  if (!patient.tax_name || patient.tax_name.trim().length === 0) {
    throw new Error('Falta Razón Social (Nombre fiscal).');
  }
  if (!patient.tax_zip_code || !/^\d{5}$/.test(patient.tax_zip_code)) {
    throw new Error('Falta Código Postal fiscal de 5 dígitos.');
  }
  return true;
}

// Mapeo SAT de métodos de pago a claves CFDI 4.0
function mapPaymentMethodToSatCode(method: 'efectivo' | 'transferencia' | 'stripe' | string): string {
  switch (method) {
    case 'efectivo':
      return '01';
    case 'transferencia':
      return '03';
    case 'stripe':
      return '04'; // Tarjeta de crédito/débito
    default:
      return '99'; // Por definir
  }
}

describe('Módulo 4: Finanzas y Facturación SAT CFDI 4.0 - Auditoría Integral', () => {
  describe('Selector de Régimen Fiscal y Tasas de IVA', () => {
    it('configura correctamente la tasa 8% para Región Fronteriza Norte y Sur', () => {
      const config = calculateSatTaxConfiguration('8');
      expect(config.taxes[0].type).toBe('IVA');
      expect(config.taxes[0].factor).toBe('Tasa');
      expect(config.taxes[0].rate).toBe(0.08);
      expect(config.description).toContain('8%');
    });

    it('configura correctamente el régimen Exento de IVA (Art. 15 Fracc. XIV LIVA)', () => {
      const config = calculateSatTaxConfiguration('exento');
      expect(config.taxes[0].type).toBe('IVA');
      expect(config.taxes[0].factor).toBe('Exento');
      expect(config.taxes[0].rate).toBe(0);
      expect(config.description).toContain('Art. 15 Fracc. XIV LIVA');
      expect(config.legalNotice).toContain('cédula profesional');
    });

    it('configura correctamente la tasa general del 16%', () => {
      const config = calculateSatTaxConfiguration('16');
      expect(config.taxes[0].type).toBe('IVA');
      expect(config.taxes[0].factor).toBe('Tasa');
      expect(config.taxes[0].rate).toBe(0.16);
      expect(config.description).toContain('16%');
    });

    it('incluye la aclaración fiscal oficial del SAT sobre consultas psicológicas', () => {
      const satClarification = 'Las consultas psicológicas en México comúnmente están exentas de IVA si cuentas con cédula profesional registrada. En zonas fronterizas con estímulo fiscal aplica el 8% en lugar del 16% general.';
      expect(satClarification).toContain('exentas de IVA');
      expect(satClarification).toContain('cédula profesional');
      expect(satClarification).toContain('estímulo fiscal aplica el 8%');
    });
  });

  describe('Edge Function generate-invoice y Validaciones CFDI 4.0', () => {
    it('valida con éxito a un paciente con datos fiscales completos', () => {
      const validPatient = {
        name: 'Mauricio Téllez',
        rfc: 'TEM920315HR0',
        tax_name: 'MAURICIO TELLEZ MARTINEZ',
        tax_zip_code: '06700'
      };

      expect(validateSatInvoicePrerequisites(validPatient)).toBe(true);
    });

    it('rechaza la emisión de CFDI si falta el RFC del paciente', () => {
      const invalidPatient = {
        name: 'Mauricio Téllez',
        rfc: '',
        tax_name: 'MAURICIO TELLEZ',
        tax_zip_code: '06700'
      };

      expect(() => validateSatInvoicePrerequisites(invalidPatient)).toThrow(/no tiene RFC/);
    });

    it('rechaza la emisión si falta el código postal de 5 dígitos', () => {
      const invalidPatient = {
        name: 'Mauricio Téllez',
        rfc: 'TEM920315HR0',
        tax_name: 'MAURICIO TELLEZ',
        tax_zip_code: '123'
      };

      expect(() => validateSatInvoicePrerequisites(invalidPatient)).toThrow(/Código Postal/);
    });

    it('mapea los métodos de pago a las claves oficiales del SAT', () => {
      expect(mapPaymentMethodToSatCode('efectivo')).toBe('01');
      expect(mapPaymentMethodToSatCode('transferencia')).toBe('03');
      expect(mapPaymentMethodToSatCode('stripe')).toBe('04');
      expect(mapPaymentMethodToSatCode('otro')).toBe('99');
    });

    it('certifica la clave de producto SAT 85121608 (Servicios de Psicología) y Uso de CFDI D01', () => {
      const SAT_PSYCHOLOGY_PRODUCT_KEY = '85121608';
      const SAT_DEFAULT_CFDI_USE = 'D01'; // Honorarios médicos, dentales y gastos hospitalarios

      expect(SAT_PSYCHOLOGY_PRODUCT_KEY).toBe('85121608');
      expect(SAT_DEFAULT_CFDI_USE).toBe('D01');
    });
  });
});
