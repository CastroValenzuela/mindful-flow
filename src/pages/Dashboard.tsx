import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import TodayAgenda from '@/components/dashboard/TodayAgenda';
import RevenueChart from '@/components/dashboard/RevenueChart';
import ActivityHeatmap from '@/components/dashboard/ActivityHeatmap';
import OnboardingModal from '@/components/dashboard/OnboardingModal';
import { Appointment } from '@/types';
import {
  DollarSign,
  Users,
  TrendingUp,
  Calendar,
  AlertCircle,
  FileText,
  ArrowRight,
  Plus,
  Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useOrganization } from '@/hooks/useOrganization';
import { checkReactivations } from '@/lib/reactivationService';

// ── Tipos locales ────────────────────────────────────────────────────────────
interface DashboardAppointment {
  id: string;
  patientId?: string;
  patientName: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'confirmed' | 'pending' | 'cancelled' | 'completed';
  type: string;
  phone?: string | null;
  paymentStatus?: 'paid' | 'pending' | 'refunded';
  fee?: number;
  modality?: 'online' | 'in_person';
  meetingUrl?: string | null;
}

interface DashboardNote {
  id: string;
  patientName: string;
  format: string;
  content: string;
  createdAt: string;
}

interface RevenuePoint {
  name: string;
  ingresos: number;
  sesiones: number;
}

interface DashboardStats {
  monthlyRevenue: number;
  previousMonthRevenue: number;
  activePatients: number;
  newPatientsThisMonth: number;
  todayAppointmentsCount: number;
  confirmedToday: number;
  pendingToday: number;
  completedSessions: number;
  totalMonthAppointmentsCount: number;
  pendingPayments: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ── Componente ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayAppts, setTodayAppts] = useState<DashboardAppointment[]>([]);
  const [recentNotes, setRecentNotes] = useState<DashboardNote[]>([]);
  const [chartData, setChartData] = useState<RevenuePoint[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Editable monthly session goal
  const [sessionGoal, setSessionGoal] = useState<number>(() => {
    const saved = localStorage.getItem('saudade_session_goal');
    return saved ? parseInt(saved, 10) : 40;
  });
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [goalInput, setGoalInput] = useState(sessionGoal.toString());

  const handleSaveGoal = () => {
    const parsed = parseInt(goalInput, 10);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Ingresa una meta válida mayor a 0');
      return;
    }
    setSessionGoal(parsed);
    localStorage.setItem('saudade_session_goal', parsed.toString());
    toast.success(`Meta mensual actualizada a ${parsed} sesiones`);
    setIsGoalDialogOpen(false);
  };

  const fetchAll = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();
      const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString();
      const prevMonthEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString();

      // Fetch en paralelo
      const [
        patientsRes,
        newPatientsRes,
        monthApptsRes,
        prevMonthApptsRes,
        todayDataRes,
        notesRes,
        chartRawRes
      ] = await Promise.all([
        supabase.from('patients').select('*', { count: 'exact', head: true }).eq('organization_id', organization.id).is('deleted_at', null),
        supabase.from('patients').select('*', { count: 'exact', head: true }).eq('organization_id', organization.id).gte('created_at', monthStart).lte('created_at', monthEnd).is('deleted_at', null),
        supabase.from('appointments').select('*').eq('organization_id', organization.id).gte('start_time', monthStart).lte('start_time', monthEnd),
        supabase.from('appointments').select('*').eq('organization_id', organization.id).gte('start_time', prevMonthStart).lte('start_time', prevMonthEnd),
        supabase.from('appointments').select('id, patient_id, patient_name, start_time, end_time, status, type, payment_status, fee, modality, location, meeting_url, phone').eq('organization_id', organization.id).gte('start_time', todayStart).lte('start_time', todayEnd),
        supabase.from('session_notes').select('id, patient_name, session_number, agenda, created_at').eq('organization_id', organization.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(3),
        supabase.from('appointments').select('*').eq('organization_id', organization.id).gte('start_time', startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1)).toISOString()).lte('start_time', monthEnd),
      ]);

      const patientsCount = patientsRes && 'count' in patientsRes ? patientsRes.count : 0;
      const newPatientsCount = newPatientsRes && 'count' in newPatientsRes ? newPatientsRes.count : 0;
      const monthAppts = monthApptsRes && 'data' in monthApptsRes ? monthApptsRes.data : [];
      const prevMonthAppts = prevMonthApptsRes && 'data' in prevMonthApptsRes ? prevMonthApptsRes.data : [];
      const todayData = todayDataRes && 'data' in todayDataRes ? todayDataRes.data : [];
      const notes = notesRes && 'data' in notesRes ? notesRes.data : [];
      const chartRaw = chartRawRes && 'data' in chartRawRes ? chartRawRes.data : [];

      // ── Stats ────────────────────────────────────────────────────────────────
      const monthlyRevenue = (monthAppts ?? [])
        .filter(a => a && a.payment_status === 'paid')
        .reduce((sum, a) => sum + (Number(a.fee) || 0), 0);

      const previousMonthRevenue = (prevMonthAppts ?? [])
        .filter(a => a && a.payment_status === 'paid')
        .reduce((sum, a) => sum + (Number(a.fee) || 0), 0);

      const pendingPayments = (monthAppts ?? [])
        .filter(a => a && a.payment_status === 'pending')
        .reduce((sum, a) => sum + (Number(a.fee) || 0), 0);

      // Helper para determinar si una cita cuenta como sesión completada
      const isApptCompleted = (a: any) => {
        if (!a || !a.start_time || a.status === 'cancelled') return false;
        if (a.status === 'completed' || a.status === 'attended') return true;
        // Citas no canceladas cuyo horario de inicio ya transcurrió
        const apptTime = new Date(a.start_time).getTime();
        return !isNaN(apptTime) && apptTime <= Date.now();
      };

      const completedSessions = (monthAppts ?? [])
        .filter(isApptCompleted).length;

      const totalMonthAppointmentsCount = (monthAppts ?? [])
        .filter(a => a && a.status !== 'cancelled').length;

      const confirmedToday = (todayData ?? []).filter(a => a && a.status === 'confirmed').length;
      const pendingToday = (todayData ?? []).filter(a => a && a.status === 'pending').length;

      setStats({
        monthlyRevenue,
        previousMonthRevenue,
        activePatients: patientsCount ?? 0,
        newPatientsThisMonth: newPatientsCount ?? 0,
        todayAppointmentsCount: todayData?.length ?? 0,
        completedSessions,
        totalMonthAppointmentsCount,
        confirmedToday,
        pendingToday,
        pendingPayments,
      });

      // ── Agenda del día ────────────────────────────────────────────────────────
      setTodayAppts((todayData ?? []).map(a => ({
        id: a.id,
        patientId: a.patient_id,
        patientName: a.patient_name ?? 'Paciente',
        startTime: a.start_time,
        endTime: a.end_time,
        status: (a.status || 'scheduled') as DashboardAppointment['status'],
        type: a.type ?? 'Consulta',
        phone: a.phone ?? null,
        paymentStatus: (a.payment_status || 'pending') as DashboardAppointment['paymentStatus'],
        fee: a.fee ? Number(a.fee) : 0,
        modality: (a.modality || 'in_person') as DashboardAppointment['modality'],
        meetingUrl: a.meeting_url || null,
      })));

      // ── Notas recientes ───────────────────────────────────────────────────────
      setRecentNotes((notes ?? []).map(n => {
        const agenda = n.agenda as unknown as { topic: string }[] | null;
        return {
          id: n.id,
          patientName: n.patient_name ?? 'Paciente',
          format: `Sesión #${n.session_number ?? 1}`,
          content: Array.isArray(agenda) ? agenda.map(a => a.topic).filter(Boolean).join(' · ') : '',
          createdAt: n.created_at,
        };
      }));

      // ── Gráfico: últimos 6 meses ──────────────────────────────────────────────
      const monthMap: Record<string, { ingresos: number; sesiones: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = MONTH_NAMES[d.getMonth()];
        monthMap[key] = { ingresos: 0, sesiones: 0 };
      }
      (chartRaw ?? []).forEach(appt => {
        if (!appt || !appt.start_time) return;
        const d = new Date(appt.start_time);
        if (isNaN(d.getTime())) return;
        const month = MONTH_NAMES[d.getMonth()];
        if (!monthMap[month]) return;
        if (appt.payment_status === 'paid') monthMap[month].ingresos += Number(appt.fee) || 0;
        if (isApptCompleted(appt)) monthMap[month].sesiones += 1;
      });
      setChartData(Object.entries(monthMap).map(([name, v]) => ({ name, ...v })));
      setAllAppointments((chartRaw ?? []) as Appointment[]);
    } catch (err) {
      console.error('Error al cargar datos del dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    if (organization?.id) {
      fetchAll();
      if (user?.id) {
        checkReactivations(user.id, organization.id).catch(e => console.error('Error checkReactivations:', e));
      }
    }
  }, [user?.id, organization?.id, fetchAll]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Buenos días';
    if (h >= 12 && h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const revenueGrowth = stats && stats.previousMonthRevenue > 0
    ? Math.round(((stats.monthlyRevenue - stats.previousMonthRevenue) / stats.previousMonthRevenue) * 100)
    : 0;

  const SESSION_GOAL = 40;

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
        
        {/* 1. Header Minimalista */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {getGreeting()}, {user?.user_metadata?.full_name?.split(' ')[0] || 'Doctor'}
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              Resumen general de tu práctica clínica.
            </p>
          </div>
        </header>

        <OnboardingModal />

        {/* 2. Bento Box Grid Principal */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 auto-rows-min gap-4">
          
          {/* --- ROW 1: 4 KPIs (1x1 each) --- */}
          {/* KPI: Ingresos (1x1) */}
          <div 
            className="col-span-1 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer" 
            onClick={() => navigate('/finance')}
            role="button" 
            tabIndex={0}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl">
                <DollarSign className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 px-2.5 py-1 rounded-full">
                {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth}%
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-500 mb-1">Ingresos del Mes</p>
            <h3 className="text-3xl font-extrabold tracking-tight">
               {loading ? <Skeleton className="h-8 w-24" /> : `$${(stats?.monthlyRevenue ?? 0).toLocaleString()}`}
            </h3>
          </div>

          {/* KPI: Pacientes (1x1) */}
          <div 
            className="col-span-1 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer" 
            onClick={() => navigate('/patients')}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-500 mb-1">Pacientes Activos</p>
            <h3 className="text-3xl font-extrabold tracking-tight">
               {loading ? <Skeleton className="h-8 w-16" /> : stats?.activePatients ?? 0}
            </h3>
            <p className="text-xs text-muted-foreground mt-2 font-medium">+{stats?.newPatientsThisMonth ?? 0} nuevos este mes</p>
          </div>

          {/* Progreso de Metas (1x1) */}
          <div className="col-span-1 rounded-3xl bg-slate-900 text-white p-6 shadow-md relative overflow-hidden group flex flex-col justify-between">
             <div className="absolute top-4 right-4 z-10">
               <button onClick={() => { setGoalInput(sessionGoal.toString()); setIsGoalDialogOpen(true); }} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors" aria-label="Editar Meta">
                  <Pencil className="w-4 h-4 text-white" />
               </button>
             </div>
             <div className="relative z-10">
               <h3 className="font-bold mb-4 opacity-90">Meta Mensual</h3>
               <div className="flex items-end gap-2 mb-3">
                 <span className="text-4xl font-black">{stats?.completedSessions ?? 0}</span>
                 <span className="text-sm font-medium opacity-70 mb-1">/ {sessionGoal}</span>
               </div>
               <Progress value={((stats?.completedSessions ?? 0) / sessionGoal) * 100} className="h-2.5 bg-white/20" />
               <p className="text-xs mt-3 font-medium opacity-80">
                 {Math.max(0, sessionGoal - (stats?.completedSessions ?? 0))} sesiones restantes
               </p>
             </div>
          </div>

          {/* Pagos Pendientes (1x1) */}
          <div 
            className="col-span-1 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/50 p-6 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-1 transition-all flex flex-col justify-between" 
            onClick={() => navigate('/finance')}
            role="button"
            tabIndex={0}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-100 dark:bg-amber-900/50 text-amber-600 rounded-2xl">
                  <AlertCircle className="w-5 h-5" />
                </div>
              </div>
              <p className="text-sm font-semibold text-amber-700/80 dark:text-amber-500/80 mb-1">Por Cobrar</p>
            </div>
            <h3 className="text-3xl font-extrabold tracking-tight text-amber-900 dark:text-amber-400">
               {loading ? <Skeleton className="h-8 w-20" /> : `$${(stats?.pendingPayments ?? 0).toLocaleString()}`}
            </h3>
          </div>


          {/* --- ROW 2: 2 Blocks (2x1 each) --- */}
          
          {/* Gráfico de Ingresos (Span 2x1) */}
          <div className="col-span-1 md:col-span-2 lg:col-span-2 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
            <div className="mb-4">
              <h3 className="font-bold text-slate-900 dark:text-white">Crecimiento Financiero</h3>
              <p className="text-xs text-muted-foreground font-medium">Últimos 6 meses</p>
            </div>
            <div className="flex-1 h-[200px]">
              <RevenueChart data={chartData} loading={loading} minimal={true} />
            </div>
          </div>

          {/* Agenda de Hoy (Span 2x1) */}
          <div className="col-span-1 md:col-span-2 lg:col-span-2 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm flex flex-col min-h-[300px] overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Agenda de Hoy</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  {stats?.confirmedToday ?? 0} confirmadas, {stats?.pendingToday ?? 0} pendientes
                </p>
              </div>
              <Button variant="outline" className="rounded-full h-9 px-4 font-bold text-xs" onClick={() => navigate('/agenda')}>
                Ver Todo
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TodayAgenda appointments={todayAppts} onRefresh={fetchAll} hideHeader />
            </div>
          </div>


          {/* --- ROW 3: Notas Recientes (Span 4x1) --- */}
          <div className="col-span-1 md:col-span-2 lg:col-span-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm">
             <div className="flex items-center justify-between mb-5">
               <h3 className="font-bold text-slate-900 dark:text-white">Últimas Notas Clínicas</h3>
               <Button variant="ghost" className="rounded-full h-8 text-xs font-bold text-primary hover:bg-primary/5" onClick={() => navigate('/notes')}>
                 <Plus className="w-3 h-3 mr-1" /> Redactar Nota
               </Button>
             </div>
             
             {loading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Cargando...</div>
             ) : recentNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                    <FileText className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">No hay notas recientes</p>
                </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentNotes.slice(0, 3).map((note) => (
                    <div key={note.id} onClick={() => navigate(`/notes?noteId=${note.id}`)} className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-100 hover:shadow-sm transition-all">
                       <div className="flex justify-between items-start mb-3">
                         <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{note.patientName}</span>
                         <span className="text-[10px] font-bold px-2 py-1 bg-white dark:bg-slate-700 rounded-md text-slate-500 dark:text-slate-300 shadow-sm">{note.format}</span>
                       </div>
                       <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{note.content || "Sin contenido preliminar..."}</p>
                    </div>
                  ))}
               </div>
             )}
          </div>
          
          {/* --- ROW 4: Actividad / Heatmap (Span Completo) --- */}
          <div className="col-span-1 md:col-span-2 lg:col-span-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm overflow-hidden">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Mapa de Actividad Clínica</h3>
            <div className="w-full overflow-x-auto">
               <ActivityHeatmap appointments={allAppointments} loading={loading} />
            </div>
          </div>

        </div>

        {/* Modal para Editar Meta Mensual de Sesiones */}
        <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" /> Editar Meta Mensual de Citas
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-2">
                <Label htmlFor="goalInput" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Número de Sesiones Meta por Mes
                </Label>
                <Input
                  id="goalInput"
                  type="number"
                  min="1"
                  max="500"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="Ej. 40"
                  className="h-11 rounded-xl text-lg font-bold text-center"
                />
                <p className="text-xs text-muted-foreground">
                  Esta meta se usará para calcular tu porcentaje de cumplimiento en el resumen del Dashboard.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setIsGoalDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="zen" onClick={handleSaveGoal} className="font-bold">
                Guardar Meta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
};

export default Dashboard;
