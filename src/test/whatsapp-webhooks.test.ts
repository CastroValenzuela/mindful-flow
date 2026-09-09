import { describe, it, expect } from 'vitest';

// ── Pure Helpers to test (duplicated from Edge Function for isolation) ──
function getCleanPhone(phoneStr: string): string {
  const cleaned = phoneStr.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
}

function normalizeMexicanPhone(phoneStr: string): string {
  let cleaned = phoneStr.replace(/\D/g, "");
  if (cleaned.startsWith("521") && cleaned.length === 13) {
    cleaned = "52" + cleaned.slice(3);
  }
  return cleaned;
}

// Helper to determine reply action based on message body
function isConfirmationMessage(text: string): boolean {
  if (!text) return false;
  const cleaned = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const exacts = ["si", "yes", "confirmar", "confirmo", "1", "ok", "listo", "de acuerdo", "perfecto", "asistire", "voy"];
  if (exacts.includes(cleaned)) return true;

  if (
    cleaned.includes("si asistire") ||
    cleaned.includes("asistire") ||
    cleaned.includes("si voy") ||
    cleaned.includes("ahi estare") ||
    cleaned.includes("confirmo") ||
    cleaned.includes("confirmar cita") ||
    cleaned.includes("confirmo mi cita") ||
    cleaned.includes("confirmo asistencia") ||
    cleaned.includes("confirmar asistencia") ||
    cleaned.includes("si confirmo") ||
    cleaned.includes("claro que si") ||
    cleaned.includes("por supuesto") ||
    cleaned.includes("si por favor") ||
    cleaned.includes("cuenten conmigo") ||
    cleaned.startsWith("si ") ||
    cleaned.endsWith(" si")
  ) {
    return true;
  }
  return false;
}

function isCancellationMessage(text: string): boolean {
  if (!text) return false;
  const cleaned = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const exacts = ["no", "cancelar", "cancelo", "2", "reagendar"];
  if (exacts.includes(cleaned)) return true;

  if (
    cleaned.includes("no podre") ||
    cleaned.includes("no voy a poder") ||
    cleaned.includes("no asistire") ||
    cleaned.includes("cancelar cita") ||
    cleaned.includes("cancelo mi cita") ||
    cleaned.includes("no puedo") ||
    cleaned.includes("no voy a asistir") ||
    cleaned.includes("deseo cancelar") ||
    cleaned.includes("no voy a ir")
  ) {
    return true;
  }
  return false;
}

function getReplyAction(body: string, hasAppointment: boolean, hoursDiff?: number, reschedulePolicyHours = 24) {
  // 1. Link code detection
  const match = body.match(/C[oó]digo:\s*([A-Z0-9-]+)/i);
  if (match) {
    return { type: 'link', code: match[1].toUpperCase() };
  }

  // 2. Appointment confirmation/cancellation
  if (hasAppointment) {
    const isConfirm = isConfirmationMessage(body);
    const isCancel = isCancellationMessage(body);

    if (isConfirm) {
      return { type: 'confirm_appointment' };
    } else if (isCancel) {
      if (hoursDiff !== undefined && hoursDiff < reschedulePolicyHours) {
        return { type: 'cancel_blocked_by_policy', policyHours: reschedulePolicyHours };
      }
      return { type: 'cancel_appointment' };
    }
  }

  return { type: 'general_fallback' };
}

describe('WhatsApp Webhook Core Logics', () => {
  describe('Phone Normalization Helpers', () => {
    it('should clean non-digits and keep last 10 digits for local lookup', () => {
      expect(getCleanPhone('+52 (555) 123-4567')).toBe('5551234567');
      expect(getCleanPhone('5551234567')).toBe('5551234567');
      expect(getCleanPhone('15551234567')).toBe('5551234567');
    });

    it('should strip Mexican carrier "1" prefix added on outbound Meta routing', () => {
      expect(normalizeMexicanPhone('5215551234567')).toBe('525551234567');
      expect(normalizeMexicanPhone('525551234567')).toBe('525551234567');
      expect(normalizeMexicanPhone('521555123456')).toBe('521555123456');
    });
  });

  describe('Inbound Message Parsing & Decision Making', () => {
    it('should detect linking code request', () => {
      const result = getReplyAction('Mi Código: SAU-1234', false);
      expect(result).toEqual({ type: 'link', code: 'SAU-1234' });
    });

    it('should confirm appointment when user replies with affirmative variations', () => {
      // Direct word
      expect(getReplyAction('Sí', true)).toEqual({ type: 'confirm_appointment' });
      expect(getReplyAction('si', true)).toEqual({ type: 'confirm_appointment' });
      expect(getReplyAction('1', true)).toEqual({ type: 'confirm_appointment' });

      // WhatsApp Button exact text
      expect(getReplyAction('Sí, asistiré', true)).toEqual({ type: 'confirm_appointment' });
      // Case and accent variations
      expect(getReplyAction('si asistire', true)).toEqual({ type: 'confirm_appointment' });
      expect(getReplyAction('Sí asistiré', true)).toEqual({ type: 'confirm_appointment' });
      expect(getReplyAction('si, asistiré', true)).toEqual({ type: 'confirm_appointment' });
      expect(getReplyAction('asistiré', true)).toEqual({ type: 'confirm_appointment' });
      expect(getReplyAction('asistire', true)).toEqual({ type: 'confirm_appointment' });
      expect(getReplyAction('confirmo mi asistencia', true)).toEqual({ type: 'confirm_appointment' });
      expect(getReplyAction('Ahi estaré, gracias!', true)).toEqual({ type: 'confirm_appointment' });
    });

    it('should cancel appointment when user replies no and is within policy window', () => {
      expect(getReplyAction('No', true, 36, 24)).toEqual({ type: 'cancel_appointment' });
      expect(getReplyAction('No podré asistir', true, 36, 24)).toEqual({ type: 'cancel_appointment' });
      expect(getReplyAction('no podre asistir', true, 36, 24)).toEqual({ type: 'cancel_appointment' });
      expect(getReplyAction('cancelar', true, 36, 24)).toEqual({ type: 'cancel_appointment' });
      expect(getReplyAction('2', true, 36, 24)).toEqual({ type: 'cancel_appointment' });
    });

    it('should reject cancellation when user replies no but violates policy window', () => {
      expect(getReplyAction('No', true, 12, 24)).toEqual({ type: 'cancel_blocked_by_policy', policyHours: 24 });
      expect(getReplyAction('No podré asistir', true, 12, 24)).toEqual({ type: 'cancel_blocked_by_policy', policyHours: 24 });
      expect(getReplyAction('no podre asistir', true, 12, 24)).toEqual({ type: 'cancel_blocked_by_policy', policyHours: 24 });
    });

    it('should fallback to general auto-reply for custom messages', () => {
      const result = getReplyAction('Hola, ¿puedo cambiar la hora de la sesión?', true);
      expect(result).toEqual({ type: 'general_fallback' });
    });
  });
});
