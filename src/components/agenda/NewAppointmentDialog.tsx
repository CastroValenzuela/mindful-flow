import { useState, useEffect } from 'react';
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
import { format, parseISO, startOfDay, endOfDay, isBefore, addDays, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Clock, Video, Loader2, XCircle, MapPin, Repeat, CreditCard, Sparkles, Copy, Check, Building2, Plus, Info, ExternalLink, Star, CheckCircle2, Home, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useClinicLocations, ClinicLocation } from '@/hooks/useClinicLocations';

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

const APPOINTMENT_COLORS = [
    { value: 'violet', label: 'Morado', bg: 'bg-violet-500', ring: 'ring-violet-400' },
    { value: 'blue', label: 'Azul', bg: 'bg-blue-500', ring: 'ring-blue-400' },
    { value: 'cyan', label: 'Cyan', bg: 'bg-cyan-500', ring: 'ring-cyan-400' },
    { value: 'green', label: 'Verde', bg: 'bg-green-500', ring: 'ring-green-400' },
    { value: 'yellow', label: 'Amarillo', bg: 'bg-yellow-400', ring: 'ring-yellow-300' },
    { value: 'orange', label: 'Naranja', bg: 'bg-orange-500', ring: 'ring-orange-400' },
    { value: 'rose', label: 'Rosa', bg: 'bg-rose-500', ring: 'ring-rose-400' },
    { value: 'slate', label: 'Gris', bg: 'bg-slate-500', ring: 'ring-slate-400' },
    { value: 'teal', label: 'Teal', bg: 'bg-teal-500', ring: 'ring-teal-400' },
];

import { cn } from '@/lib/utils';
import PatientAutocomplete from '@/components/patients/PatientAutocomplete';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import ClockPicker from '@/components/ui/ClockPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import { AlertTriangle } from 'lucide-react';
import { useCallback } from 'react';
import { logActivity } from '@/lib/activityLogger';
import { buildUTCFromClinicTime, getVisitorTimezone, formatClinicTime } from '@/lib/timezone';



interface EditingAppointment {
    id: string;
    patientId?: string;
    patientName: string;
    startTime: string;
    endTime: string;
    type?: string;
    fee?: number;
    meetingLink?: string;
    meetingPlatform?: string;
    notes?: string;
    status?: string;
    color?: string;
    modality?: 'presencial' | 'online';
    location?: string;
    isRecurring?: boolean;
    recurrenceId?: string;
    paymentStatus?: string;
    patientAge?: number;
    reasonForConsultation?: string;
    serviceId?: string;
}

interface NewAppointmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedDate?: Date;
    onAppointmentAdded?: () => void;
    editingAppointment?: EditingAppointment | null;
    isReadOnly?: boolean;
    initialPatient?: any | null;
}

const NewAppointmentDialog = ({
    open,
    onOpenChange,
    selectedDate,
    onAppointmentAdded,
    editingAppointment,
    isReadOnly = false,
    initialPatient,
}: NewAppointmentDialogProps) => {
    const { user } = useAuth();
    const { organization } = useOrganization();
    const navigate = useNavigate();
    const isEditing = !!editingAppointment;
    const [date, setDate] = useState<Date | undefined>(selectedDate || new Date());
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [services, setServices] = useState<any[]>([]);
    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    const [specialistName, setSpecialistName] = useState('');
    const [porcentajeGlobal, setPorcentajeGlobal] = useState<number>(30);
    const [reschedulePolicyGlobal, setReschedulePolicyGlobal] = useState<number>(12);

    // Schedule config loaded from profile
    const [horarioConfig, setHorarioConfig] = useState<any>({
        dias: {},
        dias_no_laborables: [],
    });

    // Sedes y consultorios presenciales
    const { locations, defaultLocation, saveLocation } = useClinicLocations();
    const [isAddingLocation, setIsAddingLocation] = useState(false);
    const [newLocName, setNewLocName] = useState('');
    const [newLocAddress, setNewLocAddress] = useState('');
    const [newLocInstructions, setNewLocInstructions] = useState('');
    const [saveForFuture, setSaveForFuture] = useState(true);
    const [specialistDefaultPlatform, setSpecialistDefaultPlatform] = useState<string>('saudade');

    // Control de primera sesión (mostrar/ocultar edad y motivo) y hora manual
    const [isFirstSession, setIsFirstSession] = useState(false);
    const [isManualTime, setIsManualTime] = useState(false);

    useEffect(() => {
        if (!user) return;
        supabase
            .from('profiles')
            .select('horario_atencion, full_name, prefix, title_prefix, porcentaje_consultorio, reschedule_policy_hours, default_meeting_platform, google_refresh_token')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (data?.full_name) {
                    const rawPref = (data as any)?.prefix || (data as any)?.title_prefix || '';
                    const pref = (rawPref && rawPref.toLowerCase() !== 'none') ? `${rawPref.trim()} ` : '';
                    setSpecialistName(`${pref}${data.full_name}`);
                }
                const defPlat = (data as any)?.default_meeting_platform || ((data as any)?.google_refresh_token ? 'meet' : 'saudade');
                setSpecialistDefaultPlatform(defPlat);
                if (data?.porcentaje_consultorio !== undefined && data?.porcentaje_consultorio !== null) {
                    setPorcentajeGlobal(data.porcentaje_consultorio);
                }
                if (data?.reschedule_policy_hours !== undefined && data?.reschedule_policy_hours !== null) {
                    setReschedulePolicyGlobal(data.reschedule_policy_hours);
                }
                if (data?.horario_atencion) {
                    const h = data.horario_atencion;
                    let normalized: any;

                    if (Array.isArray(h.dias)) {
                        const newDias: any = {};
                        [0, 1, 2, 3, 4, 5, 6].forEach(d => {
                            newDias[d] = {
                                activo: h.dias.includes(d),
                                inicio: h.inicio || '08:00',
                                fin: h.fin || '17:00',
                                max_sesiones: 8
                            };
                        });
                        normalized = {
                            dias: newDias,
                            dias_no_laborables: h.dias_no_laborables || [],
                        };
                    } else {
                        normalized = h;
                    }

                    setHorarioConfig(normalized);

                    // Snap default startTime to configured start hour of the selected date (if not editing)
                    if (!isEditing) {
                        const weekday = (selectedDate || new Date()).getDay();
                        const config = normalized.dias?.[weekday] || { inicio: '08:00' };
                        setFormData(prev => ({
                            ...prev,
                            startTime: config.inicio || '08:00',
                        }));
                    }
                }
            });

        // Fetch services
        const fetchServices = async () => {
            setIsLoadingServices(true);
            try {
                const { data } = await supabase
                    .from('services')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('active', true)
                    .order('name');
                if (data) setServices(data);
            } catch (err) {
                console.error('Error fetching services:', err);
            } finally {
                setIsLoadingServices(false);
            }
        };
        fetchServices();
    }, [user, isEditing]);

    // Returns a warning message if the given date is blocked
    const getDateWarning = (d: Date | undefined): string | null => {
        if (!d) return null;
        const isoDate = format(d, 'yyyy-MM-dd');
        if (horarioConfig.dias_no_laborables.includes(isoDate)) return 'Este día está marcado como no laborable.';
        const weekday = d.getDay();
        if (!horarioConfig.dias?.[weekday]?.activo) return 'Este día no es un día de atención configurado.';
        return null;
    };
    const [formData, setFormData] = useState({
        patientId: '',
        patientName: '',
        patientEmail: '',
        patientPhone: '',
        type: '',
        status: 'scheduled',
        color: 'violet',
        startTime: '09:00',
        fee: '',
        meetingLink: '',
        meetingPlatform: '',
        notes: '',
        modality: 'presencial' as 'presencial' | 'online',
        location: '',
        isRecurring: false,
        recurrenceWeeks: 8 as number | string,
        editSeries: false,
        patientAge: '' as string | number,
        reasonForConsultation: '',
        serviceId: '',
    });

    // Citas existentes en la fecha seleccionada para deshabilitar franjas en tiempo real
    const [existingAppointmentsForDate, setExistingAppointmentsForDate] = useState<any[]>([]);
    const [patientSuggestedTime, setPatientSuggestedTime] = useState<{ time: string; reason: string } | null>(null);

    // Obtener citas del día seleccionado
    useEffect(() => {
        if (!open || !date || !user) {
            setExistingAppointmentsForDate([]);
            return;
        }
        const dateStr = format(date, 'yyyy-MM-dd');
        const startOfDayUtc = new Date(`${dateStr}T00:00:00.000Z`).toISOString();
        const endOfDayUtc = new Date(`${dateStr}T23:59:59.999Z`).toISOString();

        supabase
            .from('appointments')
            .select('id, start_time, end_time, patient_name, status')
            .eq('user_id', user.id)
            .neq('status', 'cancelled')
            .gte('start_time', startOfDayUtc)
            .lte('start_time', endOfDayUtc)
            .then(({ data, error }) => {
                if (!error && data) {
                    setExistingAppointmentsForDate(data);
                }
            });
    }, [open, date, user]);

    // Analizar historial del paciente para sugerir horario habitual
    useEffect(() => {
        if (!open || !formData.patientId || !user) {
            setPatientSuggestedTime(null);
            return;
        }

        supabase
            .from('appointments')
            .select('start_time')
            .eq('user_id', user.id)
            .eq('patient_id', formData.patientId)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(10)
            .then(({ data }) => {
                if (!data || data.length === 0) {
                    setPatientSuggestedTime(null);
                    setIsFirstSession(true);
                    return;
                }

                setIsFirstSession(false);
                const clinicTz = organization?.settings?.timezone || getVisitorTimezone();
                const counts: Record<string, number> = {};
                data.forEach(apt => {
                    const t = formatClinicTime(parseISO(apt.start_time), clinicTz);
                    counts[t] = (counts[t] || 0) + 1;
                });

                let topTime = '';
                let maxCount = 0;
                Object.entries(counts).forEach(([t, count]) => {
                    if (count > maxCount) {
                        maxCount = count;
                        topTime = t;
                    }
                });

                if (topTime) {
                    setPatientSuggestedTime({
                        time: topTime,
                        reason: `Horario habitual (${maxCount} ${maxCount === 1 ? 'sesión previa' : 'sesiones previas'} a las ${topTime})`
                    });
                }
            });
    }, [open, formData.patientId, user, organization]);

    // Verificador de solapamiento en tiempo real para cualquier hora "HH:mm"
    const getOverlappingAppointment = useCallback((timeStr: string) => {
        if (!date || existingAppointmentsForDate.length === 0) return null;
        const clinicTz = organization?.settings?.timezone || getVisitorTimezone();
        const candidateStart = buildUTCFromClinicTime(date, timeStr, clinicTz);
        const duration = services.find(s => s.id === formData.serviceId)?.duration || 60;
        const candidateEnd = new Date(candidateStart.getTime() + duration * 60 * 1000);

        return existingAppointmentsForDate.find(apt => {
            if (isEditing && apt.id === editingAppointment?.id) return false;
            const aptStart = parseISO(apt.start_time);
            const aptEnd = parseISO(apt.end_time);
            return candidateStart < aptEnd && candidateEnd > aptStart;
        }) || null;
    }, [date, existingAppointmentsForDate, services, formData.serviceId, isEditing, editingAppointment, organization]);

    // Encontrar el horario más temprano disponible para la fecha seleccionada
    const getEarliestAvailableSlot = useCallback((targetDate: Date | undefined) => {
        if (!targetDate) return '09:00';
        const weekday = targetDate.getDay();
        const config = horarioConfig.dias?.[weekday] || { inicio: '08:00', fin: '17:00' };
        const startH = parseInt((config.inicio || '08:00').split(':')[0]) || 8;
        const endH = parseInt((config.fin || '17:00').split(':')[0]) || 17;

        const isTodayDate = format(targetDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
        const now = new Date();
        let minHour = startH;

        if (isTodayDate) {
            const currentH = now.getHours();
            if (currentH >= minHour) minHour = currentH;
        }

        // Buscar desde minHour hasta endH en incrementos de 30 min
        for (let h = minHour; h <= endH; h++) {
            for (const m of ['00', '30']) {
                const hh = String(h).padStart(2, '0');
                const slotStr = `${hh}:${m}`;
                if (isTodayDate) {
                    const nowMinutes = now.getHours() * 60 + now.getMinutes();
                    const slotMinutes = h * 60 + parseInt(m);
                    if (slotMinutes <= nowMinutes) continue;
                }
                if (!getOverlappingAppointment(slotStr)) {
                    return slotStr;
                }
            }
        }

        return config.inicio || '09:00';
    }, [horarioConfig, getOverlappingAppointment]);

    // Seleccionar automáticamente el horario más temprano disponible al abrir o cambiar de fecha
    useEffect(() => {
        if (!open || isEditing) return;
        const earliest = getEarliestAvailableSlot(date);
        setFormData(prev => ({ ...prev, startTime: earliest }));
    }, [open, date, isEditing, getEarliestAvailableSlot]);

    // Sincronizar fecha cuando cambia selectedDate
    useEffect(() => {
        if (selectedDate && !isEditing) setDate(selectedDate);
    }, [selectedDate, isEditing]);

    // Pre-llenar formulario al editar o resetear al abrir
    useEffect(() => {
        if (!open) return;

        if (editingAppointment) {
            const start = parseISO(editingAppointment.startTime);
            setDate(start);
            setFormData({
                patientId: editingAppointment.patientId || '',
                patientName: editingAppointment.patientName || '',
                type: editingAppointment.type || '',
                status: editingAppointment.status || 'scheduled',
                color: editingAppointment.color || 'violet',
                startTime: (() => {
                    const clinicTz = organization?.settings?.timezone || getVisitorTimezone();
                    try {
                        const parts = new Intl.DateTimeFormat('en-US', {
                            timeZone: clinicTz,
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        }).formatToParts(start);
                        const h = parts.find(p => p.type === 'hour')?.value || '09';
                        const m = parts.find(p => p.type === 'minute')?.value || '00';
                        const cleanH = h === '24' ? '00' : h;
                        const snappedM = String(Math.round(parseInt(m) / 5) * 5 % 60).padStart(2, '0');
                        return `${cleanH}:${snappedM}`;
                    } catch {
                        return format(start, 'HH:mm');
                    }
                })(),
                fee: editingAppointment.fee != null ? String(editingAppointment.fee) : '',
                meetingLink: editingAppointment.meetingLink || '',
                meetingPlatform: editingAppointment.meetingPlatform || '',
                notes: editingAppointment.notes || '',
                modality: editingAppointment.modality || 'presencial',
                location: editingAppointment.location || '',
                isRecurring: editingAppointment.isRecurring || false,
                recurrenceWeeks: 8,
                editSeries: false,
                patientAge: editingAppointment.patientAge || '',
                reasonForConsultation: editingAppointment.reasonForConsultation || '',
                serviceId: editingAppointment.serviceId || '',
            });
        } else {
            resetForm();
        }
        setConfirmCancel(false);
    }, [editingAppointment, open, initialPatient]);

    const resetForm = () => {
        const defaultLocStr = defaultLocation
            ? `${defaultLocation.name}${defaultLocation.address ? ` - ${defaultLocation.address}` : ''}${defaultLocation.instructions ? ` [Ref: ${defaultLocation.instructions}]` : ''}`
            : '';
        setFormData({
            patientId: initialPatient?.id || '',
            patientName: initialPatient?.name || '',
            patientEmail: initialPatient?.email || '',
            patientPhone: initialPatient?.phone || '',
            type: '',
            status: 'scheduled',
            color: 'violet',
            startTime: '09:00',
            fee: '',
            meetingLink: '',
            meetingPlatform: specialistDefaultPlatform || 'saudade',
            notes: '',
            modality: 'presencial',
            location: defaultLocStr,
            isRecurring: false,
            recurrenceWeeks: 8 as number | string,
            editSeries: false,
            patientAge: '',
            reasonForConsultation: '',
            serviceId: '',
        });
        setIsFirstSession(!initialPatient);
        setIsAddingLocation(false);
    };

    useEffect(() => {
        if (initialPatient && open && !editingAppointment) {
            setFormData(prev => ({
                ...prev,
                patientId: initialPatient.id || '',
                patientName: initialPatient.name || '',
                patientEmail: initialPatient.email || '',
                patientPhone: initialPatient.phone || '',
            }));
        }
    }, [initialPatient, open, editingAppointment]);

    // Preseleccionar consultorio habitual al abrir diálogo si no hay ubicación asignada
    useEffect(() => {
        if (open && !editingAppointment && defaultLocation && !formData.location) {
            const locStr = `${defaultLocation.name}${defaultLocation.address ? ` - ${defaultLocation.address}` : ''}${defaultLocation.instructions ? ` [Ref: ${defaultLocation.instructions}]` : ''}`;
            setFormData(prev => ({
                ...prev,
                location: locStr,
            }));
        }
    }, [open, editingAppointment, defaultLocation]);

    const handleServiceChange = (serviceId: string) => {
        const service = services.find(s => s.id === serviceId);
        if (service) {
            setFormData(prev => ({
                ...prev,
                serviceId,
                type: service.name,
                fee: String(service.price),
                color: service.color || prev.color
            }));
        } else {
            setFormData(prev => ({ ...prev, serviceId: '' }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const validation = appointmentSchema.safeParse(formData);
        if (!validation.success) {
            toast.error(validation.error.errors[0].message);
            return;
        }

        if (!date) {
            toast.error('Por favor selecciona una fecha');
            return;
        }

        setIsSubmitting(true);

        try {
            // Fetch session user FIRST so it's available for all subsequent code
            const { data: { user: sessionUser } } = await supabase.auth.getUser();

            const dateStr = format(date, 'yyyy-MM-dd');
            const clinicTz = organization?.settings?.timezone || getVisitorTimezone();
            const startDateTime = buildUTCFromClinicTime(date, formData.startTime, clinicTz);

            // 1. Validar días laborables y festivos
            const weekday = date.getDay();
            const config = horarioConfig.dias?.[weekday];

            if (!config?.activo) {
                toast.error('Este día no es un día de atención configurado.');
                setIsSubmitting(false);
                return;
            }
            if (horarioConfig.dias_no_laborables.includes(dateStr)) {
                toast.error('Este día está marcado como no laborable.');
                setIsSubmitting(false);
                return;
            }

            // Validar horas del día específico
            const [hMin, mMin] = (config?.inicio || '08:00').split(':').map(Number);
            const [hMax, mMax] = (config?.fin || '17:00').split(':').map(Number);
            const [hSel, mSel] = (formData.startTime || '09:00').split(':').map(Number);

            if (hSel < hMin || (hSel === hMin && mSel < mMin) || hSel > hMax || (hSel === hMax && mSel > mMax)) {
                toast.error(`La hora seleccionada está fuera del horario de este día (${config.inicio} - ${config.fin})`);
                setIsSubmitting(false);
                return;
            }

            // 1.5 Validar límite diario de sesiones (max_sesiones)
            if (config.max_sesiones != null && config.max_sesiones > 0) {
                const { count, error: countErr } = await supabase
                    .from('appointments')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', sessionUser?.id)
                    .neq('status', 'cancelled')
                    .gte('start_time', startOfDay(date).toISOString())
                    .lte('start_time', endOfDay(date).toISOString());

                if (countErr) {
                    console.error('Error counting appointments:', countErr);
                } else if (count != null) {
                    // Si estamos editando y no cambiamos de día, restamos 1 (el actual)
                    let currentLimit = config.max_sesiones;
                    let existingCount = count;
                    
                    if (isEditing) {
                        const originalStart = format(parseISO(editingAppointment.startTime), 'yyyy-MM-dd');
                        if (originalStart === dateStr) {
                            // Estamos en el mismo día, la cita actual ya está contada
                            if (count > currentLimit) {
                                // Ya estaba excedido, permitir editar si no se aumenta el número
                                // Pero por simplicidad, si count > limit, solo bloqueamos si movemos A un día lleno
                            }
                        }
                    }

                    if (existingCount >= currentLimit) {
                        // Check if we are editing and moving to a DIFFERENT day or if it's new
                        let shouldBlock = false;
                        if (!isEditing) {
                            shouldBlock = true;
                        } else {
                            const originalStart = format(parseISO(editingAppointment.startTime), 'yyyy-MM-dd');
                            if (originalStart !== dateStr) {
                                shouldBlock = true;
                            }
                        }

                        if (shouldBlock) {
                            toast.error(`Has alcanzado el límite de ${currentLimit} sesiones para este día (${dateStr}).`);
                            setIsSubmitting(false);
                            return;
                        }
                    }
                }
            }

            // 2. Validar que no sea fecha/hora en el pasado (solo para citas nuevas o si se cambió la fecha)
            const now = new Date();
            if (!isEditing && isBefore(startDateTime, now)) {
                toast.error('No puedes agendar una cita en el pasado');
                setIsSubmitting(false);
                return;
            }

            // Dynamic duration based on service
            const duration = services.find(s => s.id === formData.serviceId)?.duration || 60;
            const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

            // 3. Validar solapamiento de citas (Double Booking)
            const { data: overlappingAppointments, error: overlapError } = await supabase
                .from('appointments')
                .select('id')
                .eq('user_id', sessionUser?.id)
                .neq('status', 'cancelled')
                .lt('start_time', endDateTime.toISOString())
                .gt('end_time', startDateTime.toISOString());

            if (overlapError) {
                console.error('Error checking overlapping appointments:', overlapError);
            } else if (overlappingAppointments && overlappingAppointments.length > 0) {
                // If we are editing, make sure the overlap is not the appointment we are editing itself
                const realOverlaps = isEditing 
                    ? overlappingAppointments.filter(apt => apt.id !== editingAppointment?.id)
                    : overlappingAppointments;

                if (realOverlaps.length > 0) {
                    toast.error('Ya existe otra cita agendada en este mismo horario.');
                    setIsSubmitting(false);
                    return;
                }
            }

            const selectedService = services.find(s => s.id === formData.serviceId);
            let finalCommission = porcentajeGlobal;
            if (selectedService && selectedService.commission_percentage !== undefined && selectedService.commission_percentage !== null) {
                finalCommission = selectedService.commission_percentage;
            }

            let finalReschedulePolicy = reschedulePolicyGlobal;
            if (selectedService && selectedService.reschedule_policy_hours !== undefined && selectedService.reschedule_policy_hours !== null) {
                finalReschedulePolicy = selectedService.reschedule_policy_hours;
            }

            // sessionUser is already fetched at the top of the try block

            const appointmentId = isEditing && editingAppointment ? editingAppointment.id : crypto.randomUUID();

            const payload = {
                id: appointmentId,
                patient_id: formData.patientId || null,
                patient_name: formData.patientName,
                start_time: startDateTime.toISOString(),
                end_time: endDateTime.toISOString(),
                type: formData.type || 'individual',
                fee: formData.fee ? parseFloat(formData.fee) : 0,
                meeting_link: formData.meetingLink || null,
                meeting_platform: formData.meetingPlatform || null,
                notes: formData.notes || null,
                color: formData.color || 'violet',
                user_id: sessionUser?.id ?? null,
                organization_id: organization?.id,
                modality: formData.modality,
                location: formData.location || null,
                is_recurring: formData.isRecurring,
                recurrence_id: isEditing ? editingAppointment?.recurrenceId : (formData.isRecurring ? crypto.randomUUID() : null),
                patient_age: formData.patientAge ? parseInt(formData.patientAge.toString()) : null,
                reason_for_consultation: formData.reasonForConsultation || null,
                service_id: formData.serviceId || null,
                commission_percentage: finalCommission,
                reschedule_policy_hours: finalReschedulePolicy,
            };

            let finalMeetingLink = formData.meetingLink;

            if (formData.meetingPlatform === 'saudade' && !finalMeetingLink) {
                finalMeetingLink = `${window.location.origin}/join/${appointmentId}`;
            }

            // --- External Calendar / Meeting Sync (Google, Microsoft, or Zoom) ---
            const isMeetSelected = formData.meetingPlatform === 'meet';
            const isTeamsSelected = formData.meetingPlatform === 'teams';
            const isZoomSelected = formData.meetingPlatform === 'zoom';
            const wasMeetSelected = isEditing && editingAppointment?.meetingPlatform === 'meet';
            const wasTeamsSelected = isEditing && editingAppointment?.meetingPlatform === 'teams';
            const wasZoomSelected = isEditing && editingAppointment?.meetingPlatform === 'zoom';

            let shouldSyncGoogle = false;
            let shouldSyncMicrosoft = false;
            let shouldSyncZoom = false;

            if (isEditing && wasMeetSelected && !isMeetSelected) {
                finalMeetingLink = '';
            } else if (isEditing && wasTeamsSelected && !isTeamsSelected) {
                finalMeetingLink = '';
            } else if (isEditing && wasZoomSelected && !isZoomSelected) {
                finalMeetingLink = '';
            } else if (isMeetSelected && (!finalMeetingLink || !wasMeetSelected)) {
                shouldSyncGoogle = true;
            } else if (isTeamsSelected && (!finalMeetingLink || !wasTeamsSelected)) {
                shouldSyncMicrosoft = true;
            } else if (isZoomSelected && (!finalMeetingLink || !wasZoomSelected)) {
                shouldSyncZoom = true;
            }

            console.log('[SyncLog] Google:', shouldSyncGoogle, 'Microsoft:', shouldSyncMicrosoft, 'Zoom:', shouldSyncZoom, 'Platform:', formData.meetingPlatform);

            if (shouldSyncGoogle) {
                try {
                    const { data, error: syncErr } = await supabase.functions.invoke('google-calendar-sync', {
                        body: {
                            userId: sessionUser?.id,
                            createMeet: true,
                            event: {
                                summary: `Cita Saudade: ${formData.patientName}`,
                                description: `Tipo: ${formData.type}\nEdad: ${formData.patientAge}\nMotivo: ${formData.reasonForConsultation}\nNotas: ${formData.notes || 'Ninguna'}`,
                                start: { dateTime: startDateTime.toISOString() },
                                end: { dateTime: endDateTime.toISOString() },
                                location: formData.location || undefined,
                            }
                        }
                    });

                    if (syncErr) {
                        console.error('[MeetSync] Error:', syncErr);
                        toast.warning('No se pudo crear el enlace de Google Meet. Puedes agregarlo manualmente.');
                    } else if (data?.meetLink) {
                        finalMeetingLink = data.meetLink;
                        console.log('[MeetSync] Meet link created:', finalMeetingLink);
                    } else if (data?.message === 'Google Calendar not connected') {
                        toast.warning('Google Calendar no está conectado. Conéctalo en Ajustes para generar enlaces automáticamente.');
                    } else if (data?.eventId && !data?.meetLink) {
                        // Google sometimes needs a moment to provision the Meet conference.
                        // Wait briefly and try to fetch the event to get the link.
                        console.warn('[MeetSync] Event created but no Meet link returned. Attempting retry...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        try {
                            const { data: retryData } = await supabase.functions.invoke('google-calendar-sync', {
                                body: {
                                    userId: sessionUser?.id,
                                    createMeet: true,
                                    event: {
                                        summary: `Cita Saudade: ${formData.patientName}`,
                                        description: `Tipo: ${formData.type}\nEdad: ${formData.patientAge}\nMotivo: ${formData.reasonForConsultation}\nNotas: ${formData.notes || 'Ninguna'}`,
                                        start: { dateTime: startDateTime.toISOString() },
                                        end: { dateTime: endDateTime.toISOString() },
                                        location: formData.location || undefined,
                                    }
                                }
                            });
                            if (retryData?.meetLink) {
                                finalMeetingLink = retryData.meetLink;
                                console.log('[MeetSync] Meet link obtained on retry:', finalMeetingLink);
                            } else {
                                toast.warning('El evento se creó en Google Calendar pero el enlace de Meet no se generó. Puedes agregarlo manualmente.');
                            }
                        } catch (retryErr) {
                            console.warn('[MeetSync] Retry also failed:', retryErr);
                            toast.warning('El evento se creó pero el enlace de Meet no se generó. Puedes agregarlo manualmente.');
                        }
                    } else {
                        console.warn('[MeetSync] Unexpected response:', data);
                        toast.warning('No se pudo generar el enlace de Meet. Puedes agregarlo manualmente.');
                    }
                } catch (err) {
                    console.error('[MeetSync] Exception:', err);
                    toast.warning('Error al conectar con Google Calendar. Puedes agregar el enlace manualmente.');
                }
            } else if (shouldSyncMicrosoft) {
                try {
                    const { data, error: syncErr } = await supabase.functions.invoke('microsoft-calendar-sync', {
                        body: {
                            userId: sessionUser?.id,
                            createTeams: true,
                            event: {
                                summary: `Cita Saudade: ${formData.patientName}`,
                                description: `Tipo: ${formData.type}\nEdad: ${formData.patientAge}\nMotivo: ${formData.reasonForConsultation}\nNotas: ${formData.notes || 'Ninguna'}`,
                                start: { dateTime: startDateTime.toISOString() },
                                end: { dateTime: endDateTime.toISOString() },
                            }
                        }
                    });

                    if (syncErr) {
                        console.error('[TeamsSync] Error:', syncErr);
                        toast.warning('No se pudo sincronizar con Microsoft 365.');
                    } else if (data?.teamsLink) {
                        finalMeetingLink = data.teamsLink;
                    } else if (data?.message === 'Microsoft not connected') {
                        toast.warning('Microsoft 365 no está conectado.');
                    }
                } catch (err) {
                    console.error('[TeamsSync] Exception:', err);
                }
            } else if (shouldSyncZoom) {
                try {
                    const { data, error: syncErr } = await supabase.functions.invoke('zoom-meeting-create', {
                        body: {
                            userId: sessionUser?.id,
                            topic: `Cita Saudade: ${formData.patientName}`,
                            startTime: startDateTime.toISOString(),
                            duration: duration
                        }
                    });

                    if (syncErr) {
                        console.error('[ZoomSync] Error:', syncErr);
                        // Retry once after a brief delay
                        console.log('[ZoomSync] Retrying after error...');
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        try {
                            const { data: retryData, error: retryErr } = await supabase.functions.invoke('zoom-meeting-create', {
                                body: {
                                    userId: sessionUser?.id,
                                    topic: `Cita Saudade: ${formData.patientName}`,
                                    startTime: startDateTime.toISOString(),
                                    duration: duration
                                }
                            });
                            if (!retryErr && retryData?.joinUrl) {
                                finalMeetingLink = retryData.joinUrl;
                                console.log('[ZoomSync] Zoom link obtained on retry:', finalMeetingLink);
                            } else {
                                toast.warning('No se pudo generar la reunión en Zoom. Puedes agregar el enlace manualmente.');
                            }
                        } catch (retryExc) {
                            console.error('[ZoomSync] Retry exception:', retryExc);
                            toast.warning('No se pudo generar la reunión en Zoom. Puedes agregar el enlace manualmente.');
                        }
                    } else if (data?.joinUrl) {
                        finalMeetingLink = data.joinUrl;
                        console.log('[ZoomSync] Zoom link created:', finalMeetingLink);
                    } else if (data?.message === 'Zoom not connected') {
                        toast.warning('Zoom no está conectado. Por favor, conéctalo en Ajustes.');
                    } else if (data?.error) {
                        console.error('[ZoomSync] Error en API:', data.error);
                        toast.warning(`Error de Zoom: ${data.error}. Puedes agregar el enlace manualmente.`);
                    } else {
                        console.warn('[ZoomSync] Unexpected response:', data);
                        toast.warning('No se pudo generar la reunión en Zoom. Puedes agregar el enlace manualmente.');
                    }
                } catch (err) {
                    console.error('[ZoomSync] Exception:', err);
                    toast.warning('Error al conectar con Zoom. Puedes agregar el enlace manualmente.');
                }
            }

            if (isEditing && editingAppointment) {
                let finalNotes = formData.notes;
                // Add cancellation audit if status changed to cancelled
                if (formData.status === 'cancelled' && editingAppointment.status !== 'cancelled') {
                    const timestamp = format(new Date(), 'dd/MM/yyyy HH:mm');
                    const cancelAudit = `\n[Cancelada por ${specialistName || 'el especialista'} el ${timestamp}]`;
                    finalNotes = (formData.notes || '') + cancelAudit;
                }

                if (formData.editSeries && editingAppointment.recurrenceId) {
                    // Update this one and all future instances in the series
                    const { error } = await supabase
                        .from('appointments')
                        .update({
                            type: payload.type,
                            fee: payload.fee,
                            meeting_link: finalMeetingLink,
                            meeting_platform: payload.meeting_platform,
                            notes: finalNotes,
                            status: formData.status,
                            color: payload.color,
                            modality: payload.modality,
                            location: payload.location,
                            patient_age: payload.patient_age,
                            reason_for_consultation: payload.reason_for_consultation,
                            commission_percentage: payload.commission_percentage,
                            reschedule_policy_hours: payload.reschedule_policy_hours,
                        })
                        .eq('recurrence_id', editingAppointment.recurrenceId)
                        .gte('start_time', editingAppointment.startTime);
                    if (error) throw error;
                    toast.success('Serie de citas actualizada');
                } else {
                    const { error } = await supabase
                        .from('appointments')
                        .update({
                            ...payload,
                            meeting_link: finalMeetingLink,
                            notes: finalNotes,
                            status: formData.status
                        })
                        .eq('id', editingAppointment.id);
                    if (error) throw error;
                    toast.success('Cita actualizada');
                }
            } else {
                if (formData.isRecurring) {
                    // Bulk creation
                    const sessions = [];
                    const recurrenceId = payload.recurrence_id;
                    const numWeeks = Math.max(2, Math.min(52, parseInt(String(formData.recurrenceWeeks), 10) || 2));

                    for (let i = 0; i < numWeeks; i++) {
                        const currentStart = new Date(startDateTime.getTime() + i * 7 * 24 * 60 * 60 * 1000);
                        const currentEnd = new Date(endDateTime.getTime() + i * 7 * 24 * 60 * 60 * 1000);
                        const sessionAptId = crypto.randomUUID();
                        let sessionMeetingLink = finalMeetingLink;
                        if (payload.meeting_platform === 'saudade') {
                            sessionMeetingLink = `${window.location.origin}/join/${sessionAptId}`;
                        }

                        sessions.push({
                            ...payload,
                            id: sessionAptId,
                            start_time: currentStart.toISOString(),
                            end_time: currentEnd.toISOString(),
                            recurrence_id: recurrenceId,
                            meeting_link: sessionMeetingLink,
                            status: formData.status || 'scheduled',
                            payment_status: 'pending',
                        });
                    }

                    const { error } = await supabase.from('appointments').insert(sessions);
                    if (error) throw error;
                    toast.success(`${numWeeks} citas agendadas correctamente`);
                } else {
                    const { error } = await supabase.from('appointments').insert([{
                        ...payload,
                        meeting_link: finalMeetingLink,
                        status: formData.status || 'scheduled',
                        payment_status: 'pending',
                    }]);
                    if (error) throw error;
                    toast.success(`Cita con ${formData.patientName} agendada correctamente`);
                }

                // Pipeline CRM Automation: Move matching lead to 'cita_agendada'
                if (organization?.id && formData.patientName) {
                    try {
                        await supabase
                            .from('leads')
                            .update({ status: 'cita_agendada' })
                            .eq('organization_id', organization.id)
                            .ilike('name', formData.patientName.trim())
                            .in('status', ['nuevo_lead', 'contactado']);
                    } catch (pipelineErr) {
                        console.warn('Error al auto-actualizar el lead en pipeline:', pipelineErr);
                    }
                }

                await logActivity({
                    profile_id: sessionUser!.id,
                    type: 'appointment_created',
                    title: 'Nueva Cita Agendada',
                    description: `Has agendado una cita con ${formData.patientName} el ${format(startDateTime, "d 'de' MMMM", { locale: es })} a las ${format(startDateTime, "HH:mm")}.`,
                    organization_id: organization?.id,
                });

                const { data: { session } } = await supabase.auth.getSession();
                supabase.functions.invoke('notify-appointment', {
                    headers: {
                        Authorization: `Bearer ${session?.access_token}`
                    },
                    body: {
                        psychologistId: sessionUser?.id,
                        patientId: formData.patientId || null,
                        patientName: formData.patientName,
                        patientEmail: formData.patientEmail || undefined,
                        patientPhone: formData.patientPhone || undefined,
                        startTime: startDateTime.toISOString(),
                        endTime: endDateTime.toISOString(),
                        sessionType: formData.type || 'individual',
                        fee: formData.fee ? parseFloat(formData.fee) : 0,
                        modality: formData.modality,
                        location: formData.location || null,
                        meetingLink: finalMeetingLink,
                        meetingPlatform: formData.meetingPlatform || null,
                        notes: `Edad: ${formData.patientAge || 'N/A'}\nMotivo: ${formData.reasonForConsultation || 'N/A'}\nNotas: ${formData.notes || 'Ninguna'}`,
                    },
                }).then(({ data, error }) => {
                    if (error) {
                        console.error('[NewAppointmentDialog] notify-appointment error:', error);
                    } else {
                        console.log('[NewAppointmentDialog] notify-appointment result:', data);
                    }
                }).catch((err: any) => {
                    console.warn('[NewAppointmentDialog] notify-appointment network error:', err.message);
                });
            }

            resetForm();
            onOpenChange(false);
            if (onAppointmentAdded) onAppointmentAdded();

        } catch (error: any) {
            console.error('Error al guardar cita:', error);
            toast.error('Error al guardar la cita: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const [isRequestingPayment, setIsRequestingPayment] = useState(false);

    const handleCancelAppointment = async (cancelSeries: boolean = false, permanentDelete: boolean = false) => {
        if (!editingAppointment) return;
        setIsCancelling(true);
        try {
            if (permanentDelete) {
                if (cancelSeries && editingAppointment.recurrenceId) {
                    const { error } = await supabase
                        .from('appointments')
                        .delete()
                        .eq('recurrence_id', editingAppointment.recurrenceId)
                        .gte('start_time', editingAppointment.startTime);
                    if (error) throw error;
                    toast.success('Serie de citas eliminada permanentemente');
                } else {
                    const { error } = await supabase
                        .from('appointments')
                        .delete()
                        .eq('id', editingAppointment.id);
                    if (error) throw error;
                    toast.success('Cita eliminada permanentemente');
                }
            } else {
                if (cancelSeries && editingAppointment.recurrenceId) {
                    const { error } = await supabase
                        .from('appointments')
                        .update({ status: 'cancelled' })
                        .eq('recurrence_id', editingAppointment.recurrenceId)
                        .gte('start_time', editingAppointment.startTime);
                    if (error) throw error;
                    toast.success('Serie recurrente cancelada con éxito');
                } else {
                    const { error } = await supabase
                        .from('appointments')
                        .update({ status: 'cancelled' })
                        .eq('id', editingAppointment.id);
                    if (error) throw error;
                    toast.success('Cita cancelada con éxito');
                }
            }
            onOpenChange(false);
            if (onAppointmentAdded) onAppointmentAdded();
        } catch (err: any) {
            toast.error('Error al procesar: ' + err.message);
        } finally {
            setIsCancelling(false);
            setConfirmCancel(false);
        }
    };

    const [isManagingNoShow, setIsManagingNoShow] = useState(false);

    const handleNoShowAction = async () => {
        if (!editingAppointment) return;
        setIsManagingNoShow(true);
        try {
            const noteText = `[Inasistencia registrada el ${format(new Date(), "d 'de' MMMM", { locale: es })}. Se aplica penalización/cobro.]`;
            const updatedNotes = formData.notes ? `${formData.notes}\n${noteText}` : noteText;

            const { error } = await supabase
                .from('appointments')
                .update({ 
                    notes: updatedNotes
                })
                .eq('id', editingAppointment.id);

            if (error) throw error;

            if (formData.patientPhone) {
                const cleanPhone = formData.patientPhone.replace(/[^0-9]/g, '');
                const patientFirstName = formData.patientName?.split(' ')[0] || 'paciente';
                const sessionTime = format(new Date(editingAppointment.startTime), "h:mm a");
                const feeText = formData.fee ? `($${formData.fee} MXN)` : '';
                
                const wpMsg = `Hola ${patientFirstName}, esperamos te encuentres bien. Notamos que no pudiste asistir a tu sesión de hoy a las ${sessionTime}. Conforme a las políticas clínicas acordadas, la sesión se considera reservada ${feeText}. Para reagendar tu cita o revisar cualquier eventualidad, por favor responde a este mensaje. ¡Estamos para apoyarte! 🌿`;
                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(wpMsg)}`, '_blank');
            }

            toast.success('Inasistencia registrada y mensaje para reagendar preparado en WhatsApp');
            setFormData(prev => ({ ...prev, notes: updatedNotes }));
            if (onAppointmentAdded) onAppointmentAdded();
        } catch (err: any) {
            toast.error('Error al registrar inasistencia: ' + err.message);
        } finally {
            setIsManagingNoShow(false);
        }
    };

    const handleRequestPayment = async () => {
        if (!editingAppointment) return;
        setIsRequestingPayment(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa');

            // 1. Crear sesión de Stripe
            const { data: resData, error: resError } = await supabase.functions.invoke('create-checkout-session', {
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: { 
                    appointment_id: editingAppointment.id,
                    amount_mxn: formData.fee || editingAppointment.fee || 0,
                    patient_name: formData.patientName || 'Paciente',
                    description: `Pago de sesión - ${format(new Date(editingAppointment.start_time), "d 'de' MMMM", { locale: es })}`
                }
            });

            if (resError) throw new Error(resError.message || 'Error al crear cobro en Stripe');
            
            const stripeUrl = resData.url;
            const urlParts = stripeUrl.split('/pay/');
            const paymentId = urlParts.length > 1 ? urlParts[1] : null;

            if (!paymentId) throw new Error('URL de Stripe inválida');

            // 2. Mandar WhatsApp
            const { error: wpError } = await supabase.functions.invoke('meta-whatsapp', {
                body: {
                    action: 'send',
                    organization_id: organization?.id,
                    patient_id: editingAppointment.patient_id,
                    phone: formData.patientPhone,
                    template_id: 'pago_pendiente',
                    template_variables: [
                        formData.patientName || 'Paciente',
                        format(new Date(editingAppointment.start_time), "d 'de' MMMM 'del' yyyy", { locale: es }),
                        format(new Date(editingAppointment.start_time), "h:mm a"),
                        specialistName || 'tu terapeuta',
                        `$ ${formData.fee || editingAppointment.fee || 0}`
                    ],
                    template_button_variables: [paymentId]
                }
            });

            if (wpError) throw new Error('Cobro creado pero falló WhatsApp');

            toast.success('¡Enlace de cobro enviado por WhatsApp!');
        } catch (error: any) {
            toast.error(error.message || 'Error desconocido');
            console.error('Error al solicitar pago:', error);
        } finally {
            setIsRequestingPayment(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); setConfirmCancel(false); }}>
            <DialogContent className="sm:max-w-[600px] h-[85vh] p-0 flex flex-col gap-0 overflow-hidden">
                <div className="px-6 py-4 border-b">
                    <DialogHeader>
                        <DialogTitle>{isReadOnly ? 'Detalles de la Cita' : isEditing ? 'Editar Cita' : 'Nueva Cita'}</DialogTitle>
                        <DialogDescription>
                            {isReadOnly
                                ? 'Esta cita ya pasó y no puede ser modificada'
                                : isEditing
                                    ? 'Modifica los datos de la cita o cancélala'
                                    : 'Agenda una nueva sesión con un paciente'}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                {isReadOnly && (
                    <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/50">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-4 w-4" />
                            <p className="text-xs font-medium">Cita en el pasado: Solo lectura</p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                        {/* Paciente */}
                        <div className="space-y-2">
                            <Label htmlFor="patient">Paciente *</Label>
                            <PatientAutocomplete
                                value={formData.patientId}
                                onSelect={(patientId, patientName, patientObj) => {
                                    if (!isReadOnly) {
                                        setFormData(prev => ({
                                            ...prev,
                                            patientId,
                                            patientName,
                                            patientEmail: patientObj?.email || prev.patientEmail,
                                            patientPhone: patientObj?.phone || prev.patientPhone,
                                            ...(isEditing ? {} : { reasonForConsultation: '', notes: '' })
                                        }));
                                    }
                                }}
                                placeholder={isReadOnly ? formData.patientName : (formData.patientName || 'Buscar paciente por nombre o email...')}
                                disabled={isReadOnly}
                            />
                        </div>

                        {/* Estado de la cita */}
                        <div className="space-y-2">
                            <Label htmlFor="status">Estado de la cita</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value) => !isReadOnly && setFormData({ ...formData, status: value })}
                                disabled={isReadOnly}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona el estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="scheduled">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                                            Sin confirmar
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="confirmed">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                                            Confirmada
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="pending">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-yellow-400 inline-block" />
                                            En espera
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="completed">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-violet-500 inline-block" />
                                            Completada
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="cancelled">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                                            Cancelada
                                        </span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Color de la cita */}
                        <div className="space-y-2">
                            <Label>Color de la cita</Label>
                            <div className="flex flex-wrap gap-2">
                                {APPOINTMENT_COLORS.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        title={c.label}
                                        onClick={() => !isReadOnly && setFormData({ ...formData, color: c.value })}
                                        disabled={isReadOnly}
                                        className={cn(
                                            'h-7 w-7 rounded-full transition-all',
                                            c.bg,
                                            formData.color === c.value
                                                ? `ring-2 ring-offset-2 ${c.ring} scale-110`
                                                : isReadOnly ? 'opacity-50' : 'opacity-70 hover:opacity-100 hover:scale-105'
                                        )}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Servicio de Agenda */}
                        {services.length > 0 && !isReadOnly && (
                            <div className="space-y-2">
                                <Label htmlFor="serviceId">Servicio de Agenda (Opcional)</Label>
                                <Select
                                    value={formData.serviceId}
                                    onValueChange={handleServiceChange}
                                >
                                    <SelectTrigger className="border-primary/20 bg-primary/5 font-medium">
                                        <SelectValue placeholder="Selecciona un servicio para autocompletar" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Personalizado</SelectItem>
                                        {services.map(s => (
                                            <SelectItem key={s.id} value={s.id}>
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("h-2 w-2 rounded-full", {
                                                        'bg-violet-500': s.color === 'violet',
                                                        'bg-blue-500': s.color === 'blue',
                                                        'bg-emerald-500': s.color === 'green',
                                                        'bg-amber-500': s.color === 'amber',
                                                        'bg-rose-500': s.color === 'rose',
                                                        'bg-indigo-500': s.color === 'indigo',
                                                    })} />
                                                    {s.name} ({s.duration}m — ${s.price})
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Tipo de sesión */}
                        <div className="space-y-2">
                            <Label htmlFor="type">Tipo de Sesión</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(value) => {
                                    if (isReadOnly) return;
                                    if (value === 'block') {
                                        setFormData(prev => ({
                                            ...prev,
                                            type: value,
                                            patientName: prev.patientName || 'Bloqueo de Horario / Tiempo Personal',
                                            color: 'slate',
                                            fee: '0',
                                        }));
                                    } else {
                                        setFormData(prev => ({ ...prev, type: value }));
                                    }
                                }}
                                disabled={isReadOnly}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona el tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="individual">Sesión Individual</SelectItem>
                                    <SelectItem value="couple">Terapia de Pareja</SelectItem>
                                    <SelectItem value="group">Sesión Grupal</SelectItem>
                                    <SelectItem value="initial">Consulta Inicial</SelectItem>
                                    <SelectItem value="follow_up">Seguimiento</SelectItem>
                                    <SelectItem value="block">🚫 Bloqueo de Horario / Tiempo Personal</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* ── Fecha ── */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha de la Cita</Label>
                            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isSubmitting || isReadOnly}
                                        className={cn(
                                            'w-full justify-start text-left h-12 rounded-xl border-border/60 bg-muted/30 font-medium text-[14px] hover:bg-muted/50 transition-all duration-200',
                                            !date && 'text-muted-foreground'
                                        )}
                                    >
                                        <CalendarIcon className="mr-3 h-[18px] w-[18px] text-primary/70 shrink-0" />
                                        {date ? format(date, "EEEE, d 'de' MMMM", { locale: es }) : 'Selecciona una fecha'}
                                    </Button>
                                </PopoverTrigger>
                                {!isReadOnly && (
                                    <PopoverContent className="w-auto p-3 rounded-2xl border-border/50 shadow-lg space-y-3" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={date}
                                            onSelect={(d) => {
                                                if (d) setDate(d);
                                            }}
                                            locale={es}
                                            initialFocus
                                            disabled={(d) => {
                                                const now = new Date();
                                                if (isBefore(startOfDay(d), startOfDay(now))) return true;
                                                // Tope de temporalidad: máximo 90 días a futuro (evitar citas infinitas)
                                                const maxFutureDate = addDays(startOfDay(now), 90);
                                                if (isAfter(startOfDay(d), maxFutureDate)) return true;

                                                const isoDate = format(d, 'yyyy-MM-dd');
                                                if (horarioConfig.dias_no_laborables.includes(isoDate)) return true;
                                                const weekday = d.getDay();
                                                const config = horarioConfig.dias?.[weekday];
                                                if (!config?.activo) return true;
                                                if (isoDate === format(now, 'yyyy-MM-dd')) {
                                                    const [finH, finM] = (config?.fin || '17:00').split(':').map(Number);
                                                    if (now.getHours() > finH || (now.getHours() === finH && now.getMinutes() >= finM)) return true;
                                                }
                                                return false;
                                            }}
                                        />
                                        <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                                            <div className="flex flex-col">
                                                <span className="text-xs text-muted-foreground font-medium pl-1">
                                                    {date ? format(date, "d 'de' MMMM", { locale: es }) : 'Ninguna fecha'}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground/75 pl-1">
                                                    Máximo 90 días a futuro
                                                </span>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-9 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
                                                onClick={() => setIsCalendarOpen(false)}
                                            >
                                                <Check className="mr-1.5 h-3.5 w-3.5" />
                                                Seleccionar
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                )}
                            </Popover>
                        </div>

                        {/* ── Hora ── */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hora de Inicio</Label>
                                <button
                                    type="button"
                                    onClick={() => !isReadOnly && setIsManualTime(!isManualTime)}
                                    className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                                >
                                    {isManualTime ? 'Seleccionar de lista' : 'Editar hora manualmente'}
                                </button>
                            </div>

                            {isManualTime ? (
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Clock className="absolute left-3 top-3.5 h-[18px] w-[18px] text-primary/70 shrink-0" />
                                        <Input
                                            type="time"
                                            value={formData.startTime}
                                            onChange={(e) => !isReadOnly && setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                            disabled={isSubmitting || isReadOnly}
                                            className="h-12 pl-10 rounded-xl border-border/60 bg-muted/30 font-medium text-[14px]"
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsManualTime(false)}
                                        className="h-12 px-3 rounded-xl text-xs"
                                    >
                                        Ver Lista
                                    </Button>
                                </div>
                            ) : (
                                <Select
                                    value={formData.startTime}
                                    onValueChange={(val) => !isReadOnly && setFormData(prev => ({ ...prev, startTime: val }))}
                                    disabled={isSubmitting || isReadOnly}
                                >
                                    <SelectTrigger className="w-full h-12 rounded-xl border-border/60 bg-muted/30 font-medium text-[14px] hover:bg-muted/50 transition-all duration-200 [&>svg]:text-muted-foreground">
                                        <div className="flex items-center">
                                            <Clock className="mr-3 h-[18px] w-[18px] text-primary/70 shrink-0" />
                                            <SelectValue placeholder="Selecciona una hora" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64 rounded-2xl border-border/50 shadow-lg p-1">
                                        {(() => {
                                            const weekday = (date || new Date()).getDay();
                                            const config = horarioConfig.dias?.[weekday] || { inicio: '08:00', fin: '17:00' };
                                            const startH = parseInt((config.inicio || '08:00').split(':')[0]) || 8;
                                            const endH = parseInt((config.fin || '17:00').split(':')[0]) || 17;

                                            const isTodayDate = date && format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                                            const now = new Date();
                                            const nowMinutes = now.getHours() * 60 + now.getMinutes();

                                            const slots: { timeStr: string; label12h: string }[] = [];
                                            for (let h = startH; h <= endH; h++) {
                                                for (const m of ['00', '30']) {
                                                    if (h === endH && m === '30') continue;
                                                    const hh = String(h).padStart(2, '0');
                                                    const timeStr = `${hh}:${m}`;
                                                    const period = h >= 12 ? 'PM' : 'AM';
                                                    const h12 = h % 12 === 0 ? 12 : h % 12;
                                                    const label12h = `${h12}:${m} ${period}`;
                                                    slots.push({ timeStr, label12h });
                                                }
                                            }

                                            return slots.map(slot => {
                                                const isOccupied = !!getOverlappingAppointment(slot.timeStr);
                                                let isPast = false;
                                                if (isTodayDate) {
                                                    const [sh, sm] = slot.timeStr.split(':').map(Number);
                                                    if (sh * 60 + sm <= nowMinutes) isPast = true;
                                                }

                                                const isDisabled = isOccupied || isPast;

                                                return (
                                                    <SelectItem
                                                        key={slot.timeStr}
                                                        value={slot.timeStr}
                                                        disabled={isDisabled}
                                                        className={cn(
                                                            'rounded-lg text-[13px] font-medium py-2.5 px-3.5 my-0.5 cursor-pointer transition-colors [&>span:first-child]:hidden',
                                                            !isDisabled && 'hover:bg-primary/8 focus:bg-primary/10',
                                                            isDisabled && 'opacity-35 cursor-not-allowed'
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between w-full">
                                                            <span>{slot.label12h}</span>
                                                            {isOccupied && (
                                                                <span className="text-[10px] font-semibold text-destructive/80 bg-destructive/8 px-2 py-0.5 rounded-full ml-3">
                                                                    Ocupado
                                                                </span>
                                                            )}
                                                            {isPast && !isOccupied && (
                                                                <span className="text-[10px] font-medium text-muted-foreground/60 ml-3">
                                                                    Pasado
                                                                </span>
                                                            )}
                                                        </div>
                                                    </SelectItem>
                                                );
                                            });
                                        })()}
                                    </SelectContent>
                                </Select>
                            )}

                            {/* Horas cerradas rápidas */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                <span className="text-[10px] text-muted-foreground font-semibold">Horas en punto:</span>
                                {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map((h) => (
                                    <button
                                        key={h}
                                        type="button"
                                        onClick={() => !isReadOnly && setFormData(prev => ({ ...prev, startTime: h }))}
                                        className={cn(
                                            "px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all border cursor-pointer",
                                            formData.startTime === h
                                                ? "bg-primary text-white border-primary shadow-xs"
                                                : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        {h}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Modalidad */}
                        <div className="space-y-2">
                            <Label htmlFor="modality">Modalidad</Label>
                            <Select
                                value={formData.modality}
                                onValueChange={(value: any) => {
                                    if (isReadOnly) return;
                                    const updates: any = { modality: value };
                                    if (value === 'online' && !formData.meetingPlatform) {
                                        updates.meetingPlatform = specialistDefaultPlatform || 'saudade';
                                    }
                                    if (value === 'presencial' && !formData.location && defaultLocation) {
                                        updates.location = `${defaultLocation.name}${defaultLocation.address ? ` - ${defaultLocation.address}` : ''}${defaultLocation.instructions ? ` [Ref: ${defaultLocation.instructions}]` : ''}`;
                                    }
                                    setFormData({ ...formData, ...updates });
                                }}
                                disabled={isReadOnly}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona la modalidad" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="presencial">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4" />
                                            Presencial
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="online">
                                        <div className="flex items-center gap-2">
                                            <Video className="h-4 w-4" />
                                            En línea
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.modality === 'online' ? (
                            <>
                                {/* Plataforma de videollamada */}
                                <div className="space-y-2">
                                    <Label htmlFor="platform">Plataforma de Videollamada</Label>
                                    <Select
                                        value={formData.meetingPlatform}
                                        onValueChange={(value) => !isReadOnly && setFormData({ ...formData, meetingPlatform: value })}
                                        disabled={isReadOnly}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona la plataforma" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="saudade">Videollamada Saudade (Consultorio Virtual)</SelectItem>
                                            <SelectItem value="meet">Google Meet</SelectItem>
                                            <SelectItem value="zoom">Zoom</SelectItem>
                                            <SelectItem value="whatsapp">WhatsApp Video</SelectItem>
                                            <SelectItem value="teams">Microsoft Teams</SelectItem>
                                            <SelectItem value="other">Otra plataforma</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Link de videollamada */}
                                <div className="space-y-2">
                                    <Label htmlFor="meetingLink">Link de Videollamada (Opcional)</Label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Video className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="meetingLink"
                                                type="url"
                                                placeholder="https://zoom.us/j/... o https://meet.google.com/..."
                                                className="pl-9"
                                                value={formData.meetingLink}
                                                onChange={(e) => !isReadOnly && setFormData({ ...formData, meetingLink: e.target.value })}
                                                disabled={isSubmitting || isReadOnly}
                                            />
                                        </div>
                                        {formData.meetingLink && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="h-10 w-10 shrink-0"
                                                onClick={async () => {
                                                    try {
                                                        await navigator.clipboard.writeText(formData.meetingLink);
                                                        setCopiedLink(true);
                                                        toast.success('Enlace de videollamada copiado');
                                                        setTimeout(() => setCopiedLink(false), 2000);
                                                    } catch (err) {
                                                        toast.error('Error al copiar el enlace');
                                                    }
                                                }}
                                                title="Copiar enlace"
                                            >
                                                {copiedLink ? (
                                                    <Check className="h-4 w-4 text-emerald-500" />
                                                ) : (
                                                    <Copy className="h-4 w-4" />
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Puedes agregar el link después de crear la reunión en Zoom o Meet
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                                        <Building2 className="h-4 w-4 text-primary" />
                                        Sede / Consultorio Presencial
                                    </Label>
                                    {!isReadOnly && !isAddingLocation && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setIsAddingLocation(true);
                                                setNewLocName('');
                                                setNewLocAddress('');
                                                setNewLocInstructions('');
                                            }}
                                            className="h-7 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Otra sede
                                        </Button>
                                    )}
                                </div>

                                {!isAddingLocation ? (
                                    <div className="space-y-2.5">
                                        {/* Lista de chips / botones de sedes registradas */}
                                        <div className="flex flex-wrap gap-2">
                                            {locations.map((loc) => {
                                                const isSelected = Boolean(
                                                    formData.location && (
                                                        formData.location.startsWith(loc.name) ||
                                                        (loc.address && formData.location.includes(loc.address))
                                                    )
                                                );

                                                return (
                                                    <button
                                                        key={loc.id}
                                                        type="button"
                                                        disabled={isReadOnly}
                                                        onClick={() => {
                                                            const locStr = `${loc.name}${loc.address ? ` - ${loc.address}` : ''}${loc.instructions ? ` [Ref: ${loc.instructions}]` : ''}`;
                                                            setFormData(prev => ({ ...prev, location: locStr }));
                                                        }}
                                                        className={cn(
                                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all text-left",
                                                            isSelected
                                                                ? "border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary/30"
                                                                : "border-border bg-card hover:bg-accent/50 text-muted-foreground"
                                                        )}
                                                    >
                                                        <MapPin className={cn("h-3.5 w-3.5", isSelected ? "text-primary" : "text-muted-foreground")} />
                                                        <span>{loc.name}</span>
                                                        {loc.isDefault && (
                                                            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                                                                Principal
                                                            </span>
                                                        )}
                                                        {isSelected && (
                                                            <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-1" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Tarjeta de Detalle del Consultorio Seleccionado */}
                                        {formData.location ? (
                                            <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-1.5 animate-fade-in">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        Ubicación asignada para la cita
                                                    </span>
                                                    {!isReadOnly && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                setIsAddingLocation(true);
                                                                setNewLocName(formData.location.split(' - ')[0] || formData.location);
                                                                setNewLocAddress(formData.location.split(' - ')[1]?.split(' [Ref:')[0] || '');
                                                                setNewLocInstructions(formData.location.split(' [Ref: ')[1]?.replace(']', '') || '');
                                                            }}
                                                            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                                        >
                                                            Personalizar
                                                        </Button>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-700 dark:text-slate-200 font-medium">
                                                    {formData.location}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Esta dirección se incluirá automáticamente en los recordatorios de WhatsApp y en tu agenda.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                                                <Info className="h-4 w-4 shrink-0" />
                                                <span>Selecciona un consultorio de la lista de arriba para evitar errores de dirección.</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Formulario para agregar / personalizar sede */
                                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                                            <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                                                <Plus className="h-4 w-4" />
                                                Nueva Sede / Consultorio
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setIsAddingLocation(false)}
                                                className="h-6 px-2 text-[11px]"
                                            >
                                                Cancelar
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Nombre de la Sede / Consultorio *</Label>
                                                <Input
                                                    placeholder="Ej. Consultorio Roma Norte"
                                                    value={newLocName}
                                                    onChange={(e) => setNewLocName(e.target.value)}
                                                    className="h-8 text-xs bg-background"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Dirección Física *</Label>
                                                <Input
                                                    placeholder="Ej. Av. Álvaro Obregón 151, Int. 301"
                                                    value={newLocAddress}
                                                    onChange={(e) => setNewLocAddress(e.target.value)}
                                                    className="h-8 text-xs bg-background"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs">Referencias / Instrucciones de acceso (opcional)</Label>
                                            <Input
                                                placeholder="Ej. Piso 3, tocar interfón 301. Edificio con elevador."
                                                value={newLocInstructions}
                                                onChange={(e) => setNewLocInstructions(e.target.value)}
                                                className="h-8 text-xs bg-background"
                                            />
                                        </div>

                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={saveForFuture}
                                                    onChange={(e) => setSaveForFuture(e.target.checked)}
                                                    className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                                                />
                                                <span>Guardar en mi catálogo para futuras citas</span>
                                            </label>

                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={!newLocName.trim()}
                                                onClick={async () => {
                                                    const locStr = `${newLocName.trim()}${newLocAddress.trim() ? ` - ${newLocAddress.trim()}` : ''}${newLocInstructions.trim() ? ` [Ref: ${newLocInstructions.trim()}]` : ''}`;
                                                    if (saveForFuture) {
                                                        await saveLocation({
                                                            name: newLocName.trim(),
                                                            address: newLocAddress.trim() || 'Consultorio',
                                                            instructions: newLocInstructions.trim() || undefined,
                                                        });
                                                    }
                                                    setFormData(prev => ({ ...prev, location: locStr }));
                                                    setIsAddingLocation(false);
                                                }}
                                                className="h-8 text-xs gap-1 self-end sm:self-auto"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                                Aplicar Ubicación
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Recurrencia */}
                        {!isEditing && (
                            <div className="space-y-4 p-3 border rounded-lg bg-muted/20">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium">Cita Recurrente</Label>
                                        <p className="text-xs text-muted-foreground">Repetir esta cita semanalmente</p>
                                    </div>
                                    <Switch
                                        checked={formData.isRecurring}
                                        onCheckedChange={(checked) => !isReadOnly && setFormData({ ...formData, isRecurring: checked })}
                                        disabled={isReadOnly}
                                    />
                                </div>
                                {formData.isRecurring && (
                                    <div className="space-y-3 p-3.5 rounded-xl border border-primary/20 bg-primary/[0.02] animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="weeks" className="text-xs font-semibold">Número de semanas</Label>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Se programarán <span className="font-bold text-primary">{Math.max(2, Math.min(52, parseInt(String(formData.recurrenceWeeks), 10) || 2))} sesiones</span> consecutivas (1 por semana).
                                                </p>
                                            </div>
                                            <div className="w-24 shrink-0">
                                                <Input
                                                    id="weeks"
                                                    type="number"
                                                    min={2}
                                                    max={52}
                                                    value={formData.recurrenceWeeks}
                                                    onChange={(e) => {
                                                        if (isReadOnly) return;
                                                        const val = e.target.value;
                                                        if (val === '') {
                                                            setFormData({ ...formData, recurrenceWeeks: '' });
                                                        } else {
                                                            const parsed = parseInt(val, 10);
                                                            setFormData({ ...formData, recurrenceWeeks: isNaN(parsed) ? '' : parsed });
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        const val = parseInt(String(formData.recurrenceWeeks), 10);
                                                        if (!val || val < 2) {
                                                            setFormData({ ...formData, recurrenceWeeks: 2 });
                                                        } else if (val > 52) {
                                                            setFormData({ ...formData, recurrenceWeeks: 52 });
                                                        }
                                                    }}
                                                    placeholder="2"
                                                    className="h-9 text-center font-bold text-sm bg-card"
                                                    disabled={isReadOnly}
                                                />
                                            </div>
                                        </div>

                                        {/* Presets rápidos de tratamiento */}
                                        <div className="flex items-center flex-wrap gap-1.5 pt-1 border-t border-border/40">
                                            <span className="text-[10px] text-muted-foreground font-medium mr-1">Frecuentes:</span>
                                            {[
                                                { label: '4 sem (1 mes)', weeks: 4 },
                                                { label: '8 sem (2 meses)', weeks: 8 },
                                                { label: '12 sem (3 meses)', weeks: 12 },
                                                { label: '24 sem (6 meses)', weeks: 24 },
                                            ].map((preset) => (
                                                <button
                                                    key={preset.weeks}
                                                    type="button"
                                                    onClick={() => !isReadOnly && setFormData({ ...formData, recurrenceWeeks: preset.weeks })}
                                                    className={cn(
                                                        "px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border",
                                                        Number(formData.recurrenceWeeks) === preset.weeks
                                                            ? "bg-primary text-white border-primary shadow-xs"
                                                            : "bg-background text-muted-foreground border-border/70 hover:border-primary/40 hover:text-foreground"
                                                    )}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Opción de editar serie */}
                        {isEditing && editingAppointment?.recurrenceId && (
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Repeat className="h-4 w-4 text-blue-600" />
                                        <Label className="text-sm font-medium">Editar Serie</Label>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Aplicar cambios a todas las citas futuras</p>
                                </div>
                                <Switch
                                    checked={formData.editSeries}
                                    onCheckedChange={(checked) => !isReadOnly && setFormData({ ...formData, editSeries: checked })}
                                    disabled={isReadOnly}
                                />
                            </div>
                        )}

                        {/* Tarifa */}
                        <div className="space-y-2">
                            <Label htmlFor="fee">Tarifa ($)</Label>
                            <Input
                                id="fee"
                                type="number"
                                placeholder="80"
                                value={formData.fee}
                                onChange={(e) => !isReadOnly && setFormData({ ...formData, fee: e.target.value })}
                                disabled={isSubmitting || isReadOnly}
                            />
                        </div>

                        {/* Control de primera sesión: quitar edad y motivo excepto si es primera consulta */}
                        <div className="flex items-center justify-between p-3.5 border border-border/70 rounded-xl bg-muted/20">
                            <div className="space-y-0.5">
                                <Label htmlFor="firstSessionToggle" className="text-xs font-semibold cursor-pointer">
                                    ¿Es primera sesión / consulta inicial?
                                </Label>
                                <p className="text-[11px] text-muted-foreground">
                                    {isFirstSession 
                                        ? 'Se registrará edad y motivo de consulta inicial.' 
                                        : 'Sesión de seguimiento: edad y motivo ocultos para evitar duplicación.'}
                                </p>
                            </div>
                            <Switch
                                id="firstSessionToggle"
                                checked={isFirstSession}
                                onCheckedChange={(checked) => !isReadOnly && setIsFirstSession(checked)}
                                disabled={isReadOnly}
                            />
                        </div>

                        {isFirstSession && (
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                                <div className="space-y-2">
                                    <Label htmlFor="patientAge">Edad</Label>
                                    <Input
                                        id="patientAge"
                                        type="number"
                                        placeholder="Ej. 25"
                                        value={formData.patientAge}
                                        onChange={(e) => !isReadOnly && setFormData({ ...formData, patientAge: e.target.value })}
                                        disabled={isSubmitting || isReadOnly}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reasonForConsultation">Motivo de Consulta</Label>
                                    <Input
                                        id="reasonForConsultation"
                                        placeholder="Ej. Ansiedad, Depresión..."
                                        value={formData.reasonForConsultation}
                                        onChange={(e) => !isReadOnly && setFormData({ ...formData, reasonForConsultation: e.target.value })}
                                        disabled={isSubmitting || isReadOnly}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Notas */}
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notas (Opcional)</Label>
                            <Textarea
                                id="notes"
                                placeholder="Notas adicionales sobre la cita..."
                                rows={3}
                                value={formData.notes}
                                onChange={(e) => !isReadOnly && setFormData({ ...formData, notes: e.target.value })}
                                disabled={isSubmitting || isReadOnly}
                            />
                        </div>
                    </div>

                    <div className="px-6 py-4 border-t bg-background">
                        <DialogFooter className="flex-col sm:flex-row gap-2">
                            {/* Cancelar cita (solo en modo edición y no solo lectura) */}
                            {isEditing && editingAppointment?.status !== 'cancelled' && !isReadOnly && (
                                confirmCancel ? (
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mr-auto bg-destructive/5 p-2 rounded-xl border border-destructive/20">
                                        <span className="text-xs font-semibold text-destructive">
                                            {editingAppointment?.recurrenceId ? 'Cita recurrente:' : '¿Confirmar cancelación?'}
                                        </span>
                                        {editingAppointment?.recurrenceId ? (
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-7 text-xs font-semibold"
                                                    onClick={() => handleCancelAppointment(false, false)}
                                                    disabled={isCancelling}
                                                >
                                                    {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Solo esta cita'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-7 text-xs font-semibold"
                                                    onClick={() => handleCancelAppointment(true, false)}
                                                    disabled={isCancelling}
                                                >
                                                    {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Toda la serie'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                                                    onClick={() => handleCancelAppointment(true, true)}
                                                    disabled={isCancelling}
                                                    title="Eliminar permanentemente de la base de datos"
                                                >
                                                    Eliminar serie
                                                </Button>
                                                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmCancel(false)}>
                                                    Volver
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5">
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-7 text-xs font-semibold"
                                                    onClick={() => handleCancelAppointment(false, false)}
                                                    disabled={isCancelling}
                                                >
                                                    {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí, cancelar'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                                                    onClick={() => handleCancelAppointment(false, true)}
                                                    disabled={isCancelling}
                                                >
                                                    Eliminar
                                                </Button>
                                                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmCancel(false)}>
                                                    Volver
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="mr-auto gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                                        onClick={() => setConfirmCancel(true)}
                                    >
                                        <XCircle className="h-4 w-4" />
                                        {editingAppointment?.recurrenceId ? 'Borrar / Cancelar recurrente' : 'Cancelar cita'}
                                    </Button>
                                )
                            )}
                            
                            {/* Solicitar Pago por WhatsApp */}
                            {isEditing && !isReadOnly && editingAppointment?.payment_status !== 'paid' && editingAppointment?.status !== 'cancelled' && (
                                <Button
                                    type="button"
                                    onClick={handleRequestPayment}
                                    disabled={isRequestingPayment}
                                    className="mr-auto sm:ml-2 gap-2 bg-green-600 text-white hover:bg-green-700"
                                >
                                    {isRequestingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-lg">💰</span>}
                                    Solicitar Pago
                                </Button>
                            )}
                            
                            {/* Inasistencia / No-Show para citas */}
                            {isEditing && !isReadOnly && editingAppointment?.status !== 'cancelled' && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleNoShowAction}
                                    disabled={isManagingNoShow}
                                    className="mr-auto sm:ml-2 gap-1.5 border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold"
                                    title="Registrar inasistencia, aplicar penalización y enviar WhatsApp para reagendar"
                                >
                                    {isManagingNoShow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
                                    Inasistencia (No-Show)
                                </Button>
                            )}

                            {/* Entrar al Consultorio Virtual */}
                            {isEditing && (
                                <Button
                                    type="button"
                                    onClick={() => navigate(`/session/${editingAppointment.id}`)}
                                    className="mr-auto sm:ml-auto gap-2 bg-slate-900 text-white hover:bg-slate-800"
                                >
                                    <Video className="w-4 h-4 text-emerald-400" />
                                    Entrar al Consultorio Virtual
                                </Button>
                            )}

                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className={isReadOnly ? "w-full" : ""}>
                                {isReadOnly ? 'Cerrar' : isEditing ? 'Cerrar' : 'Cancelar'}
                            </Button>
                            {!isReadOnly && (
                                <Button
                                    type="submit"
                                    variant="zen"
                                    disabled={isSubmitting || !!getOverlappingAppointment(formData.startTime) || !!getDateWarning(date)}
                                >
                                    {isSubmitting
                                        ? (isEditing ? 'Guardando...' : 'Creando...')
                                        : (isEditing ? 'Guardar cambios' : 'Crear Cita')}
                                </Button>
                            )}
                        </DialogFooter>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default NewAppointmentDialog;
