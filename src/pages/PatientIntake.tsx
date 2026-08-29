import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import SignaturePad from '@/components/consent/SignaturePad';
import { 
  User, 
  Calendar as CalendarIcon, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  AlertCircle, 
  Loader2, 
  HeartHandshake,
  FileCheck,
  Sparkles,
  Lock
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface IntakeContext {
  appointment: {
    id: string;
    start_time: string;
    end_time: string;
    type: string;
    modality: string;
    location: string | null;
    status: string;
    patient_name: string;
    intake_completed: boolean;
    intake_completed_at: string | null;
    patient_age: number | null;
    reason_for_consultation: string | null;
    notes?: string | null;
  };
  specialist: {
    id: string;
    full_name: string;
    title_prefix: string | null;
    avatar_url: string | null;
    slug: string;
  };
  organization: {
    id: string;
    name: string;
    logo_url: string | null;
  };
  patient?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    birth_date: string | null;
    gender: string | null;
    occupation: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
    reason_for_consultation: string | null;
  } | null;
}

const GENDER_OPTIONS = [
  { value: 'femenino', label: 'Femenino' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'no_binario', label: 'No binario' },
  { value: 'otro', label: 'Otro' },
  { value: 'prefiero_no_decir', label: 'Prefiero no especificar' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'pareja', label: 'Pareja / Cónyuge' },
  { value: 'madre', label: 'Madre' },
  { value: 'padre', label: 'Padre' },
  { value: 'hermano_a', label: 'Hermano / Hermana' },
  { value: 'hijo_a', label: 'Hijo / Hija' },
  { value: 'familiar', label: 'Otro familiar' },
  { value: 'amigo_a', label: 'Amigo / Amiga' },
  { value: 'otro', label: 'Otro contacto' },
];

export default function PatientIntake() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loadingContext, setLoadingContext] = useState(true);
  const [context, setContext] = useState<IntakeContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form State
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [occupation, setOccupation] = useState('');

  // Emergency Contact
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');

  // Reason for consultation
  const [reason, setReason] = useState('');
  const [hadPreviousTherapy, setHadPreviousTherapy] = useState<'si' | 'no' | ''>('');

  // Signature & Consent
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('Enlace de ingreso no válido.');
      setLoadingContext(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoadingContext(true);
        const { data, error } = await supabase.rpc('get_intake_context', {
          p_token: token,
        });

        if (error) throw error;
        if (!data || !data.success) {
          throw new Error(data?.error || 'No se pudo cargar la información de la cita.');
        }

        const ctx = data as IntakeContext;
        setContext(ctx);

        // Pre-fill fields
        setName(ctx.patient?.name || ctx.appointment.patient_name || '');
        setEmail(ctx.patient?.email || '');
        setPhone(ctx.patient?.phone || '');
        setBirthDate(ctx.patient?.birth_date || '');
        setGender(ctx.patient?.gender || '');
        setOccupation(ctx.patient?.occupation || '');
        setEmergencyName(ctx.patient?.emergency_contact_name || '');
        setEmergencyPhone(ctx.patient?.emergency_contact_phone || '');
        setEmergencyRelationship(ctx.patient?.emergency_contact_relationship || '');
        setReason(ctx.patient?.reason_for_consultation || ctx.appointment.reason_for_consultation || '');

        // If email or phone are empty in patient, try to extract from notes
        if (!ctx.patient?.email && ctx.appointment.notes) {
          const emailMatch = ctx.appointment.notes.match(/Email:\s*([^\s\n]+)/i);
          if (emailMatch && emailMatch[1]) setEmail(emailMatch[1]);
          const phoneMatch = ctx.appointment.notes.match(/Teléfono:\s*([^\s\n]+)/i);
          if (phoneMatch && phoneMatch[1]) setPhone(phoneMatch[1]);
        }

        if (ctx.appointment.intake_completed) {
          setStep(5); // Already completed
        }
      } catch (err: unknown) {
        const error = err as Error;
        console.error('Error fetching intake context:', error);
        setLoadError(error.message || 'El enlace es inválido o ha caducado.');
      } finally {
        setLoadingContext(false);
      }
    };

    loadData();
  }, [token]);

  const validateStep1 = () => {
    if (!name.trim()) {
      toast.error('Por favor ingresa tu nombre completo.');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Por favor ingresa un correo electrónico válido.');
      return false;
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
      toast.error('Por favor ingresa un número de teléfono a 10 dígitos.');
      return false;
    }
    if (!birthDate) {
      toast.error('Por favor selecciona tu fecha de nacimiento.');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!emergencyName.trim()) {
      toast.error('Por favor ingresa el nombre de tu contacto de emergencia.');
      return false;
    }
    if (!emergencyPhone.trim() || emergencyPhone.replace(/\D/g, '').length < 10) {
      toast.error('Por favor ingresa el teléfono de tu contacto de emergencia.');
      return false;
    }
    if (!emergencyRelationship) {
      toast.error('Por favor selecciona tu relación o parentesco con este contacto.');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!reason.trim()) {
      toast.error('Por favor describe brevemente el motivo principal de tu consulta.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!consentAccepted) {
      toast.error('Debes aceptar el Aviso de Privacidad y Consentimiento.');
      return;
    }
    if (!signatureDataUrl) {
      toast.error('Por favor firma en el recuadro antes de continuar.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Calculate SHA-256 hash for legal signature integrity
      const encoder = new TextEncoder();
      const data = encoder.encode(signatureDataUrl);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const fullReasonText = hadPreviousTherapy 
        ? `${reason}\n\n[Historial: ${hadPreviousTherapy === 'si' ? 'Ha recibido terapia psicológica previa' : 'Primera vez en terapia psicológica'}]`
        : reason;

      const consentLegalText = `AVISO DE PRIVACIDAD Y CONSENTIMIENTO INFORMADO PARA ATENCIÓN PSICOLÓGICA
En cumplimiento con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y la Norma Oficial Mexicana NOM-024-SSA3-2012 para Sistemas de Información de Registro Electrónico para la Salud.

Yo, ${name.trim()}, manifiesto libre y voluntariamente que:
1. He sido informado(a) sobre la naturaleza del proceso terapéutico y los objetivos de la atención psicológica.
2. Autorizo el tratamiento de mis datos personales y clínicos exclusivamente para fines de diagnóstico, seguimiento y atención terapéutica.
3. Se me ha informado sobre el secreto profesional y la estricta confidencialidad de la información compartida, con las excepciones que marca la ley en caso de riesgo inminente para mi integridad o la de terceros.
4. He proporcionado a mi entera voluntad los datos de un contacto de emergencia para ser utilizado en caso de contingencia o crisis.

Fecha y hora de firma electrónica: ${new Date().toISOString()}
Firma del Paciente: Registrada digitalmente`;

      const { data: resData, error } = await supabase.rpc('submit_patient_intake', {
        p_token: token,
        p_name: name.trim(),
        p_email: email.trim().toLowerCase(),
        p_phone: phone.trim(),
        p_birth_date: birthDate,
        p_gender: gender || null,
        p_occupation: occupation.trim() || null,
        p_emergency_contact_name: emergencyName.trim(),
        p_emergency_contact_phone: emergencyPhone.trim(),
        p_emergency_contact_relationship: emergencyRelationship,
        p_reason_for_consultation: fullReasonText,
        p_consent_text: consentLegalText,
        p_signature_data_url: signatureDataUrl,
        p_signature_hash: hashHex,
      });

      if (error) throw error;
      if (!resData || !resData.success) {
        throw new Error(resData?.error || 'No se pudo guardar la ficha de ingreso.');
      }

      // Auto login into patient portal session
      if (resData.portal_session) {
        const sessionPayload = {
          isLoggedIn: true,
          accessToken: resData.portal_session.accessToken,
          email: resData.portal_session.email,
          phone: resData.portal_session.phone,
          name: resData.portal_session.name,
          expiresAt: resData.portal_session.expiresAt,
        };
        localStorage.setItem('saudade_patient_session', JSON.stringify(sessionPayload));
      }

      toast.success('¡Ficha de ingreso y consentimiento registrados con éxito!');
      setStep(5);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error submitting intake:', error);
      toast.error(error.message || 'Ocurrió un error al enviar el formulario. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingContext) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFCFB] p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">
            Cargando tu ficha de ingreso...
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !context) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFCFB] p-4 font-sans">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl shadow-sm border-border/60">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold mb-2">Enlace no disponible</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {loadError || 'Este enlace de ingreso ya no es válido o ha expirado.'}
          </p>
          <Button 
            className="w-full rounded-xl"
            onClick={() => navigate('/portal/login')}
          >
            Ir al Portal del Paciente
          </Button>
        </Card>
      </div>
    );
  }

  const specialistDisplayName = context.specialist.title_prefix && context.specialist.title_prefix !== 'none'
    ? `${context.specialist.title_prefix} ${context.specialist.full_name}`
    : context.specialist.full_name;

  const appointmentDate = parseISO(context.appointment.start_time);

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-foreground flex flex-col font-sans selection:bg-primary/20">
      {/* Top Professional Header */}
      <header className="py-4 bg-white/80 backdrop-blur border-b border-border/50 px-4 md:px-8 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm tracking-tighter">
              S.
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-sm md:text-base leading-tight">
                Ficha de Ingreso Clínico
              </span>
              <span className="text-[11px] text-muted-foreground">
                {context.organization.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] py-1 border-primary/20 bg-primary/5 text-primary font-medium flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Conexión Segura</span>
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 py-6 md:py-10">
        {/* Appointment Context Summary Banner */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-primary/5 via-slate-50 to-muted/20 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            {context.specialist.avatar_url ? (
              <img
                src={context.specialist.avatar_url}
                alt={specialistDisplayName}
                className="w-12 h-12 rounded-full object-cover border border-white shadow-xs"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <User className="w-6 h-6" />
              </div>
            )}
            <div>
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Tu Especialista
              </span>
              <h4 className="text-sm font-bold text-foreground leading-snug">
                {specialistDisplayName}
              </h4>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <CalendarIcon className="w-3 h-3 text-primary" />
                <span>{format(appointmentDate, "EEEE, d 'de' MMMM", { locale: es })}</span>
                <span>·</span>
                <Clock className="w-3 h-3 text-primary" />
                <span>{format(appointmentDate, 'HH:mm')} hrs</span>
              </p>
            </div>
          </div>

          <Badge variant="secondary" className="self-start sm:self-center font-medium capitalize text-xs">
            {context.appointment.modality === 'online' ? '🌐 En línea' : '📍 Presencial'}
          </Badge>
        </div>

        {/* Step Progress Indicator (when not on step 5) */}
        {step !== 5 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Paso {step} de 4
              </span>
              <span className="text-xs text-muted-foreground">
                {step === 1 && 'Datos Personales'}
                {step === 2 && 'Contacto de Emergencia'}
                {step === 3 && 'Motivo de Consulta'}
                {step === 4 && 'Firma y Consentimiento'}
              </span>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-muted/40 h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden animate-fade-in">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                <span>1. Datos Personales</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Información básica requerida para la apertura de tu expediente clínico según la NOM-024-SSA3-2012.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold">
                  Nombre completo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre y apellidos"
                  className="rounded-xl h-11"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">
                    Correo electrónico <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="rounded-xl h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold">
                    Teléfono celular (WhatsApp) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10 dígitos (ej. 5512345678)"
                    className="rounded-xl h-11"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="birthDate" className="text-xs font-semibold">
                    Fecha de nacimiento <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="birthDate"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="rounded-xl h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="gender" className="text-xs font-semibold">
                    Género
                  </Label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Selecciona una opción</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="occupation" className="text-xs font-semibold">
                  Ocupación o profesión
                </Label>
                <Input
                  id="occupation"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="Ej. Estudiante, Diseñador, Médico..."
                  className="rounded-xl h-11"
                />
              </div>
            </CardContent>
            <CardFooter className="p-6 bg-muted/10 border-t border-border/40 flex justify-end">
              <Button
                onClick={() => {
                  if (validateStep1()) setStep(2);
                }}
                className="rounded-xl font-semibold gap-2 px-6 h-11"
              >
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 2: Emergency Contact */}
        {step === 2 && (
          <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden animate-fade-in">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-rose-500" />
                <span>2. Contacto de Emergencia</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Por protocolo clínico y seguridad en salud mental, requerimos los datos de una persona de tu confianza ante cualquier eventualidad médica o de crisis.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="emergencyName" className="text-xs font-semibold">
                  Nombre completo del contacto <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="emergencyName"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder="Nombre de tu familiar o persona de confianza"
                  className="rounded-xl h-11"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="emergencyPhone" className="text-xs font-semibold">
                    Teléfono del contacto <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="emergencyPhone"
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="10 dígitos del contacto"
                    className="rounded-xl h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emergencyRelationship" className="text-xs font-semibold">
                    Parentesco o relación <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="emergencyRelationship"
                    value={emergencyRelationship}
                    onChange={(e) => setEmergencyRelationship(e.target.value)}
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Selecciona parentesco</option>
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 flex items-start gap-2.5 mt-4">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Esta persona <strong>solo será contactada</strong> en caso de una urgencia médica o situación de crisis imprevista. No recibirá notificaciones ni información confidencial de tus sesiones.
                </p>
              </div>
            </CardContent>
            <CardFooter className="p-6 bg-muted/10 border-t border-border/40 flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="rounded-xl gap-2 h-11"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Atrás</span>
              </Button>
              <Button
                onClick={() => {
                  if (validateStep2()) setStep(3);
                }}
                className="rounded-xl font-semibold gap-2 px-6 h-11"
              >
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 3: Consultation Reason */}
        {step === 3 && (
          <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden animate-fade-in">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <span>3. Motivo de Consulta</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Ayuda a tu especialista a comprender tus expectativas y preparar tu primera sesión.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="reason" className="text-xs font-semibold">
                  ¿Qué te motivó a solicitar esta consulta? <span className="text-destructive">*</span>
                </Label>
                <textarea
                  id="reason"
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe brevemente lo que estás experimentando o lo que te gustaría trabajar en consulta..."
                  className="w-full rounded-xl border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">
                  ¿Has asistido a terapia psicológica anteriormente?
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setHadPreviousTherapy('si')}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                      hadPreviousTherapy === 'si'
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                        : 'border-input bg-background text-muted-foreground hover:bg-muted/10'
                    }`}
                  >
                    Sí, he llevado terapia antes
                  </button>
                  <button
                    type="button"
                    onClick={() => setHadPreviousTherapy('no')}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                      hadPreviousTherapy === 'no'
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                        : 'border-input bg-background text-muted-foreground hover:bg-muted/10'
                    }`}
                  >
                    No, es mi primera vez
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-6 bg-muted/10 border-t border-border/40 flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                className="rounded-xl gap-2 h-11"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Atrás</span>
              </Button>
              <Button
                onClick={() => {
                  if (validateStep3()) setStep(4);
                }}
                className="rounded-xl font-semibold gap-2 px-6 h-11"
              >
                <span>Continuar a Firma</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 4: Legal Consent & E-Signature */}
        {step === 4 && (
          <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden animate-fade-in">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                <span>4. Consentimiento Informado & Firma</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Aviso de Privacidad (LFPDPPP) y Consentimiento de Atención Psicológica.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Scrollable Legal Box */}
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 max-h-48 overflow-y-auto text-xs text-muted-foreground space-y-2 leading-relaxed">
                <p className="font-semibold text-foreground">
                  Aviso de Privacidad y Consentimiento de Atención
                </p>
                <p>
                  En cumplimiento con la <strong>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</strong> y la <strong>Norma Oficial Mexicana NOM-024-SSA3-2012</strong>, tus datos personales, de contacto y notas clínicas serán resguardados con los más estrictos estándares de confidencialidad, secreto profesional y seguridad digital.
                </p>
                <p>
                  1. <strong>Confidencialidad:</strong> Toda la información compartida durante las sesiones es confidencial y no será revelada a terceros sin tu consentimiento por escrito, excepto en las situaciones expresamente previstas por la legislación mexicana (riesgo inminente de daño para ti o terceras personas).
                </p>
                <p>
                  2. <strong>Contacto de Emergencia:</strong> Autorizas el uso del contacto de emergencia únicamente en caso de crisis médica o riesgo grave a la salud.
                </p>
                <p>
                  3. <strong>Firma Digital:</strong> Tu firma electrónica en este formulario tiene plena validez jurídica conforme al Código de Comercio y la legislación aplicable en materia de mensajes de datos y expedientes de salud.
                </p>
              </div>

              {/* Checkbox */}
              <label className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-background hover:bg-muted/10 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mt-0.5"
                />
                <span className="text-xs leading-normal">
                  He leído, comprendo y <strong>acepto los términos</strong> del Aviso de Privacidad y el Consentimiento Informado para la atención psicológica.
                </span>
              </label>

              {/* Signature Canvas */}
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>Firma Electrónica (Dibuja con tu dedo o ratón) <span className="text-destructive">*</span></span>
                  {signatureDataUrl && (
                    <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Firma capturada
                    </span>
                  )}
                </Label>

                <SignaturePad
                  onSign={(dataUrl) => setSignatureDataUrl(dataUrl)}
                  onClear={() => setSignatureDataUrl(null)}
                  height={150}
                />
              </div>
            </CardContent>
            <CardFooter className="p-6 bg-muted/10 border-t border-border/40 flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep(3)}
                disabled={isSubmitting}
                className="rounded-xl gap-2 h-11"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Atrás</span>
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !consentAccepted || !signatureDataUrl}
                className="rounded-xl font-bold gap-2 px-8 h-11 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    <span>Guardando expediente...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Firmar y Finalizar</span>
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 5: Success & Auto Login */}
        {step === 5 && (
          <Card className="border-border/60 shadow-sm rounded-3xl p-8 md:p-12 text-center animate-fade-in bg-white">
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold mb-2 text-foreground tracking-tight">
              ¡Ficha de Ingreso Completada!
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-8">
              Tu expediente y consentimiento han sido registrados de forma segura. {specialistDisplayName} ya tiene acceso a tu información para su próxima sesión.
            </p>

            <div className="p-5 rounded-2xl border border-border/50 bg-muted/10 max-w-md mx-auto text-left mb-8 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <span className="text-xs text-muted-foreground font-medium">Paciente</span>
                <span className="text-xs font-bold text-foreground">{name}</span>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <span className="text-xs text-muted-foreground font-medium">Cita Programada</span>
                <span className="text-xs font-bold text-foreground">
                  {format(appointmentDate, "d 'de' MMMM, HH:mm", { locale: es })} hrs
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Estado del Expediente</span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                  Completado y Firmado ✓
                </Badge>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <Button
                onClick={() => navigate('/portal')}
                className="w-full rounded-xl font-bold h-12 gap-2 bg-primary hover:bg-primary/95 text-white shadow-sm"
              >
                <span>Acceder a Mi Portal de Paciente</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
