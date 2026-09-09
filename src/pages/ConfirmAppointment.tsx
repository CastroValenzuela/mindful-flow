import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Calendar, 
  Clock, 
  MapPin, 
  Video, 
  XCircle, 
  Loader2, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface AppointmentDetails {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  type: string;
  modality: string;
  location: string | null;
  meeting_platform: string | null;
  meeting_link: string | null;
  fee: number | null;
  patient_name: string;
  specialist_name: string;
  specialist_prefix: string;
  reschedule_policy_hours: number;
}

export default function ConfirmAppointment() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const autoConfirm = searchParams.get('auto') === 'true';

  useEffect(() => {
    if (!token) {
      setErrorMsg('Enlace no válido. Falta el token de confirmación.');
      setLoading(false);
      return;
    }

    const fetchAppointment = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_appointment_by_management_token', {
          p_management_token: token
        });

        if (error) throw error;
        if (!data || data.length === 0) {
          setErrorMsg('No encontramos los datos de esta cita o el enlace ha caducado.');
          return;
        }

        const apt = data[0] as AppointmentDetails;
        setAppointment(apt);

        // Si viene con el parámetro auto=true y la cita está pendiente, confirmar automáticamente
        if (autoConfirm && apt.status !== 'confirmed' && apt.status !== 'cancelled') {
          await executeConfirmation(token);
        }
      } catch (err: any) {
        console.error('Error fetching appointment by token:', err);
        setErrorMsg('Ocurrió un error al cargar la información de la cita.');
      } finally {
        setLoading(false);
      }
    };

    fetchAppointment();
  }, [token, autoConfirm]);

  const executeConfirmation = async (managementToken: string) => {
    try {
      setConfirming(true);
      const { data, error } = await supabase.rpc('confirm_appointment_by_token', {
        p_management_token: managementToken
      });

      if (error) throw error;
      if (data && !data.success) {
        toast.error(data.error || 'No se pudo confirmar la cita.');
        return;
      }

      setAppointment(prev => prev ? { ...prev, status: 'confirmed' } : null);
      toast.success('¡Tu asistencia ha sido confirmada con éxito!');
    } catch (err: any) {
      console.error('Error confirming appointment:', err);
      toast.error('Ocurrió un problema al confirmar tu cita.');
    } finally {
      setConfirming(false);
    }
  };

  const handleManualConfirm = () => {
    if (token) {
      executeConfirmation(token);
    }
  };

  const handleCancel = async () => {
    if (!token) return;
    try {
      setCanceling(true);
      const { data, error } = await supabase.rpc('cancel_appointment_by_token', {
        p_management_token: token,
        p_reason: 'Cancelado por el paciente desde el enlace de confirmación'
      });

      if (error) throw error;
      if (data && !data.success) {
        toast.error(data.error || 'No se pudo procesar la cancelación.');
        return;
      }

      setAppointment(prev => prev ? { ...prev, status: 'cancelled' } : null);
      setShowCancelConfirm(false);
      toast.info('Tu cita ha sido cancelada.');
    } catch (err: any) {
      console.error('Error canceling appointment:', err);
      toast.error(err.message || 'Error al procesar la solicitud.');
    } finally {
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Verificando información de tu cita...</p>
        </div>
      </div>
    );
  }

  if (errorMsg || !appointment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center shadow-lg border-red-100">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
            <XCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Enlace no disponible</h2>
          <p className="text-sm text-slate-600 mb-6">{errorMsg || 'No se pudo cargar la cita.'}</p>
          <Button variant="outline" className="w-full" onClick={() => navigate('/portal/login')}>
            Ir al Portal de Pacientes
          </Button>
        </Card>
      </div>
    );
  }

  const startDate = parseISO(appointment.start_time);
  const endDate = parseISO(appointment.end_time);
  const dateFormatted = format(startDate, "EEEE d 'de' MMMM, yyyy", { locale: es });
  const timeFormatted = `${format(startDate, 'HH:mm')} – ${format(endDate, 'HH:mm')}`;

  const specialistFull = `${appointment.specialist_prefix ? appointment.specialist_prefix + ' ' : ''}${appointment.specialist_name}`.trim();
  const isOnline = appointment.modality === 'online' || (!appointment.location && !!appointment.meeting_link);

  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Cita con ${specialistFull}`)}&dates=${startDate.toISOString().replace(/-|:|\.\d\d\d/g, '')}/${endDate.toISOString().replace(/-|:|\.\d\d\d/g, '')}&details=${encodeURIComponent(`Cita de ${appointment.type}.\nModalidad: ${isOnline ? 'Online' : 'Presencial'}`)}`;

  const isConfirmed = appointment.status === 'confirmed';
  const isCancelled = appointment.status === 'cancelled';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            MindCare · Confirmación Segura
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            {isConfirmed 
              ? '¡Cita Confirmada!' 
              : isCancelled 
                ? 'Cita Cancelada' 
                : 'Confirmación de Asistencia'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Hola <strong>{appointment.patient_name}</strong>, verifica los detalles de tu próxima sesión.
          </p>
        </div>

        {/* Main Card */}
        <Card className="border-border shadow-xl bg-white overflow-hidden rounded-2xl">
          {/* Header Banner State */}
          <div className={`p-4 text-center text-sm font-semibold flex items-center justify-center gap-2 ${
            isConfirmed 
              ? 'bg-emerald-500 text-white' 
              : isCancelled 
                ? 'bg-rose-500 text-white' 
                : 'bg-primary text-primary-foreground'
          }`}>
            {isConfirmed ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span>Asistencia 100% Confirmada</span>
              </>
            ) : isCancelled ? (
              <>
                <XCircle className="h-5 w-5" />
                <span>Esta cita ha sido cancelada</span>
              </>
            ) : (
              <>
                <Clock className="h-5 w-5" />
                <span>Pendiente de Confirmación</span>
              </>
            )}
          </div>

          <CardContent className="p-6 space-y-6">
            {/* Specialist Info */}
            <div className="flex items-center gap-4 pb-5 border-b border-slate-100">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary font-black flex items-center justify-center text-lg">
                {appointment.specialist_name.charAt(0)}
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Especialista</p>
                <h3 className="font-bold text-slate-900 text-base">{specialistFull}</h3>
                <p className="text-xs text-primary font-medium capitalize">{appointment.type || 'Consulta Psicológica'}</p>
              </div>
            </div>

            {/* Date & Time Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                  <Calendar className="h-4 w-4 text-primary" />
                  Fecha
                </div>
                <p className="font-bold text-sm text-slate-900 capitalize">{dateFormatted}</p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                  <Clock className="h-4 w-4 text-primary" />
                  Horario
                </div>
                <p className="font-bold text-sm text-slate-900">{timeFormatted}</p>
              </div>
            </div>

            {/* Modality & Location */}
            <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                  {isOnline ? <Video className="h-4 w-4 text-sky-600" /> : <MapPin className="h-4 w-4 text-emerald-600" />}
                  Modalidad: {isOnline ? 'En Línea (Videollamada)' : 'Presencial'}
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {appointment.modality || (isOnline ? 'Online' : 'Presencial')}
                </Badge>
              </div>

              {isOnline ? (
                <p className="text-xs text-slate-600 leading-relaxed">
                  El enlace para ingresar a tu sesión estará disponible en tu portal y se te enviará momentos antes de la cita.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900">{appointment.location || 'Consultorio del especialista'}</p>
                  {appointment.location && (
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 mt-1"
                    >
                      <MapPin className="h-3 w-3" /> Ver dirección en Google Maps →
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {!isCancelled && !isConfirmed && (
              <div className="space-y-3 pt-2">
                <Button 
                  size="lg" 
                  className="w-full h-14 text-base font-bold gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                  onClick={handleManualConfirm}
                  disabled={confirming}
                >
                  {confirming ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Confirmando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      Sí, confirmo mi asistencia en 1 clic
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Al confirmar, notificaremos inmediatamente a tu especialista en su agenda.
                </p>
              </div>
            )}

            {/* Confirmed State Actions */}
            {isConfirmed && (
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center text-xs text-emerald-800 font-medium">
                  🎉 Tu especialista ha sido notificado de tu confirmación. ¡Te esperamos puntualmente!
                </div>
                <a
                  href={googleCalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold transition-colors shadow-sm"
                >
                  <Calendar className="h-4 w-4 text-primary" />
                  Agregar a Google Calendar
                </a>
              </div>
            )}

            {/* Cancellation Option */}
            {!isCancelled && !showCancelConfirm && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-xs text-slate-500 hover:text-rose-600 underline font-medium transition-colors"
                >
                  ¿No podrás asistir? Avisar cancelación
                </button>
              </div>
            )}

            {showCancelConfirm && (
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-900 leading-relaxed font-medium">
                    ¿Estás seguro de que deseas cancelar? La política de cambios solicita al menos {appointment.reschedule_policy_hours || 12} horas de anticipación.
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-8"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    Mantener cita
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="text-xs h-8"
                    onClick={handleCancel}
                    disabled={canceling}
                  >
                    {canceling ? 'Cancelando...' : 'Sí, cancelar'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-slate-500 space-y-1">
          <p>MindCare · Plataforma Segura para Especialistas en Salud Mental</p>
          <p className="text-[11px] text-slate-400">Protección de datos conforme a la NOM-024-SSA3-2012</p>
        </div>
      </div>
    </div>
  );
}
