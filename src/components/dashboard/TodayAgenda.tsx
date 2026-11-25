import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, MessageCircle, Video, CheckCircle2, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAvatarTheme, getInitials } from '@/lib/avatar-utils';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface AgendaAppointment {
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

interface TodayAgendaProps {
  appointments: AgendaAppointment[];
  onRefresh?: () => void;
  hideHeader?: boolean;
}

const TodayAgenda = ({ appointments, onRefresh, hideHeader = false }: TodayAgendaProps) => {
  const getStatusBadge = (status: AgendaAppointment['status']) => {
    const cfg: Record<string, { variant: any, label: string }> = {
      scheduled: { variant: 'default', label: 'Agendado' },
      confirmed: { variant: 'success', label: 'Confirmado' },
      pending: { variant: 'warning', label: 'Pendiente' },
      cancelled: { variant: 'destructive', label: 'Cancelado' },
      completed: { variant: 'secondary', label: 'Completado' },
    };
    const c = cfg[status] || cfg['scheduled'];
    return <Badge variant={c.variant} className="text-[10px] px-2 py-0.5">{c.label}</Badge>;
  };

  const handleMarkCompleted = async (appointmentId: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', appointmentId);
      if (error) throw error;
      toast.success('Cita marcada como completada');
      onRefresh?.();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error('Error al actualizar estado: ' + error.message);
    }
  };

  const formatTime = (dateStr: string) =>
    format(parseISO(dateStr), 'HH:mm', { locale: es });

  const content = (
    <div className="space-y-2.5">
      {appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-slate-500 font-medium">No hay citas programadas para hoy</p>
        </div>
      ) : (
        appointments.map((appointment, index) => (
          <div
            key={appointment.id}
            className={cn(
              'flex flex-col sm:flex-row items-start sm:items-center gap-3.5 rounded-2xl p-3.5 transition-all duration-200 border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:border-primary/20 hover:bg-white dark:hover:bg-slate-800/70 shadow-sm',
              appointment.status === 'cancelled' && 'opacity-60'
            )}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Horario */}
            <div className="flex flex-row sm:flex-col items-center justify-between w-full sm:w-auto gap-4 sm:gap-0 sm:min-w-[50px] shrink-0">
              <div className="flex flex-col sm:items-center">
                <span className="text-sm font-bold text-foreground">{formatTime(appointment.startTime)}</span>
                <span className="text-[11px] text-muted-foreground font-medium">{formatTime(appointment.endTime)}</span>
              </div>
            </div>

            {/* Indicador de estado */}
            <div className={cn(
              'hidden sm:block h-10 w-1 rounded-full shrink-0',
              appointment.status === 'scheduled' && 'bg-primary',
              appointment.status === 'confirmed' && 'bg-emerald-500',
              appointment.status === 'pending' && 'bg-amber-500',
              appointment.status === 'cancelled' && 'bg-destructive',
              appointment.status === 'completed' && 'bg-muted-foreground'
            )} />

            {/* Avatar & Paciente */}
            <div className="flex-1 min-w-0 w-full flex items-center gap-3">
              <div className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-xs",
                getAvatarTheme(appointment.patientName)
              )}>
                {getInitials(appointment.patientName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate text-foreground">{appointment.patientName}</span>
                  {appointment.modality === 'online' ? (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 gap-1 text-sky-600 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800">
                      <Video className="h-2.5 w-2.5" /> Virtual
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 gap-1 text-slate-600 dark:text-slate-300">
                      <MapPin className="h-2.5 w-2.5" /> Presencial
                    </Badge>
                  )}
                  {appointment.paymentStatus === 'paid' ? (
                    <Badge variant="outline" className="text-[11px] py-0.5 px-2 h-5 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 font-bold">
                      ✓ Pagado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] py-0.5 px-2 h-5 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 font-bold">
                      {appointment.fee && appointment.fee > 0 ? `⚠ Debe sesión: $${appointment.fee}` : '⚠ Debe sesión (Sin cobrar)'}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{appointment.type}</p>
              </div>
            </div>

            {/* Acciones y estado */}
            <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40 shrink-0 flex-wrap">
              {getStatusBadge(appointment.status)}

              {/* Botón directo Unirse a Videollamada si es virtual */}
              {appointment.modality === 'online' && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 px-2.5 text-xs font-bold gap-1.5 bg-primary text-white hover:bg-primary/90 rounded-xl shadow-xs"
                  onClick={() => {
                    if (appointment.meetingUrl) {
                      window.open(appointment.meetingUrl, '_blank');
                    } else {
                      window.open(`/telehealth/${appointment.id}`, '_blank');
                    }
                  }}
                  title="Unirse a la sesión de videollamada"
                >
                  <Video className="h-3.5 w-3.5" />
                  <span>Unirse a Videollamada</span>
                </Button>
              )}

              {/* Botón de 1 clic para Marcar Asistencia sin abrir el modal de 12 campos */}
              {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs font-bold gap-1.5 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 rounded-xl transition-all"
                  onClick={() => handleMarkCompleted(appointment.id)}
                  title="Marcar asistencia en 1 clic (sin abrir formulario)"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Marcar Asistencia</span>
                </Button>
              )}

              {/* WhatsApp reminder */}
              {appointment.phone && (
                <a
                  href={`https://wa.me/${appointment.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola ${appointment.patientName}, te recuerdo tu cita de ${appointment.type} hoy a las ${format(parseISO(appointment.startTime), 'HH:mm')}.\n\n👉 Responde *"Sí, asistiré"* para confirmar en un clic o avísanos si necesitas cambiar algo.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors"
                  title="Enviar recordatorio por WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  if (hideHeader) {
    return content;
  }

  return (
    <Card variant="glass" className="animate-fade-in border-white/20 dark:border-white/5">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-slate-800 dark:text-slate-100 text-base">Agenda de Hoy</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
          </p>
        </div>
        <Badge variant="zen" size="lg" className="bg-primary/10 text-primary border-none text-xs">
          {appointments.length} citas
        </Badge>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
};

export default TodayAgenda;
