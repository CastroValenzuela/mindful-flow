import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  CalendarIcon, 
  Clock, 
  LogOut, 
  Loader2, 
  User, 
  XCircle, 
  AlertTriangle, 
  BrainCircuit, 
  CheckCircle2, 
  ArrowRight, 
  FileText, 
  Check,
  FileSignature,
  Download,
  Video,
  CheckSquare,
  HeartHandshake,
  Sparkles,
  Shield,
  Save,
  Phone,
  Mail,
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  History,
  Calendar,
  MapPin,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  FileCheck
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { psychometricTests } from '@/lib/psychometricTests';
import jsPDF from 'jspdf';
import SignaturePad from '@/components/consent/SignaturePad';

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  type: string;
  modality?: string;
  location?: string | null;
  meeting_platform?: string | null;
  fee?: number | string | null;
  payment_status?: string | null;
  specialist_name: string;
  specialist_avatar: string | null;
  specialist_prefix: string | null;
  management_token: string;
  reschedule_policy_hours?: number | null;
  meeting_link?: string | null;
}

interface PatientTaskItem {
  id: string;
  task: string;
  completed: boolean;
  assigned_date: string;
}

interface PatientTest {
  id: string;
  test_type: string;
  token: string;
  status: 'pending' | 'completed' | 'scored';
  score?: number | null;
  interpretation?: string | null;
  created_at: string;
  completed_at?: string | null;
}

interface PatientSession {
  isLoggedIn: boolean;
  accessToken: string;
  email: string;
  phone: string;
  name: string;
  expiresAt: string;
}

interface PatientProfileData {
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
  created_at: string;
}

interface ConsentRecord {
  id: string;
  form_type: 'general' | 'tratamiento' | 'datos_personales';
  signed_at: string | null;
  is_valid: boolean;
  consent_text: string;
  signature_data_url: string | null;
  signature_hash: string | null;
  created_at: string;
  specialist_name: string | null;
  specialist_prefix: string | null;
  specialist_logo_data: string | null;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  general: 'Consentimiento General',
  tratamiento: 'Tratamiento Psicológico',
  datos_personales: 'Aviso de Privacidad y Datos Personales'
};

function getRelativeDateBadge(date: Date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { label: 'Hoy', variant: 'bg-emerald-500 text-white font-bold animate-pulse' };
  if (diffDays === 1) return { label: 'Mañana', variant: 'bg-primary text-white font-bold' };
  if (diffDays === 2) return { label: 'En 2 días', variant: 'bg-sky-100 text-sky-800 border border-sky-200' };
  if (diffDays > 2 && diffDays <= 7) return { label: `En ${diffDays} días`, variant: 'bg-muted text-muted-foreground' };
  if (diffDays === -1) return { label: 'Ayer', variant: 'bg-muted/60 text-muted-foreground' };
  if (diffDays < -1) return { label: `Hace ${Math.abs(diffDays)} días`, variant: 'bg-muted/60 text-muted-foreground' };
  return null;
}

export default function Portal() {
  const navigate = useNavigate();
  const [session, setSession] = useState<PatientSession | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [assignedTests, setAssignedTests] = useState<PatientTest[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [patientTasks, setPatientTasks] = useState<PatientTaskItem[]>([]);
  const [patientProfile, setPatientProfile] = useState<PatientProfileData | null>(null);
  
  // Navigation & Filtering States
  const [activeTab, setActiveTab] = useState<'appointments' | 'tasks' | 'tests' | 'consents' | 'profile'>('appointments');
  const [searchTerm, setSearchTerm] = useState('');
  const [appointmentFilter, setAppointmentFilter] = useState<'upcoming' | 'past' | 'cancelled' | 'all'>('upcoming');
  const [taskFilter, setTaskFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [testFilter, setTestFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [consentFilter, setConsentFilter] = useState<'pending' | 'signed' | 'all'>('pending');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem('portal_view_mode') as 'grid' | 'list') || 'grid');
  const [sortBy, setSortBy] = useState<'date_asc' | 'date_desc'>('date_asc');

  // Loading States
  const [loading, setLoading] = useState(true);
  const [loadingTests, setLoadingTests] = useState(false);
  const [loadingConsents, setLoadingConsents] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({
    birth_date: '',
    gender: '',
    occupation: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    reason_for_consultation: ''
  });

  const handleSetViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('portal_view_mode', mode);
  };

  const toggleTaskCompletion = (taskId: string) => {
    setPatientTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
    toast.success('Estado de la tarea actualizado');
  };

  // Signing states
  const [signingConsent, setSigningConsent] = useState<ConsentRecord | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false);

  useEffect(() => {
    const savedSession = localStorage.getItem('saudade_patient_session');
    if (!savedSession) {
      navigate('/portal/login');
      return;
    }

    const parsedSession: PatientSession = JSON.parse(savedSession);
    
    if (!parsedSession.isLoggedIn || !parsedSession.accessToken) {
      navigate('/portal/login');
      return;
    }

    if (parsedSession.expiresAt && new Date(parsedSession.expiresAt) < new Date()) {
      localStorage.removeItem('saudade_patient_session');
      toast.error('Tu sesión ha expirado. Por favor inicia sesión de nuevo.');
      navigate('/portal/login');
      return;
    }

    setSession(parsedSession);
    fetchAppointments(parsedSession.accessToken);
    fetchPatientTests(parsedSession.accessToken);
    fetchPatientConsents(parsedSession.accessToken);
    fetchPatientTasks(parsedSession.accessToken);
    fetchPatientProfile(parsedSession.accessToken);
  }, [navigate]);

  const fetchPatientProfile = async (accessToken: string) => {
    setLoadingProfile(true);
    try {
      const { data, error } = await supabase.rpc('get_patient_profile', {
        p_access_token: accessToken
      });
      if (error) throw error;
      if (data?.success && data.patient) {
        setPatientProfile(data.patient);
        setProfileForm({
          birth_date: data.patient.birth_date || '',
          gender: data.patient.gender || '',
          occupation: data.patient.occupation || '',
          emergency_contact_name: data.patient.emergency_contact_name || '',
          emergency_contact_phone: data.patient.emergency_contact_phone || '',
          emergency_contact_relationship: data.patient.emergency_contact_relationship || '',
          reason_for_consultation: data.patient.reason_for_consultation || ''
        });
      }
    } catch (err: unknown) {
      console.warn('Error fetching patient profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setIsSavingProfile(true);
    try {
      const { data, error } = await supabase.rpc('update_patient_profile', {
        p_access_token: session.accessToken,
        p_birth_date: profileForm.birth_date || null,
        p_gender: profileForm.gender || null,
        p_occupation: profileForm.occupation || null,
        p_emergency_contact_name: profileForm.emergency_contact_name || null,
        p_emergency_contact_phone: profileForm.emergency_contact_phone || null,
        p_emergency_contact_relationship: profileForm.emergency_contact_relationship || null,
        p_reason_for_consultation: profileForm.reason_for_consultation || null
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'No se pudo actualizar el perfil');

      toast.success('Perfil actualizado correctamente');
      await fetchPatientProfile(session.accessToken);
    } catch (err: any) {
      console.error('Error updating patient profile:', err);
      toast.error(err.message || 'Error al actualizar perfil');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fetchPatientTasks = async (accessToken: string) => {
    setLoadingTasks(true);
    try {
      const { data, error } = await supabase.rpc('get_patient_tasks', {
        p_access_token: accessToken
      });
      if (!error && data && Array.isArray(data)) {
        setPatientTasks(data);
      } else {
        setPatientTasks([]);
      }
    } catch (err: unknown) {
      console.warn('Error fetching patient tasks:', err);
      setPatientTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchAppointments = async (accessToken: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_patient_appointments', {
        p_access_token: accessToken
      });

      if (error) {
        if (error.message.includes('invalid') || error.code === 'PGRST202') {
          localStorage.removeItem('saudade_patient_session');
          navigate('/portal/login');
          return;
        }
        throw error;
      }
      
      const sorted = (data || []).sort((a: Appointment, b: Appointment) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
      setAppointments(sorted);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(error);
      toast.error('Error al cargar tus citas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientTests = async (accessToken: string) => {
    setLoadingTests(true);
    try {
      const { data, error } = await supabase.rpc('get_patient_tests', {
        p_access_token: accessToken
      });

      if (error) throw error;
      setAssignedTests(data || []);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error fetching patient tests:', error);
      toast.error('Error al cargar tus pruebas clínicas.');
    } finally {
      setLoadingTests(false);
    }
  };

  const fetchPatientConsents = async (accessToken: string) => {
    setLoadingConsents(true);
    try {
      const { data, error } = await supabase.rpc('get_patient_consents', {
        p_access_token: accessToken
      });

      if (error) throw error;
      setConsents(data || []);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error fetching patient consents:', error);
      toast.error('Error al cargar tus documentos.');
    } finally {
      setLoadingConsents(false);
    }
  };

  const handleCancelAppointment = async (id: string, managementToken: string) => {
    if (!confirm('¿Estás seguro de que deseas cancelar esta cita?')) return;
    setCancelingId(id);
    try {
      const { data, error } = await supabase.rpc('cancel_appointment_by_token', {
        p_management_token: managementToken,
        p_reason: 'Cancelado por el paciente desde el portal'
      });

      if (error) throw error;
      if (data && !data.success) {
        throw new Error(data.error || 'No se pudo cancelar la cita.');
      }

      toast.success('Cita cancelada con éxito.');
      if (session) fetchAppointments(session.accessToken);
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || 'Error al cancelar la cita.');
    } finally {
      setCancelingId(null);
    }
  };

  const handleSignConsent = async () => {
    if (!signatureDataUrl || !signingConsent || !session) {
      toast.error('Por favor dibuja tu firma antes de continuar.');
      return;
    }

    setIsSubmittingSignature(true);
    try {
      const cryptoObj = window.crypto || (window as any).msCrypto;
      const encoder = new TextEncoder();
      const data = encoder.encode(signatureDataUrl + Date.now().toString());
      const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const signatureHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const { data: resData, error } = await supabase.rpc('sign_patient_consent', {
        p_access_token: session.accessToken,
        p_consent_id: signingConsent.id,
        p_signature_data_url: signatureDataUrl,
        p_signature_hash: signatureHash
      });

      if (error) throw error;

      toast.success('Documento firmado y registrado exitosamente');
      setSigningConsent(null);
      setSignatureDataUrl(null);
      fetchPatientConsents(session.accessToken);
    } catch (err: any) {
      console.error('Error signing consent:', err);
      toast.error('Error al firmar: ' + err.message);
    } finally {
      setIsSubmittingSignature(false);
    }
  };

  const generateConsentPDF = (consent: ConsentRecord) => {
    const doc = new jsPDF();
    doc.setFont('helvetica');

    // Header Branding
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text('Saudade', 20, 25);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Plataforma de Gestión e Inteligencia Clínica', 20, 32);
    doc.text('Alineado con la NOM-024-SSA3-2012', 20, 37);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 42, 190, 42);

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const formTitle = FORM_TYPE_LABELS[consent.form_type] || consent.form_type.toUpperCase();
    doc.text(formTitle, 20, 52);

    // Metadata Table
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Paciente: ${session?.name || 'Paciente'}`, 20, 62);
    doc.text(`Especialista: ${consent.specialist_name || 'Especialista'}`, 20, 68);
    const dateFormatted = consent.signed_at 
      ? format(parseISO(consent.signed_at), "d 'de' MMMM, yyyy HH:mm 'hrs'", { locale: es }) 
      : 'Pendiente de firma';
    doc.text(`Fecha y Hora de Firma: ${dateFormatted}`, 20, 74);

    doc.line(20, 80, 190, 80);

    // Body
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const splitText = doc.splitTextToSize(consent.consent_text, 170);
    doc.text(splitText, 20, 90);

    let finalY = 90 + (splitText.length * 5) + 15;
    if (finalY > 220) {
      doc.addPage();
      finalY = 30;
    }

    // Signature Area
    if (consent.signature_data_url) {
      doc.addImage(consent.signature_data_url, 'PNG', 20, finalY, 60, 25);
      doc.line(20, finalY + 27, 85, finalY + 27);
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text('Firma Digital del Paciente', 20, finalY + 32);

      if (consent.signature_hash) {
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`Sello Criptográfico SHA-256: ${consent.signature_hash}`, 20, finalY + 38);
      }
    }

    doc.save(`Consentimiento_${consent.form_type}_${session?.name?.replace(/\s+/g, '_') || 'Paciente'}.pdf`);
  };

  const handleLogout = () => {
    localStorage.removeItem('saudade_patient_session');
    navigate('/portal/login');
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFCFB]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── FILTERED DATA COMPUTATION ──────────────────────────────────────────────

  // 1. Appointments counts & filtered list
  const upcomingApts = appointments.filter(a => a.status !== 'cancelled' && parseISO(a.start_time) >= new Date());
  const pastApts = appointments.filter(a => a.status !== 'cancelled' && parseISO(a.start_time) < new Date());
  const cancelledApts = appointments.filter(a => a.status === 'cancelled');

  const filteredAppointments = appointments.filter(apt => {
    const dateObj = parseISO(apt.start_time);
    const isPast = dateObj < new Date() && apt.status !== 'cancelled';
    const isUpcoming = dateObj >= new Date() && apt.status !== 'cancelled';
    const isCancelled = apt.status === 'cancelled';

    if (appointmentFilter === 'upcoming' && !isUpcoming) return false;
    if (appointmentFilter === 'past' && !isPast) return false;
    if (appointmentFilter === 'cancelled' && !isCancelled) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const sName = (apt.specialist_name || '').toLowerCase();
      const type = (apt.type || '').toLowerCase();
      const modality = (apt.modality || '').toLowerCase();
      const dateFormatted = format(dateObj, "d 'de' MMMM yyyy", { locale: es }).toLowerCase();
      if (!sName.includes(q) && !type.includes(q) && !modality.includes(q) && !dateFormatted.includes(q)) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    const timeA = new Date(a.start_time).getTime();
    const timeB = new Date(b.start_time).getTime();
    if (sortBy === 'date_asc') return timeA - timeB;
    return timeB - timeA;
  });

  // 2. Tasks filtered list
  const pendingTasks = patientTasks.filter(t => !t.completed);
  const completedTasks = patientTasks.filter(t => t.completed);
  const filteredTasks = patientTasks.filter(t => {
    if (taskFilter === 'pending' && t.completed) return false;
    if (taskFilter === 'completed' && !t.completed) return false;
    if (searchTerm.trim() && !t.task.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // 3. Tests filtered list
  const pendingTests = assignedTests.filter(t => t.status === 'pending');
  const completedTests = assignedTests.filter(t => t.status === 'completed' || t.status === 'scored');
  const filteredTests = assignedTests.filter(t => {
    if (testFilter === 'pending' && t.status !== 'pending') return false;
    if (testFilter === 'completed' && t.status === 'pending') return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const testCatalog = psychometricTests[t.test_type];
      const testName = (testCatalog ? testCatalog.name : t.test_type).toLowerCase();
      if (!testName.includes(q)) return false;
    }
    return true;
  });

  // 4. Consents filtered list
  const pendingConsents = consents.filter(c => !c.signed_at);
  const signedConsents = consents.filter(c => !!c.signed_at);
  const filteredConsents = consents.filter(c => {
    if (consentFilter === 'pending' && !!c.signed_at) return false;
    if (consentFilter === 'signed' && !c.signed_at) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const label = (FORM_TYPE_LABELS[c.form_type] || c.form_type).toLowerCase();
      const sName = (c.specialist_name || '').toLowerCase();
      if (!label.includes(q) && !sName.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-foreground flex flex-col font-sans">
      {/* Top Header */}
      <header className="py-3.5 bg-white border-b border-border/50 px-4 md:px-8 flex items-center justify-between sticky top-0 z-20 w-full backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-base shadow-xs">
            S.
          </div>
          <div>
            <span className="font-extrabold tracking-tight text-base text-foreground block leading-none">
              Saudade
            </span>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Portal del Paciente
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-bold text-foreground">{session.name}</span>
            <span className="text-[11px] text-muted-foreground">{session.email}</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLogout} 
            className="rounded-xl text-xs gap-1.5 font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 px-3"
            title="Cerrar Sesión"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 py-6 md:py-8">
        
        {/* Navigation Tabs Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-border/50 pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-1 text-foreground">
              {activeTab === 'appointments' 
                ? 'Mis Citas' 
                : activeTab === 'tests' 
                ? 'Mis Evaluaciones' 
                : activeTab === 'tasks'
                ? 'Mis Tareas'
                : activeTab === 'consents'
                ? 'Mis Documentos'
                : 'Mi Perfil Clínico'}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {activeTab === 'appointments' 
                ? 'Consulta tus próximas sesiones, unirte a videollamadas y revisar tu historial de atención.' 
                : activeTab === 'tests'
                ? 'Resuelve tus evaluaciones psicométricas asignadas y revisa tus resultados históricos.'
                : activeTab === 'tasks'
                ? 'Consulta tus ejercicios y tareas recomendadas por tu especialista entre sesiones.'
                : activeTab === 'consents'
                ? 'Revisa y firma de forma remota tus avisos de privacidad y consentimientos informados.'
                : 'Mantén actualizados tus datos de contacto, emergencia y motivo de consulta.'}
            </p>
          </div>

          <div className="flex gap-1.5 bg-muted/20 p-1.5 rounded-2xl border border-border/40 shrink-0 self-start sm:self-center flex-wrap">
            <button
              onClick={() => { setActiveTab('appointments'); setSearchTerm(''); }}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-bold rounded-xl transition-all ${
                activeTab === 'appointments'
                  ? 'bg-white text-primary shadow-xs border border-border/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/10'
              }`}
            >
              <CalendarIcon className="h-4 w-4" />
              <span>Mis Citas</span>
              {upcomingApts.length > 0 && (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => { setActiveTab('tasks'); setSearchTerm(''); }}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-bold rounded-xl transition-all relative ${
                activeTab === 'tasks'
                  ? 'bg-white text-primary shadow-xs border border-border/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/10'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              <span>Tareas</span>
              {pendingTasks.length > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-emerald-600 text-[10px] font-bold text-white px-1 shadow-xs">
                  {pendingTasks.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('tests'); setSearchTerm(''); }}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-bold rounded-xl transition-all relative ${
                activeTab === 'tests'
                  ? 'bg-white text-primary shadow-xs border border-border/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/10'
              }`}
            >
              <BrainCircuit className="h-4 w-4" />
              <span>Pruebas</span>
              {pendingTests.length > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-[10px] font-bold text-white px-1 shadow-xs animate-bounce">
                  {pendingTests.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('consents'); setSearchTerm(''); }}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-bold rounded-xl transition-all relative ${
                activeTab === 'consents'
                  ? 'bg-white text-primary shadow-xs border border-border/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/10'
              }`}
            >
              <FileSignature className="h-4 w-4" />
              <span>Documentos</span>
              {pendingConsents.length > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-amber-500 text-[10px] font-bold text-white px-1 shadow-xs animate-pulse">
                  {pendingConsents.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('profile'); setSearchTerm(''); }}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-bold rounded-xl transition-all relative ${
                activeTab === 'profile'
                  ? 'bg-white text-primary shadow-xs border border-border/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/10'
              }`}
            >
              <User className="h-4 w-4" />
              <span>Mi Perfil</span>
            </button>
          </div>
        </div>

        {/* ── TOOLBAR (SEARCH, STATUS FILTERS, SORT, VIEW MODE TOGGLE) ────────── */}
        {activeTab !== 'profile' && (
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mb-6 bg-white p-3.5 rounded-2xl border border-border/60 shadow-xs animate-fade-in">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              {activeTab === 'appointments' && (
                <>
                  <button
                    onClick={() => setAppointmentFilter('upcoming')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      appointmentFilter === 'upcoming'
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span>Próximas</span>
                    <Badge variant={appointmentFilter === 'upcoming' ? 'outline' : 'secondary'} className={`text-[10px] px-1.5 py-0 h-4 border-white/30 ${appointmentFilter === 'upcoming' ? 'text-white' : ''}`}>
                      {upcomingApts.length}
                    </Badge>
                  </button>

                  <button
                    onClick={() => setAppointmentFilter('past')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      appointmentFilter === 'past'
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span>Historial / Pasadas</span>
                    <Badge variant={appointmentFilter === 'past' ? 'outline' : 'secondary'} className={`text-[10px] px-1.5 py-0 h-4 border-white/30 ${appointmentFilter === 'past' ? 'text-white' : ''}`}>
                      {pastApts.length}
                    </Badge>
                  </button>

                  <button
                    onClick={() => setAppointmentFilter('cancelled')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      appointmentFilter === 'cancelled'
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span>Canceladas</span>
                    <Badge variant={appointmentFilter === 'cancelled' ? 'outline' : 'secondary'} className={`text-[10px] px-1.5 py-0 h-4 border-white/30 ${appointmentFilter === 'cancelled' ? 'text-white' : ''}`}>
                      {cancelledApts.length}
                    </Badge>
                  </button>

                  <button
                    onClick={() => setAppointmentFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      appointmentFilter === 'all'
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span>Todas</span>
                    <Badge variant={appointmentFilter === 'all' ? 'outline' : 'secondary'} className={`text-[10px] px-1.5 py-0 h-4 border-white/30 ${appointmentFilter === 'all' ? 'text-white' : ''}`}>
                      {appointments.length}
                    </Badge>
                  </button>
                </>
              )}

              {activeTab === 'tasks' && (
                <>
                  <button
                    onClick={() => setTaskFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      taskFilter === 'pending' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Pendientes</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{pendingTasks.length}</Badge>
                  </button>

                  <button
                    onClick={() => setTaskFilter('completed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      taskFilter === 'completed' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Completadas</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{completedTasks.length}</Badge>
                  </button>

                  <button
                    onClick={() => setTaskFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      taskFilter === 'all' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Todas</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{patientTasks.length}</Badge>
                  </button>
                </>
              )}

              {activeTab === 'tests' && (
                <>
                  <button
                    onClick={() => setTestFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      testFilter === 'pending' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Por Resolver</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{pendingTests.length}</Badge>
                  </button>

                  <button
                    onClick={() => setTestFilter('completed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      testFilter === 'completed' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Histórico / Resueltas</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{completedTests.length}</Badge>
                  </button>

                  <button
                    onClick={() => setTestFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      testFilter === 'all' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Todas</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{assignedTests.length}</Badge>
                  </button>
                </>
              )}

              {activeTab === 'consents' && (
                <>
                  <button
                    onClick={() => setConsentFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      consentFilter === 'pending' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Por Firmar</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{pendingConsents.length}</Badge>
                  </button>

                  <button
                    onClick={() => setConsentFilter('signed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      consentFilter === 'signed' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Firmados</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{signedConsents.length}</Badge>
                  </button>

                  <button
                    onClick={() => setConsentFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      consentFilter === 'all' ? 'bg-primary text-white' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>Todos</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{consents.length}</Badge>
                  </button>
                </>
              )}
            </div>

            {/* Right: Search, Sort, and View Mode */}
            <div className="flex items-center gap-2 justify-end">
              {/* Search */}
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-8 text-xs rounded-xl bg-muted/20 border-border/50 focus:bg-white"
                />
              </div>

              {/* Sort button (for appointments) */}
              {activeTab === 'appointments' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortBy(sortBy === 'date_asc' ? 'date_desc' : 'date_asc')}
                  className="h-9 px-2.5 rounded-xl text-xs gap-1 font-medium border-border/60 text-muted-foreground hover:text-foreground shrink-0"
                  title={sortBy === 'date_asc' ? 'Ordenar: Más próximas primero' : 'Ordenar: Más recientes primero'}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{sortBy === 'date_asc' ? 'Próximas' : 'Recientes'}</span>
                </Button>
              )}

              {/* View Mode Toggle */}
              <div className="flex items-center bg-muted/20 p-0.5 rounded-xl border border-border/50 shrink-0">
                <button
                  onClick={() => handleSetViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'grid' ? 'bg-white text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Vista en Cuadrícula"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleSetViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'list' ? 'bg-white text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Vista en Lista Detallada"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── APPOINTMENTS TAB ────────────────────────────────────────────────── */}
        {activeTab === 'appointments' && (
          loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAppointments.length === 0 ? (
            <Card className="p-12 text-center rounded-2xl border-dashed bg-muted/10 shadow-none">
              <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-lg font-bold mb-1">No se encontraron citas</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchTerm 
                  ? 'No hay citas que coincidan con tu búsqueda.' 
                  : appointmentFilter === 'upcoming' 
                  ? 'No tienes citas próximas agendadas.' 
                  : appointmentFilter === 'past'
                  ? 'No tienes citas en tu historial.'
                  : 'Actualmente no tienes citas registradas.'}
              </p>
            </Card>
          ) : viewMode === 'grid' ? (
            /* GRID VIEW */
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 animate-fade-in">
              {filteredAppointments.map(apt => {
                const dateObj = parseISO(apt.start_time);
                const endObj = parseISO(apt.end_time);
                const isPast = dateObj < new Date() && apt.status !== 'cancelled';
                const relBadge = !isPast && apt.status !== 'cancelled' ? getRelativeDateBadge(dateObj) : null;
                
                const policyHours = apt.reschedule_policy_hours !== undefined && apt.reschedule_policy_hours !== null 
                  ? apt.reschedule_policy_hours 
                  : 12;
                
                const isExpired = (dateObj.getTime() - new Date().getTime()) < policyHours * 60 * 60 * 1000;
                
                let statusText = 'Confirmada';
                let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
                if (apt.status === 'pending') { statusText = 'Pendiente'; badgeVariant = 'secondary'; }
                if (apt.status === 'cancelled') { statusText = 'Cancelada'; badgeVariant = 'destructive'; }
                if (isPast) { statusText = 'Completada'; badgeVariant = 'outline'; }

                const pName = apt.specialist_prefix && apt.specialist_prefix !== 'none' 
                  ? `${apt.specialist_prefix} ${apt.specialist_name}` 
                  : apt.specialist_name;

                return (
                  <Card key={apt.id} className={`rounded-2xl overflow-hidden shadow-xs flex flex-col border-border/60 transition-all hover:shadow-md ${
                    isPast ? 'bg-muted/10 opacity-90' : 'bg-white'
                  }`}>
                    <CardHeader className="p-5 pb-0">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-xl ${isPast ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                            <CalendarIcon className="w-4 h-4" />
                          </div>
                          {relBadge && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${relBadge.variant}`}>
                              {relBadge.label}
                            </span>
                          )}
                        </div>
                        <Badge variant={badgeVariant} className="font-semibold text-xs">{statusText}</Badge>
                      </div>

                      <CardTitle className="text-base font-bold mb-1 leading-snug">
                        {format(dateObj, "EEEE, d 'de' MMMM", { locale: es })}
                      </CardTitle>
                      <CardDescription className="text-xs flex items-center gap-1.5 text-foreground/80 font-medium">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        {format(dateObj, "HH:mm")} - {format(endObj, "HH:mm")} hrs
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="p-5 pt-3 flex-1 flex flex-col justify-between">
                      {/* Specialist Info */}
                      <div className="flex items-center gap-3 pt-3 border-t border-border/40">
                        {apt.specialist_avatar ? (
                          <img src={apt.specialist_avatar} alt={pName} className="w-9 h-9 rounded-full object-cover border" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                            {pName.charAt(0)}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">ESPECIALISTA</span>
                          <span className="text-xs font-bold leading-tight text-foreground truncate">{pName}</span>
                          <span className="text-[11px] text-muted-foreground truncate">{apt.type}</span>
                        </div>
                      </div>

                      {/* Modality Badge */}
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {apt.modality === 'online' || apt.meeting_link ? (
                          <>
                            <Video className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Videollamada ({apt.meeting_platform || 'En línea'})</span>
                          </>
                        ) : (
                          <>
                            <MapPin className="w-3.5 h-3.5 text-sky-600" />
                            <span className="truncate">{apt.location || 'Consultorio'}</span>
                          </>
                        )}
                      </div>

                      {apt.status !== 'cancelled' && !isPast && isExpired && (
                        <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-2 text-[11px] text-amber-800 leading-normal">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                          <span>Límite de cancelación ({policyHours}h) cumplido.</span>
                        </div>
                      )}
                    </CardContent>
                    
                    {apt.status !== 'cancelled' && !isPast && (
                      <CardFooter className="p-3.5 bg-muted/10 border-t border-border/40 flex flex-col gap-2">
                        {apt.meeting_link && (
                          <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 text-xs h-9 rounded-xl shadow-xs"
                            onClick={() => {
                              if (apt.meeting_link?.startsWith('http')) {
                                window.open(apt.meeting_link, '_blank');
                              } else {
                                window.open(`${window.location.origin}${apt.meeting_link}`, '_blank');
                              }
                            }}
                          >
                            <Video className="w-3.5 h-3.5" />
                            Unirse a Videollamada
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-8 rounded-xl"
                          onClick={() => handleCancelAppointment(apt.id, apt.management_token)}
                          disabled={isExpired || cancelingId === apt.id}
                        >
                          {cancelingId === apt.id ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Cancelar Cita
                        </Button>
                      </CardFooter>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            /* LIST / TABLE VIEW */
            <div className="bg-white rounded-2xl border border-border/60 overflow-hidden shadow-xs animate-fade-in divide-y divide-border/40">
              {filteredAppointments.map(apt => {
                const dateObj = parseISO(apt.start_time);
                const endObj = parseISO(apt.end_time);
                const isPast = dateObj < new Date() && apt.status !== 'cancelled';
                const relBadge = !isPast && apt.status !== 'cancelled' ? getRelativeDateBadge(dateObj) : null;
                const pName = apt.specialist_prefix && apt.specialist_prefix !== 'none' 
                  ? `${apt.specialist_prefix} ${apt.specialist_name}` 
                  : apt.specialist_name;

                let statusText = 'Confirmada';
                let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
                if (apt.status === 'pending') { statusText = 'Pendiente'; badgeVariant = 'secondary'; }
                if (apt.status === 'cancelled') { statusText = 'Cancelada'; badgeVariant = 'destructive'; }
                if (isPast) { statusText = 'Completada'; badgeVariant = 'outline'; }

                return (
                  <div key={apt.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                    {/* Left: Date Box & Info */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Date Badge */}
                      <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex flex-col items-center justify-center shrink-0 border border-primary/20">
                        <span className="text-base font-black leading-none">{format(dateObj, 'd')}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">{format(dateObj, 'MMM', { locale: es })}</span>
                      </div>

                      {/* Details */}
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-foreground truncate">{apt.type}</span>
                          <Badge variant={badgeVariant} className="text-[10px] py-0 px-1.5 font-semibold">{statusText}</Badge>
                          {relBadge && (
                            <span className={`text-[10px] px-1.5 py-0 rounded-full font-bold uppercase ${relBadge.variant}`}>
                              {relBadge.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{format(dateObj, "HH:mm")} - {format(endObj, "HH:mm")} hrs</span>
                          <span>•</span>
                          <span>Esp. {pName}</span>
                          <span>•</span>
                          <span>{apt.modality === 'online' || apt.meeting_link ? '🌐 En línea' : `📍 ${apt.location || 'Presencial'}`}</span>
                        </p>
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-2 w-full md:w-auto justify-end shrink-0">
                      {apt.status !== 'cancelled' && !isPast && apt.meeting_link && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 rounded-xl gap-1.5 shadow-xs"
                          onClick={() => {
                            if (apt.meeting_link?.startsWith('http')) {
                              window.open(apt.meeting_link, '_blank');
                            } else {
                              window.open(`${window.location.origin}${apt.meeting_link}`, '_blank');
                            }
                          }}
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Unirse</span>
                        </Button>
                      )}

                      {apt.status !== 'cancelled' && !isPast && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive text-xs h-8 rounded-xl"
                          onClick={() => handleCancelAppointment(apt.id, apt.management_token)}
                          disabled={cancelingId === apt.id}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          <span>Cancelar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── TASKS TAB ───────────────────────────────────────────────────────── */}
        {activeTab === 'tasks' && (
          loadingTasks ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <Card className="p-12 text-center rounded-2xl border-dashed bg-muted/10 shadow-none">
              <CheckSquare className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-lg font-bold mb-1">No se encontraron tareas</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchTerm 
                  ? 'No hay tareas que coincidan con tu búsqueda.' 
                  : taskFilter === 'pending'
                  ? '¡Excelente! No tienes tareas pendientes.'
                  : 'Tu especialista no te ha asignado tareas en esta categoría.'}
              </p>
            </Card>
          ) : (
            <div className="bg-white rounded-2xl border border-border/60 p-5 shadow-xs animate-fade-in space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {taskFilter === 'pending' ? 'Tareas Pendientes' : taskFilter === 'completed' ? 'Tareas Completadas' : 'Todas las Tareas'}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {filteredTasks.length} {filteredTasks.length === 1 ? 'tarea' : 'tareas'}
                </span>
              </div>

              <div className="space-y-2.5">
                {filteredTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => toggleTaskCompletion(t.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                      t.completed
                        ? 'bg-emerald-50/40 border-emerald-200 text-muted-foreground'
                        : 'bg-muted/10 border-border/60 hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-5 w-5 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        t.completed ? 'bg-emerald-600 text-white' : 'border-2 border-border bg-white'
                      }`}>
                        {t.completed && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>
                      <span className={`text-xs md:text-sm font-medium leading-relaxed ${t.completed ? 'line-through opacity-70' : 'text-foreground'}`}>
                        {t.task}
                      </span>
                    </div>

                    <Badge variant={t.completed ? 'outline' : 'default'} className={`text-[10px] uppercase font-bold shrink-0 ${
                      t.completed ? 'border-emerald-500/40 text-emerald-700 bg-emerald-50' : 'bg-emerald-600 text-white'
                    }`}>
                      {t.completed ? 'Completada' : 'Pendiente'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {/* ── TESTS TAB ───────────────────────────────────────────────────────── */}
        {activeTab === 'tests' && (
          loadingTests ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredTests.length === 0 ? (
            <Card className="p-12 text-center rounded-2xl border-dashed bg-muted/10 shadow-none">
              <BrainCircuit className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-lg font-bold mb-1">No se encontraron evaluaciones</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchTerm 
                  ? 'No hay pruebas que coincidan con tu búsqueda.' 
                  : testFilter === 'pending'
                  ? 'No tienes evaluaciones psicométricas pendientes por responder.'
                  : 'No tienes evaluaciones registradas en esta categoría.'}
              </p>
            </Card>
          ) : viewMode === 'grid' ? (
            /* TESTS GRID */
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 animate-fade-in">
              {filteredTests.map(test => {
                const testCatalog = psychometricTests[test.test_type];
                const testName = testCatalog ? testCatalog.name : test.test_type.toUpperCase();
                const testDescription = testCatalog ? testCatalog.description : 'Evaluación psicométrica asignada por tu especialista.';
                const isPending = test.status === 'pending';

                return (
                  <Card key={test.id} className="rounded-2xl overflow-hidden shadow-xs flex flex-col border-border/60 bg-white hover:shadow-md transition-shadow">
                    <CardHeader className="p-5 pb-0">
                      <div className="flex justify-between items-start mb-3">
                        <div className={`p-2 rounded-xl ${isPending ? 'bg-primary/10 text-primary' : 'bg-emerald-50 text-emerald-600'}`}>
                          <BrainCircuit className="w-4 h-4" />
                        </div>
                        <Badge variant={isPending ? 'secondary' : 'outline'} className={`text-xs font-semibold ${
                          isPending ? 'text-primary bg-primary/10' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}>
                          {isPending ? 'Por Resolver' : 'Completada'}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-bold mb-1 leading-snug">
                        {testName}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-between">
                      <p className="text-xs text-muted-foreground leading-normal mb-3 line-clamp-3">
                        {testDescription}
                      </p>
                      
                      {!isPending && test.score !== undefined && test.score !== null && (
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-between text-xs text-emerald-900 mb-2">
                          <span className="font-bold">Puntuación:</span>
                          <span className="font-extrabold bg-white px-2 py-0.5 rounded-lg border border-emerald-200">
                            {test.score} pts
                          </span>
                        </div>
                      )}

                      <span className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
                        Asignada: {format(parseISO(test.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                      </span>
                    </CardContent>

                    <CardFooter className="p-3.5 bg-muted/10 border-t border-border/40">
                      {isPending ? (
                        <Button 
                          className="w-full gap-1.5 bg-primary hover:bg-primary/95 text-white font-bold text-xs h-9 rounded-xl shadow-xs"
                          onClick={() => window.open(`/t/${test.token}`, '_blank')}
                        >
                          <span>Resolver Evaluación</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button 
                          variant="outline"
                          className="w-full gap-1.5 text-xs h-9 rounded-xl font-semibold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => window.open(`/t/${test.token}`, '_blank')}
                        >
                          <span>Ver Respuestas</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* TESTS LIST */
            <div className="bg-white rounded-2xl border border-border/60 overflow-hidden shadow-xs animate-fade-in divide-y divide-border/40">
              {filteredTests.map(test => {
                const testCatalog = psychometricTests[test.test_type];
                const testName = testCatalog ? testCatalog.name : test.test_type.toUpperCase();
                const isPending = test.status === 'pending';

                return (
                  <div key={test.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl shrink-0 ${isPending ? 'bg-primary/10 text-primary' : 'bg-emerald-50 text-emerald-600'}`}>
                        <BrainCircuit className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-foreground">{testName}</span>
                          <Badge variant={isPending ? 'secondary' : 'outline'} className={`text-[10px] py-0 px-1.5 ${
                            isPending ? 'text-primary bg-primary/10' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`}>
                            {isPending ? 'Por Resolver' : 'Completada'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Asignada el {format(parseISO(test.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                      <Button
                        size="sm"
                        variant={isPending ? 'default' : 'outline'}
                        className={`text-xs h-8 rounded-xl font-bold gap-1.5 ${
                          isPending ? 'bg-primary hover:bg-primary/95 text-white' : 'border-emerald-200 text-emerald-700'
                        }`}
                        onClick={() => window.open(`/t/${test.token}`, '_blank')}
                      >
                        <span>{isPending ? 'Resolver' : 'Ver'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── CONSENTS TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'consents' && (
          loadingConsents ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredConsents.length === 0 ? (
            <Card className="p-12 text-center rounded-2xl border-dashed bg-muted/10 shadow-none">
              <FileSignature className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-lg font-bold mb-1">No se encontraron documentos</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchTerm 
                  ? 'No hay documentos que coincidan con tu búsqueda.' 
                  : consentFilter === 'pending'
                  ? 'No tienes consentimientos pendientes de firma.'
                  : 'No tienes documentos en esta categoría.'}
              </p>
            </Card>
          ) : viewMode === 'grid' ? (
            /* CONSENTS GRID */
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 animate-fade-in">
              {filteredConsents.map(consent => {
                const isSigned = !!consent.signed_at;
                const specialistName = consent.specialist_prefix && consent.specialist_prefix !== 'none'
                  ? `${consent.specialist_prefix} ${consent.specialist_name}`
                  : consent.specialist_name || 'Especialista';

                return (
                  <Card key={consent.id} className={`rounded-2xl overflow-hidden shadow-xs flex flex-col border-border/60 ${
                    isSigned ? 'bg-white' : 'bg-amber-50/20 border-amber-200'
                  }`}>
                    <CardHeader className="p-5 pb-0">
                      <div className="flex justify-between items-start mb-3">
                        <div className={`p-2 rounded-xl ${isSigned ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-100 text-amber-700'}`}>
                          <FileSignature className="w-4 h-4" />
                        </div>
                        <Badge variant={isSigned ? 'outline' : 'secondary'} className={`text-xs font-semibold ${
                          isSigned ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isSigned ? 'Firmado' : 'Firma Pendiente'}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-bold mb-1 leading-snug">
                        {FORM_TYPE_LABELS[consent.form_type] || consent.form_type}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        Especialista: <span className="font-medium text-foreground">{specialistName}</span>
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="p-5 pt-3 flex-1 flex flex-col justify-between">
                      <p className="text-xs text-muted-foreground leading-normal mb-3 line-clamp-3">
                        {consent.consent_text}
                      </p>

                      {isSigned && consent.signature_hash && (
                        <div className="p-2 rounded-lg bg-muted/20 text-[10px] text-muted-foreground font-mono truncate mb-2">
                          SHA-256: {consent.signature_hash.slice(0, 16)}...
                        </div>
                      )}

                      <span className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
                        {isSigned 
                          ? `Firmado el ${format(parseISO(consent.signed_at!), "d 'de' MMMM, yyyy", { locale: es })}`
                          : `Solicitado el ${format(parseISO(consent.created_at), "d 'de' MMMM, yyyy", { locale: es })}`}
                      </span>
                    </CardContent>

                    <CardFooter className="p-3.5 bg-muted/10 border-t border-border/40">
                      {isSigned ? (
                        <Button 
                          variant="outline"
                          className="w-full gap-1.5 text-xs h-9 rounded-xl font-bold border-border/60 hover:bg-muted/20"
                          onClick={() => generateConsentPDF(consent)}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Descargar PDF</span>
                        </Button>
                      ) : (
                        <Button 
                          className="w-full gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 rounded-xl shadow-xs"
                          onClick={() => {
                            setSigningConsent(consent);
                            setSignatureDataUrl(null);
                          }}
                        >
                          <span>Leer y Firmar</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* CONSENTS LIST */
            <div className="bg-white rounded-2xl border border-border/60 overflow-hidden shadow-xs animate-fade-in divide-y divide-border/40">
              {filteredConsents.map(consent => {
                const isSigned = !!consent.signed_at;
                const specialistName = consent.specialist_prefix && consent.specialist_prefix !== 'none'
                  ? `${consent.specialist_prefix} ${consent.specialist_name}`
                  : consent.specialist_name || 'Especialista';

                return (
                  <div key={consent.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl shrink-0 ${isSigned ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-100 text-amber-700'}`}>
                        <FileSignature className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-foreground">{FORM_TYPE_LABELS[consent.form_type] || consent.form_type}</span>
                          <Badge variant={isSigned ? 'outline' : 'secondary'} className={`text-[10px] py-0 px-1.5 ${
                            isSigned ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isSigned ? 'Firmado' : 'Por Firmar'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {isSigned 
                            ? `Firmado el ${format(parseISO(consent.signed_at!), "d 'de' MMM, yyyy", { locale: es })}`
                            : `Solicitado por ${specialistName}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                      {isSigned ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 rounded-xl font-semibold gap-1.5"
                          onClick={() => generateConsentPDF(consent)}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8 rounded-xl font-bold gap-1.5"
                          onClick={() => {
                            setSigningConsent(consent);
                            setSignatureDataUrl(null);
                          }}
                        >
                          <span>Firmar</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── PROFILE TAB ─────────────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          loadingProfile ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
              <Card className="rounded-3xl border-border/60 shadow-sm overflow-hidden bg-white">
                <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b border-border/40">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-lg shadow-sm">
                      {session.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold">{session.name}</CardTitle>
                      <CardDescription className="text-xs text-muted-foreground mt-0.5">
                        Expediente Confidencial de Paciente
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 md:p-8">
                  <form onSubmit={handleSaveProfile} className="space-y-6">
                    {/* Readonly Basic Contact */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-muted/20 border border-border/40">
                      <div>
                        <Label className="text-xs text-muted-foreground">Correo Registrado</Label>
                        <div className="text-sm font-semibold text-foreground mt-1 flex items-center gap-1.5">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{session.email}</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Teléfono Registrado</Label>
                        <div className="text-sm font-semibold text-foreground mt-1 flex items-center gap-1.5">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{session.phone || 'No registrado'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Personal Demographic Data */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <User className="h-4 w-4" /> Datos Demográficos
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Fecha de Nacimiento</Label>
                          <Input
                            type="date"
                            value={profileForm.birth_date}
                            onChange={e => setProfileForm(prev => ({ ...prev, birth_date: e.target.value }))}
                            className="rounded-xl h-10 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Género</Label>
                          <select
                            value={profileForm.gender}
                            onChange={e => setProfileForm(prev => ({ ...prev, gender: e.target.value }))}
                            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs"
                          >
                            <option value="">Selecciona una opción</option>
                            <option value="femenino">Femenino</option>
                            <option value="masculino">Masculino</option>
                            <option value="no_binario">No binario</option>
                            <option value="otro">Otro / Prefiero no decir</option>
                          </select>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-xs">Ocupación / Profesión</Label>
                          <Input
                            placeholder="Ej. Diseñador, Estudiante, etc."
                            value={profileForm.occupation}
                            onChange={e => setProfileForm(prev => ({ ...prev, occupation: e.target.value }))}
                            className="rounded-xl h-10 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Emergency Contact */}
                    <div className="space-y-4 pt-4 border-t border-border/40">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <HeartHandshake className="h-4 w-4" /> Contacto de Emergencia
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-xs">Nombre de Persona de Confianza</Label>
                          <Input
                            placeholder="Nombre completo"
                            value={profileForm.emergency_contact_name}
                            onChange={e => setProfileForm(prev => ({ ...prev, emergency_contact_name: e.target.value }))}
                            className="rounded-xl h-10 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Teléfono de Emergencia</Label>
                          <Input
                            placeholder="10 dígitos"
                            value={profileForm.emergency_contact_phone}
                            onChange={e => setProfileForm(prev => ({ ...prev, emergency_contact_phone: e.target.value }))}
                            className="rounded-xl h-10 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Parentesco / Relación</Label>
                          <select
                            value={profileForm.emergency_contact_relationship}
                            onChange={e => setProfileForm(prev => ({ ...prev, emergency_contact_relationship: e.target.value }))}
                            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs"
                          >
                            <option value="">Selecciona relación</option>
                            <option value="pareja">Pareja / Cónyuge</option>
                            <option value="madre">Madre</option>
                            <option value="padre">Padre</option>
                            <option value="hermano_a">Hermano / Hermana</option>
                            <option value="hijo_a">Hijo / Hija</option>
                            <option value="familiar">Familiar</option>
                            <option value="amigo_a">Amigo / Amiga</option>
                            <option value="otro">Otro</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="space-y-1.5 pt-4 border-t border-border/40">
                      <Label className="text-xs">Motivo Principal de Consulta</Label>
                      <textarea
                        rows={3}
                        placeholder="Describe brevemente tus principales motivos de atención..."
                        value={profileForm.reason_for_consultation}
                        onChange={e => setProfileForm(prev => ({ ...prev, reason_for_consultation: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-input bg-background text-xs resize-none"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSavingProfile}
                      className="w-full rounded-xl font-bold h-11 text-xs gap-2 bg-primary hover:bg-primary/95 text-white shadow-sm"
                    >
                      {isSavingProfile ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Guardando cambios...</span>
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          <span>Guardar y Actualizar Perfil</span>
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )
        )}
      </main>

      {/* ── MODAL: SIGN CONSENT ───────────────────────────────────────────────── */}
      {signingConsent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <Card className="max-w-xl w-full rounded-3xl overflow-hidden shadow-2xl border-border/60 bg-white max-h-[90vh] flex flex-col">
            <CardHeader className="p-6 border-b border-border/40">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <Badge variant="outline" className="text-[10px] font-bold text-amber-700 bg-amber-50 border-amber-200">
                    Firma Electrónica NOM-024
                  </Badge>
                  <CardTitle className="text-lg font-bold text-foreground">
                    {FORM_TYPE_LABELS[signingConsent.form_type] || signingConsent.form_type}
                  </CardTitle>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSigningConsent(null)} className="rounded-full">
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-6 overflow-y-auto space-y-4 text-xs leading-relaxed text-muted-foreground">
              <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 max-h-48 overflow-y-auto whitespace-pre-wrap">
                {signingConsent.consent_text}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground">Dibuja tu firma digital abajo:</Label>
                <div className="border border-border/60 rounded-2xl overflow-hidden bg-[#FAFAFA]">
                  <SignaturePad
                    onSign={(dataUrl) => setSignatureDataUrl(dataUrl)}
                    onClear={() => setSignatureDataUrl(null)}
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="p-5 bg-muted/10 border-t border-border/40 flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setSigningConsent(null)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                disabled={!signatureDataUrl || isSubmittingSignature}
                onClick={handleSignConsent}
                className="rounded-xl font-bold text-xs gap-2 bg-primary hover:bg-primary/95 text-white"
              >
                {isSubmittingSignature ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Registrando firma...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4" />
                    <span>Aceptar y Firmar Digitalmente</span>
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
