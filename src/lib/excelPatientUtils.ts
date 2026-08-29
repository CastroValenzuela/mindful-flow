import * as XLSX from 'xlsx';

export interface ParsedPatientRow {
  name: string;
  phone: string;
  email: string;
  birth_date: string | null;
  gender: string | null;
  occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  reason_for_consultation: string | null;
  status: 'activo' | 'primer_contacto' | 'inactivo' | 'alta';
  tags: string[];
  isValid: boolean;
  validationError?: string;
  originalRow: Record<string, any>;
}

export interface ParseResult {
  totalRows: number;
  validPatients: ParsedPatientRow[];
  invalidRows: ParsedPatientRow[];
  headers: string[];
}

/**
 * Downloads the official Excel template (.xlsx) with pre-styled columns,
 * validation comments, and realistic example rows.
 */
export function downloadPatientExcelTemplate() {
  const wb = XLSX.utils.book_new();

  // 1. Main Data Sheet
  const headers = [
    'Nombre Completo *',
    'Teléfono (10 dígitos) *',
    'Correo Electrónico',
    'Fecha de Nacimiento (AAAA-MM-DD)',
    'Género (Femenino / Masculino / No binario / Otro)',
    'Ocupación',
    'Contacto de Emergencia - Nombre',
    'Contacto de Emergencia - Teléfono',
    'Contacto de Emergencia - Parentesco',
    'Motivo de Consulta',
    'Estado (activo / primer_contacto / inactivo)',
    'Etiquetas (separadas por coma)'
  ];

  const sampleData = [
    headers,
    [
      'María Fernanda López García',
      '5512345678',
      'maria.lopez@ejemplo.com',
      '1994-06-15',
      'Femenino',
      'Diseñadora gráfica',
      'Carlos López',
      '5598765432',
      'Hermano',
      'Manejo de estrés laboral y ansiedad',
      'activo',
      'Adulto, Ansiedad'
    ],
    [
      'Alejandro Ruiz Mendoza',
      '8112345678',
      'alejandro.ruiz@ejemplo.com',
      '1989-11-23',
      'Masculino',
      'Contador Público',
      'Sofía Mendoza',
      '8198765432',
      'Madre',
      'Duelo y cambios vitales',
      'primer_contacto',
      'Duelo, Primer Ingreso'
    ],
    [
      'Valeria Gómez Martínez',
      '3312345678',
      'valeria.gomez@ejemplo.com',
      '2001-03-08',
      'Femenino',
      'Estudiante universitaria',
      'Roberto Gómez',
      '3398765432',
      'Padre',
      'Autoestima y relaciones interpersonales',
      'activo',
      'Joven, Autoestima'
    ]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);

  // Column widths for optimal readability
  ws['!cols'] = [
    { wch: 32 }, // Nombre
    { wch: 24 }, // Teléfono
    { wch: 30 }, // Correo
    { wch: 32 }, // Fecha Nacimiento
    { wch: 28 }, // Género
    { wch: 24 }, // Ocupación
    { wch: 32 }, // Contacto Emergencia Nombre
    { wch: 32 }, // Contacto Emergencia Teléfono
    { wch: 34 }, // Contacto Emergencia Parentesco
    { wch: 38 }, // Motivo de Consulta
    { wch: 30 }, // Estado
    { wch: 30 }, // Etiquetas
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');

  // 2. Instructions Sheet
  const instructions = [
    ['INSTRUCCIONES PARA LLENAR LA PLANTILLA DE PACIENTES - SAUDADE'],
    [''],
    ['CAMPO', 'OBLIGATORIO', 'FORMATO / OPCIONES VÁLIDAS', 'DESCRIPCIÓN'],
    ['Nombre Completo', 'SÍ', 'Texto libre', 'Nombre y apellidos del paciente.'],
    ['Teléfono', 'SÍ', '10 dígitos (ej. 5512345678)', 'Número celular para recordatorios de WhatsApp.'],
    ['Correo Electrónico', 'OPCIONAL', 'correo@ejemplo.com', 'Para acceso al portal del paciente y confirmaciones.'],
    ['Fecha de Nacimiento', 'OPCIONAL', 'AAAA-MM-DD (ej. 1990-05-20)', 'Requerido para el cálculo automático de edad y NOM-024.'],
    ['Género', 'OPCIONAL', 'Femenino, Masculino, No binario, Otro, Prefiero no decir', 'Identidad de género del paciente.'],
    ['Ocupación', 'OPCIONAL', 'Texto libre', 'Profesión, oficio o actividad principal.'],
    ['Contacto Emergencia - Nombre', 'OPCIONAL', 'Texto libre', 'Familiar o persona de confianza en caso de crisis.'],
    ['Contacto Emergencia - Teléfono', 'OPCIONAL', '10 dígitos', 'Teléfono de la persona de confianza.'],
    ['Contacto Emergencia - Parentesco', 'OPCIONAL', 'Pareja, Madre, Padre, Hermano/a, Hijo/a, Familiar, Amigo/a, Otro', 'Relación con el paciente.'],
    ['Motivo de Consulta', 'OPCIONAL', 'Texto libre', 'Razón principal de atención psicológica.'],
    ['Estado', 'OPCIONAL', 'activo, primer_contacto, inactivo, alta', 'Estado clínico del paciente (por defecto: activo).'],
    ['Etiquetas', 'OPCIONAL', 'Texto separado por comas', 'Ej. Terapia Breve, Ansiedad, Adulto'],
    [''],
    ['NOTAS IMPORTANTES:'],
    ['1. No cambies los nombres de los encabezados de la fila 1.'],
    ['2. Puedes borrar las filas de ejemplo y pegar tu lista de pacientes.'],
    ['3. Si dejas el campo Estado vacío, se asignará automáticamente como "activo".'],
    ['4. Guarda el archivo como .xlsx o .csv y súbelo en la plataforma.']
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 45 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instrucciones');

  // Trigger download
  XLSX.writeFile(wb, 'Plantilla_Pacientes_Saudade.xlsx');
}

/**
 * Normalizes text string for flexible header matching
 */
function cleanKey(key: string): string {
  return (key || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]/g, ''); // remove symbols, spaces, asterisks
}

/**
 * Parses and formats dates from various formats (Excel serial number, DD/MM/YYYY, YYYY-MM-DD)
 */
function normalizeDate(raw: any): string | null {
  if (!raw) return null;

  // 1. If it's already a JS Date
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().split('T')[0];
  }

  // 2. If it's an Excel serial date number
  if (typeof raw === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + raw * 86400000);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }

  const str = String(raw).trim();
  if (!str) return null;

  // 3. Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // 4. Match DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // 5. Try standard Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Normalizes phone number to 10 digits
 */
function normalizePhone(raw: any): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normalizes status value to match patient_status enum
 */
function normalizeStatus(raw: any): 'activo' | 'primer_contacto' | 'inactivo' | 'alta' {
  const str = cleanKey(String(raw || ''));
  if (str.includes('primer') || str.includes('contacto') || str.includes('lead') || str.includes('nuevo')) {
    return 'primer_contacto';
  }
  if (str.includes('inactiv') || str.includes('pausa') || str.includes('baja')) {
    return 'inactivo';
  }
  if (str.includes('alta') || str.includes('terminad') || str.includes('concluid')) {
    return 'alta';
  }
  return 'activo';
}

/**
 * Normalizes gender value
 */
function normalizeGender(raw: any): string | null {
  const str = cleanKey(String(raw || ''));
  if (str.startsWith('fem') || str === 'f' || str === 'mujer') return 'femenino';
  if (str.startsWith('masc') || str === 'm' || str === 'hombre') return 'masculino';
  if (str.includes('nobin') || str.includes('nonbin')) return 'no_binario';
  if (str.includes('prefiero') || str.includes('noespecifica')) return 'prefiero_no_decir';
  if (str) return String(raw).trim();
  return null;
}

/**
 * Parses uploaded Excel / CSV File into structured patient objects
 */
export async function parsePatientExcelFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];

  if (!sheet) {
    throw new Error('El archivo no contiene ninguna hoja válida.');
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  if (rawRows.length === 0) {
    throw new Error('El archivo está vacío o no contiene filas con datos.');
  }

  // Extract raw header titles
  const sampleRow = rawRows[0] || {};
  const headers = Object.keys(sampleRow);

  const validPatients: ParsedPatientRow[] = [];
  const invalidRows: ParsedPatientRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];

    // Find mapped values by inspecting normalized keys
    let name = '';
    let phone = '';
    let email = '';
    let birthDateRaw: any = null;
    let genderRaw = '';
    let occupation = '';
    let emergencyName = '';
    let emergencyPhone = '';
    let emergencyRelationship = '';
    let reason = '';
    let statusRaw = '';
    let tagsRaw = '';

    for (const [key, val] of Object.entries(row)) {
      const k = cleanKey(key);
      const valStr = val !== undefined && val !== null ? String(val).trim() : '';

      if (k.includes('nombre') || k.includes('paciente') || k.includes('fullname') || k === 'name') {
        name = valStr;
      } else if (k.includes('tel') || k.includes('cel') || k.includes('phone') || k.includes('whatsapp') || k.includes('movil')) {
        if (k.includes('emergencia') || k.includes('contacto')) {
          emergencyPhone = valStr;
        } else {
          phone = valStr;
        }
      } else if (k.includes('correo') || k.includes('email') || k.includes('mail')) {
        email = valStr;
      } else if (k.includes('nacimiento') || k.includes('cumplean') || k.includes('birth') || k.includes('dob')) {
        birthDateRaw = val;
      } else if (k.includes('genero') || k.includes('sexo') || k.includes('gender')) {
        genderRaw = valStr;
      } else if (k.includes('ocupacion') || k.includes('profesion') || k.includes('trabajo')) {
        occupation = valStr;
      } else if (k.includes('emergencia') || k.includes('contacto')) {
        if (k.includes('parentesco') || k.includes('relacion')) {
          emergencyRelationship = valStr;
        } else if (k.includes('tel') || k.includes('cel') || k.includes('num')) {
          emergencyPhone = valStr;
        } else {
          emergencyName = valStr;
        }
      } else if (k.includes('parentesco') || k.includes('relacion')) {
        emergencyRelationship = valStr;
      } else if (k.includes('motivo') || k.includes('consulta') || k.includes('diagnostico') || k.includes('razon')) {
        reason = valStr;
      } else if (k.includes('estado') || k.includes('estatus') || k === 'status') {
        statusRaw = valStr;
      } else if (k.includes('etiqueta') || k.includes('tag') || k.includes('categoria')) {
        tagsRaw = valStr;
      }
    }

    // Process & validate
    const cleanPhoneVal = normalizePhone(phone);
    const cleanEmail = email ? email.toLowerCase().trim() : '';
    const cleanBirthDate = normalizeDate(birthDateRaw);
    const cleanGender = normalizeGender(genderRaw);
    const cleanStatus = normalizeStatus(statusRaw);
    const tags = tagsRaw
      ? tagsRaw.split(/[,;|]/).map(t => t.trim()).filter(Boolean)
      : [];

    let isValid = true;
    let validationError = '';

    if (!name || name.toLowerCase() === 'nombre' || name.toLowerCase() === 'nombre completo') {
      isValid = false;
      validationError = 'Nombre del paciente obligatorio';
    } else if (!cleanPhoneVal && !cleanEmail) {
      isValid = false;
      validationError = 'Requiere al menos un teléfono o correo de contacto';
    }

    const patientRow: ParsedPatientRow = {
      name,
      phone: cleanPhoneVal || phone,
      email: cleanEmail,
      birth_date: cleanBirthDate,
      gender: cleanGender,
      occupation: occupation || null,
      emergency_contact_name: emergencyName || null,
      emergency_contact_phone: normalizePhone(emergencyPhone) || null,
      emergency_contact_relationship: emergencyRelationship || null,
      reason_for_consultation: reason || null,
      status: cleanStatus,
      tags,
      isValid,
      validationError,
      originalRow: row
    };

    if (isValid) {
      validPatients.push(patientRow);
    } else {
      invalidRows.push(patientRow);
    }
  }

  return {
    totalRows: rawRows.length,
    validPatients,
    invalidRows,
    headers
  };
}
