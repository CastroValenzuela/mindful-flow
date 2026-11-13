import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parseISO, addMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CalendarIcon,
  Clock,
  MapPin,
  Video,
  Loader2,
  Trash2,
  Check,
  Sparkles,
  Users,
  GraduationCap,
  Lock,
  Coffee,
  Bookmark,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import { logActivity } from '@/lib/activityLogger';
import { Appointment } from '@/types';

interface NewEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventAdded: () => void;
  editingEvent?: Appointment | null;
  selectedDate?: Date;
}

const EVENT_CATEGORIES = [
  { id: 'reunion', label: 'Reunión de equipo', icon: Users, color: 'blue' },
  { id: 'supervision', label: 'Supervisión clínica', icon: GraduationCap, color: 'violet' },
  { id: 'personal', label: 'Bloqueo / Tiempo personal', icon: Lock, color: 'slate' },
  { id: 'almuerzo', label: 'Comida / Descanso', icon: Coffee, color: 'amber' },
  { id: 'taller', label: 'Taller / Capacitación', icon: Sparkles, color: 'green' },
  { id: 'otro', label: 'Otro evento', icon: Bookmark, color: 'orange' },
];

const EVENT_COLORS = [
  { value: 'violet', label: 'Morado', bg: 'bg-violet-500' },
  { value: 'blue', label: 'Azul', bg: 'bg-blue-500' },
  { value: 'cyan', label: 'Cyan', bg: 'bg-cyan-500' },
  { value: 'green', label: 'Verde', bg: 'bg-green-500' },
  { value: 'yellow', label: 'Amarillo', bg: 'bg-yellow-400' },
  { value: 'orange', label: 'Naranja', bg: 'bg-orange-500' },
  { value: 'rose', label: 'Rosa', bg: 'bg-rose-500' },
  { value: 'slate', label: 'Gris', bg: 'bg-slate-500' },
  { value: 'teal', label: 'Teal', bg: 'bg-teal-500' },
];

const TIME_OPTIONS = Array.from({ length: 34 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30; // 07:00 to 23:30
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const label = `${h12}:${String(minutes).padStart(2, '0')} ${period}`;
  return { value: timeStr, label };
});

const QUICK_SUGGESTIONS = [
  'Supervisión de Casos',
  'Reunión de Equipo',
  'Sesión de Intervisión',
  'Tiempo Personal / Bloqueo',
  'Comida / Descanso',
  'Capacitación / Taller',
  'Revisión de Expedientes',
];

export default function NewEventDialog({
  open,
  onOpenChange,
  onEventAdded,
  editingEvent,
  selectedDate,
}: NewEventDialogProps) {
  const { user } = useAuth();
  const { organization } = useOrganization();

  const isEditing = Boolean(editingEvent?.id);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('reunion');
  const [date, setDate] = useState<Date>(selectedDate || new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [color, setColor] = useState('violet');
  const [locationType, setLocationType] = useState<'none' | 'presencial' | 'online'>('none');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (editingEvent) {
      setTitle(editingEvent.title || editingEvent.patient_name || '');
      setColor(editingEvent.color || 'violet');
      setNotes(editingEvent.notes || '');
      setLocation(editingEvent.location || editingEvent.meeting_link || '');
      setLocationType(
        editingEvent.modality === 'online' || editingEvent.meeting_link
          ? 'online'
          : editingEvent.location
          ? 'presencial'
          : 'none'
      );

      if (editingEvent.start_time) {
        try {
          const parsedStart = parseISO(editingEvent.start_time);
          setDate(parsedStart);
          setStartTime(format(parsedStart, 'HH:mm'));
        } catch {}
      }

      if (editingEvent.end_time) {
        try {
          const parsedEnd = parseISO(editingEvent.end_time);
          setEndTime(format(parsedEnd, 'HH:mm'));
        } catch {}
      }
    } else {
      // Defaults for a new event
      setTitle('');
      setCategory('reunion');
      setDate(selectedDate || new Date());
      setStartTime('09:00');
      setEndTime('10:00');
      setColor('violet');
      setLocationType('none');
      setLocation('');
      setNotes('');
    }
  }, [editingEvent, selectedDate, open]);

  // Adjust end time when duration button clicked
  const handleSetDuration = (durationMinutes: number) => {
    const [h, m] = startTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    const end = addMinutes(d, durationMinutes);
    setEndTime(format(end, 'HH:mm'));
  };

  const handleCategorySelect = (catId: string) => {
    setCategory(catId);
    const match = EVENT_CATEGORIES.find((c) => c.id === catId);
    if (match) {
      setColor(match.color);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Por favor escribe un título para el evento');
      return;
    }

    if (!date) {
      toast.error('Por favor selecciona una fecha');
      return;
    }

    setIsSubmitting(true);
    try {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);

      const startDateTime = new Date(date);
      startDateTime.setHours(startH, startM, 0, 0);

      const endDateTime = new Date(date);
      endDateTime.setHours(endH, endM, 0, 0);

      if (endDateTime <= startDateTime) {
        toast.error('La hora de fin debe ser posterior a la hora de inicio');
        setIsSubmitting(false);
        return;
      }

      const eventPayload = {
        organization_id: organization?.id,
        user_id: user?.id,
        patient_id: null,
        patient_name: title.trim(),
        title: title.trim(),
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        type: 'event',
        status: 'confirmed' as const,
        color: color || 'violet',
        notes: notes.trim() || null,
        fee: 0,
        modality: locationType === 'online' ? 'online' : locationType === 'presencial' ? 'presencial' : null,
        location: locationType === 'presencial' ? location.trim() || null : null,
        meeting_link: locationType === 'online' ? location.trim() || null : null,
      };

      if (isEditing && editingEvent?.id) {
        const { error } = await supabase
          .from('appointments')
          .update(eventPayload)
          .eq('id', editingEvent.id);

        if (error) throw error;
        toast.success('Evento actualizado correctamente');
      } else {
        const { error } = await supabase
          .from('appointments')
          .insert([eventPayload]);

        if (error) throw error;

        await logActivity({
          profile_id: user?.id || '',
          type: 'appointment_created',
          title: 'Nuevo Evento Agendado',
          description: `Has agregado el evento "${title.trim()}" en la agenda para el ${format(
            startDateTime,
            "d 'de' MMMM",
            { locale: es }
          )}.`,
          organization_id: organization?.id,
        });

        toast.success('Evento agregado a la agenda');
      }

      onEventAdded();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving event:', err);
      toast.error('Error al guardar el evento: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent?.id) return;
    if (!window.confirm('¿Seguro que deseas eliminar este evento de la agenda?')) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', editingEvent.id);

      if (error) throw error;

      toast.success('Evento eliminado de la agenda');
      onEventAdded();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-border/60 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-foreground">
                {isEditing ? 'Editar Evento en Agenda' : 'Nuevo Evento en Agenda'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Agrega actividades, reuniones, descansos o bloqueos de horario para los especialistas
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Título del evento */}
          <div className="space-y-2">
            <Label htmlFor="event-title" className="text-xs font-bold text-foreground">
              Nombre / Título del Evento *
            </Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Supervisión clínica, Reunión de equipo, Comida..."
              className="h-11 rounded-xl font-medium"
              autoFocus
            />

            {/* Sugerencias rápidas */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setTitle(sug)}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                >
                  + {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Categoría rápida */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-foreground">Categoría</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EVENT_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategorySelect(cat.id)}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary shadow-xs'
                        : 'border-border/60 bg-card hover:bg-muted/40 text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fecha y Horario */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Fecha */}
            <div className="space-y-2 sm:col-span-1">
              <Label className="text-xs font-bold text-foreground">Fecha *</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 justify-start text-left rounded-xl font-medium text-xs border-border/70"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">
                      {date ? format(date, "d 'de' MMM", { locale: es }) : 'Elegir'}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 rounded-2xl shadow-xl" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      if (d) {
                        setDate(d);
                        setIsCalendarOpen(false);
                      }
                    }}
                    locale={es}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Hora Inicio */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-foreground">Desde</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger className="h-11 rounded-xl text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={`start-${t.value}`} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Hora Fin */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-foreground">Hasta</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger className="h-11 rounded-xl text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={`end-${t.value}`} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Atajos de Duración Rápida */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[11px] font-bold text-muted-foreground mr-1">Duración:</span>
            {[30, 45, 60, 90, 120].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => handleSetDuration(mins)}
                className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-muted/50 hover:bg-primary/10 hover:text-primary text-muted-foreground border border-border/40 transition-colors cursor-pointer"
              >
                {mins < 60 ? `${mins}m` : `${mins / 60}h`}
              </button>
            ))}
          </div>

          {/* Color del Evento */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-foreground">Color de la etiqueta</Label>
            <div className="flex flex-wrap items-center gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center transition-all cursor-pointer',
                    c.bg,
                    color === c.value ? 'ring-2 ring-offset-2 ring-primary scale-110 shadow-sm' : 'opacity-70 hover:opacity-100 hover:scale-105'
                  )}
                >
                  {color === c.value && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Modalidad y Ubicación / Enlace */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-foreground">Lugar o Enlace (Opcional)</Label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLocationType(locationType === 'presencial' ? 'none' : 'presencial')}
                  className={cn(
                    'text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-colors cursor-pointer',
                    locationType === 'presencial'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                      : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                  )}
                >
                  <MapPin className="h-3 w-3" /> Presencial
                </button>
                <button
                  type="button"
                  onClick={() => setLocationType(locationType === 'online' ? 'none' : 'online')}
                  className={cn(
                    'text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-colors cursor-pointer',
                    locationType === 'online'
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
                      : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                  )}
                >
                  <Video className="h-3 w-3" /> En línea
                </button>
              </div>
            </div>

            {locationType === 'presencial' && (
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej. Consultorio 204, Sala de Juntas, Auditorio..."
                className="h-10 rounded-xl text-xs font-medium"
              />
            )}

            {locationType === 'online' && (
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej. https://meet.google.com/xyz o enlace de Zoom / Teams"
                className="h-10 rounded-xl text-xs font-medium"
              />
            )}
          </div>

          {/* Notas / Descripción */}
          <div className="space-y-2">
            <Label htmlFor="event-notes" className="text-xs font-bold text-foreground">
              Descripción / Notas adicionales
            </Label>
            <Textarea
              id="event-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre el evento, puntos a tratar o recordatorios..."
              className="min-h-[80px] rounded-xl text-xs font-medium resize-y"
            />
          </div>

          <DialogFooter className="pt-3 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting || isSubmitting}
                  className="text-destructive hover:bg-destructive/10 text-xs font-bold h-9 px-3 rounded-xl"
                >
                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                  Eliminar Evento
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="h-9 px-4 rounded-xl text-xs font-bold w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="zen"
                size="sm"
                disabled={isSubmitting}
                className="h-9 px-5 rounded-xl text-xs font-black shadow-md w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                )}
                {isEditing ? 'Guardar Cambios' : 'Crear Evento'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
