import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CIE10Selector from '@/components/notes/CIE10Selector';
import MentalStatusSection from '@/components/notes/MentalStatusSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Save, CheckCircle2, Circle, Sparkles, RefreshCw, ShieldCheck, Zap, Eye, RotateCw, FileText, Check, CornerDownRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import PatientAutocomplete from '@/components/patients/PatientAutocomplete';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { useNoteDraft } from '@/hooks/useNoteDraft';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface StructuredNoteFormProps {
    onSave: (note: any) => void;
    onCancel: () => void;
    initialPatientId?: string;
    initialPatientName?: string;
    templateId?: string;
}

interface NoteTemplate {
    id: string;
    name: string;
    sections: string[];
    section_labels: Record<string, string>;
}

const StructuredNoteForm = ({ onSave, onCancel, initialPatientId, initialPatientName, templateId }: StructuredNoteFormProps) => {
    const [template, setTemplate] = useState<NoteTemplate | null>(null);
    const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

    // General Info
    const [patientId, setPatientId] = useState(initialPatientId || '');
    const [patientName, setPatientName] = useState(initialPatientName || '');
    const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
    const [sessionNumber, setSessionNumber] = useState('1');

    // Continuidad Clínica: Contexto de sesión anterior
    const [previousNote, setPreviousNote] = useState<any | null>(null);
    const [isLoadingPrevNote, setIsLoadingPrevNote] = useState(false);
    const [hasImportedFromPrev, setHasImportedFromPrev] = useState(false);
    const [showPrevNoteModal, setShowPrevNoteModal] = useState(false);

    // Fetch número correlativo y última nota clínica cuando el paciente cambia
    useEffect(() => {
        const fetchPatientSessionContext = async () => {
            if (!patientId) {
                setSessionNumber('1');
                setPreviousNote(null);
                setHasImportedFromPrev(false);
                return;
            }
            try {
                setIsLoadingPrevNote(true);
                // 1. Conteo consecutivo de sesiones
                const { count, error } = await supabase
                    .from('session_notes')
                    .select('*', { count: 'exact', head: true })
                    .eq('patient_id', patientId)
                    .is('deleted_at', null);

                if (!error && count !== null) {
                    setSessionNumber((count + 1).toString());
                } else {
                    setSessionNumber('1');
                }

                // 2. Última nota clínica para puente y continuidad TCC
                const { data: prevNote } = await supabase
                    .from('session_notes')
                    .select('*')
                    .eq('patient_id', patientId)
                    .is('deleted_at', null)
                    .order('date', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                setPreviousNote(prevNote || null);
                setHasImportedFromPrev(false);
            } catch (err) {
                console.error('Error fetching notes count or previous note:', err);
                setSessionNumber('1');
                setPreviousNote(null);
            } finally {
                setIsLoadingPrevNote(false);
            }
        };

        fetchPatientSessionContext();
    }, [patientId]);

    // Mood
    const [moodRating, setMoodRating] = useState([50]);
    const [moodNotes, setMoodNotes] = useState('');

    // Bridge
    const [bridgeItems, setBridgeItems] = useState<{ text: string; completed: boolean }[]>([]);
    const [newBridgeItem, setNewBridgeItem] = useState('');
    const [bridgeNotes, setBridgeNotes] = useState('');

    // Mental Status Exam
    const [mentalStatus, setMentalStatus] = useState<Record<string, string[]> | null>(null);

    // Agenda
    const [agendaItems, setAgendaItems] = useState<{
        id: string;
        topic: string;
        situation: string;
        thoughts: string;
        emotions: string;
        interventions: string;
    }[]>([]);

    // Beliefs
    const [coreBeliefs, setCoreBeliefs] = useState('');
    const [alternativeBeliefs, setAlternativeBeliefs] = useState('');

    // Action Plan
    const [actionPlanItems, setActionPlanItems] = useState<string[]>([]);
    const [newActionPlanItem, setNewActionPlanItem] = useState('');

    // CIE-10 (NOM-024 INT-01)
    const [cie10, setCie10] = useState<{ code: string; description: string } | null>(null);
    const [diagnosticoPrincipal, setDiagnosticoPrincipal] = useState('');

    // Dynamic Sections State (for generic text areas)
    const [dynamicFields, setDynamicFields] = useState<Record<string, string>>({});

    // Load Template
    useEffect(() => {
        const fetchTemplate = async () => {
            if (!templateId) return;
            setIsLoadingTemplate(true);
            try {
                const { data, error } = await supabase
                    .from('note_templates')
                    .select('*')
                    .eq('id', templateId)
                    .single();
                
                if (data) {
                    setTemplate(data);
                    // Initialize dynamic fields
                    const initialFields: Record<string, string> = {};
                    data.sections.forEach((s: string) => {
                        if (['free_text', 'techniques', 'observations', 'goals', 'homework'].includes(s)) {
                            initialFields[s] = '';
                        }
                    });
                    setDynamicFields(initialFields);
                }
            } catch (err) {
                console.error('Error loading template:', err);
            } finally {
                setIsLoadingTemplate(false);
            }
        };

        fetchTemplate();
    }, [templateId]);

    const hasSection = (key: string) => !template || template.sections.includes(key);
    const getLabel = (key: string, defaultLabel: string) => template?.section_labels?.[key] || defaultLabel;


    // Handlers
    const handleAddBridgeItem = () => {
        if (newBridgeItem.trim()) {
            setBridgeItems([...bridgeItems, { text: newBridgeItem, completed: false }]);
            setNewBridgeItem('');
        }
    };

    const toggleBridgeItem = (index: number) => {
        const newItems = [...bridgeItems];
        newItems[index].completed = !newItems[index].completed;
        setBridgeItems(newItems);
    };

    const handleAddAgendaItem = () => {
        setAgendaItems([
            ...agendaItems,
            {
                id: Math.random().toString(36).substr(2, 9),
                topic: '',
                situation: '',
                thoughts: '',
                emotions: '',
                interventions: ''
            }
        ]);
    };

    const updateAgendaItem = (index: number, field: string, value: string) => {
        const newItems = [...agendaItems];
        (newItems[index] as any)[field] = value;
        setAgendaItems(newItems);
    };

    const handleAddActionPlanItem = () => {
        if (newActionPlanItem.trim()) {
            setActionPlanItems([...actionPlanItems, newActionPlanItem]);
            setNewActionPlanItem('');
        }
    };

    // Continuidad Clínica: Importar tareas, creencias y diagnóstico de la sesión previa
    const handleImportFromPreviousSession = () => {
        if (!previousNote) return;

        // 1. Tareas de la sesión previa -> Bridge Items
        const prevTasks: string[] = [];
        if (Array.isArray(previousNote.action_plan)) {
            previousNote.action_plan.forEach((item: any) => {
                if (typeof item === 'string' && item.trim()) prevTasks.push(item.trim());
                else if (item && item.task && item.task.trim()) prevTasks.push(item.task.trim());
            });
        }

        if (prevTasks.length > 0) {
            const newBridge = prevTasks.map(t => ({ text: t, completed: false }));
            setBridgeItems(prev => {
                const existing = new Set(prev.map(p => p.text));
                const filtered = newBridge.filter(nb => !existing.has(nb.text));
                return [...prev, ...filtered];
            });
        }

        // 2. Creencias nucleares si el terapeuta no ha escrito nuevas
        if (previousNote.beliefs) {
            if (!coreBeliefs && previousNote.beliefs.core) {
                setCoreBeliefs(previousNote.beliefs.core);
            }
            if (!alternativeBeliefs && previousNote.beliefs.alternative) {
                setAlternativeBeliefs(previousNote.beliefs.alternative);
            }
        }

        // 3. CIE-10 y Diagnóstico principal
        if (!cie10 && previousNote.cie10_code) {
            setCie10({
                code: previousNote.cie10_code,
                description: previousNote.cie10_description || '',
            });
        }
        if (!diagnosticoPrincipal && previousNote.diagnostico_principal) {
            setDiagnosticoPrincipal(previousNote.diagnostico_principal);
        }

        setHasImportedFromPrev(true);
        toast.success(`Acuerdos y tareas de la Sesión #${previousNote.session_number} importados`);
    };

    // Reasignar tarea pendiente de la sesión pasada al plan de acción de hoy (Carry-Forward)
    const handleCarryForwardToActionPlan = (taskText: string) => {
        if (!actionPlanItems.includes(taskText)) {
            setActionPlanItems(prev => [...prev, taskText]);
            toast.success('Tarea reasignada al plan de acción de hoy');
        } else {
            toast.info('Esta tarea ya está en el plan de acción de hoy');
        }
    };

    // Resiliencia clínica: Clave de borrador local
    const draftKey = `mindful_structured_draft_${patientId || 'temp'}`;

    const currentFormData = {
        patientId,
        patientName,
        sessionDate,
        sessionNumber,
        moodRating,
        moodNotes,
        bridgeItems,
        bridgeNotes,
        mentalStatus,
        agendaItems,
        coreBeliefs,
        alternativeBeliefs,
        actionPlanItems,
        cie10,
        diagnosticoPrincipal,
        dynamicFields,
    };

    const isDirty = Boolean(
        moodNotes.trim() ||
        bridgeNotes.trim() ||
        bridgeItems.length > 0 ||
        agendaItems.some(a => a.topic || a.situation || a.thoughts || a.emotions || a.interventions) ||
        coreBeliefs.trim() ||
        alternativeBeliefs.trim() ||
        actionPlanItems.length > 0 ||
        cie10 ||
        diagnosticoPrincipal.trim() ||
        Object.values(dynamicFields).some(v => Boolean(v && v.trim()))
    );

    const {
        hasDraft,
        draftSavedAt,
        autosaveStatus,
        restoreDraft,
        discardDraft,
        clearDraft
    } = useNoteDraft({
        draftKey,
        data: currentFormData,
        isDirty,
        debounceMs: 1000,
        onRestore: (restored) => {
            if (restored.patientId && !patientId) setPatientId(restored.patientId);
            if (restored.patientName && !patientName) setPatientName(restored.patientName);
            if (restored.sessionDate) setSessionDate(restored.sessionDate);
            if (restored.sessionNumber) setSessionNumber(restored.sessionNumber);
            if (restored.moodRating) setMoodRating(restored.moodRating);
            if (restored.moodNotes !== undefined) setMoodNotes(restored.moodNotes);
            if (restored.bridgeItems) setBridgeItems(restored.bridgeItems);
            if (restored.bridgeNotes !== undefined) setBridgeNotes(restored.bridgeNotes);
            if (restored.mentalStatus) setMentalStatus(restored.mentalStatus);
            if (restored.agendaItems) setAgendaItems(restored.agendaItems);
            if (restored.coreBeliefs !== undefined) setCoreBeliefs(restored.coreBeliefs);
            if (restored.alternativeBeliefs !== undefined) setAlternativeBeliefs(restored.alternativeBeliefs);
            if (restored.actionPlanItems) setActionPlanItems(restored.actionPlanItems);
            if (restored.cie10 !== undefined) setCie10(restored.cie10);
            if (restored.diagnosticoPrincipal !== undefined) setDiagnosticoPrincipal(restored.diagnosticoPrincipal);
            if (restored.dynamicFields) setDynamicFields(restored.dynamicFields);
            toast.success('Borrador clínico restaurado con éxito');
        }
    });

    const handleSave = () => {
        const noteData = {
            patientId,
            patientName,
            date: sessionDate,
            sessionNumber,
            mood: { rating: moodRating[0], notes: moodNotes },
            bridge: { items: bridgeItems, notes: bridgeNotes },
            mentalStatus,
            agenda: agendaItems,
            beliefs: { core: coreBeliefs, alternative: alternativeBeliefs },
            actionPlan: actionPlanItems,
            cie10Code: cie10?.code || null,
            cie10Description: cie10?.description || null,
            diagnosticoPrincipal: diagnosticoPrincipal || null,
            createdAt: new Date().toISOString()
        };
        clearDraft();
        onSave(noteData);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            {/* Banner de Recuperación de Borrador no guardado */}
            {hasDraft && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-700 dark:text-amber-300 shrink-0">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">Se encontró un borrador previo no guardado</p>
                            <p className="text-xs text-muted-foreground">
                                {draftSavedAt 
                                    ? `Guardado automáticamente el ${format(new Date(draftSavedAt), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}`
                                    : 'Hay notas capturadas que no fueron guardadas.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button size="sm" variant="outline" onClick={discardDraft} className="text-xs h-8">
                            Descartar
                        </Button>
                        <Button size="sm" onClick={() => restoreDraft()} className="text-xs h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Restaurar notas
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-2 mb-6">
                <div className="flex items-center gap-2">
                    {autosaveStatus === 'saving' && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 animate-pulse">
                            Guardando borrador...
                        </Badge>
                    )}
                    {autosaveStatus === 'saved' && (
                        <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300 bg-emerald-50 gap-1">
                            <ShieldCheck className="h-3 w-3 text-emerald-600" />
                            Borrador respaldado localmente
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={onCancel}>Cancelar</Button>
                    <Button onClick={handleSave} className="gap-2">
                        <Save className="h-4 w-4" />
                        Guardar Nota
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Header - Patient Info */}
                <div className="md:col-span-2 bg-red-50/50 p-6 rounded-2xl border border-red-100 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-red-900">Paciente</label>
                            <PatientAutocomplete
                                value={patientId}
                                onSelect={(id, name) => {
                                    setPatientId(id);
                                    setPatientName(name);
                                }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-red-900">Fecha</label>
                                <Input
                                    type="date"
                                    value={sessionDate}
                                    onChange={(e) => setSessionDate(e.target.value)}
                                    className="bg-white/50 border-red-200 focus:border-red-400 focus:ring-red-400"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-red-900">Sesión #</label>
                                <Input
                                    type="text"
                                    value={sessionNumber}
                                    readOnly
                                    className="bg-white/50 border-red-200 text-muted-foreground font-medium cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>

                    {/* CIE-10 Diagnóstico (NOM-024 INT-01) */}
                    <div className="space-y-3 pt-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                            🏥 Diagnóstico CIE-10 (NOM-024)
                        </label>
                        <div className="relative">
                            <CIE10Selector value={cie10} onChange={setCie10} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-red-700">Diagnóstico principal (texto libre)</label>
                            <input
                                type="text"
                                value={diagnosticoPrincipal}
                                onChange={(e) => setDiagnosticoPrincipal(e.target.value)}
                                placeholder="Ej: Trastorno de ansiedad generalizada con episodio depresivo leve..."
                                className="w-full text-sm rounded-md border border-red-200 bg-white/50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300"
                            />
                        </div>
                    </div>
                </div>

                {/* Mood Section */}
                {hasSection('mood') && (
                    <Card className="border-border shadow-sm">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-bold text-primary">{getLabel('mood', 'Estado de Ánimo')}</CardTitle>
                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{moodRating[0]}%</Badge>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Slider
                                value={moodRating}
                                onValueChange={setMoodRating}
                                max={100}
                                step={1}
                                className="py-4"
                            />
                            <Textarea
                                placeholder="Notas sobre el estado de ánimo..."
                                value={moodNotes}
                                onChange={(e) => setMoodNotes(e.target.value)}
                                className="min-h-[80px]"
                            />
                        </CardContent>
                    </Card>
                )}

                {/* Bridge Section */}
                {hasSection('bridge') && (
                    <Card className="border-border shadow-sm">
                        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <CardTitle className="text-sm font-bold text-primary">{getLabel('bridge', 'Puente Intersesión')}</CardTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Revisión de tareas, acuerdos y eventos entre sesiones (Modelo Beck TCC)
                                </p>
                            </div>
                            {previousNote && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowPrevNoteModal(true)}
                                        className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                        Ver nota previa
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={hasImportedFromPrev ? "secondary" : "default"}
                                        size="sm"
                                        onClick={handleImportFromPreviousSession}
                                        disabled={hasImportedFromPrev}
                                        className={cn(
                                            "h-8 text-xs gap-1.5",
                                            hasImportedFromPrev
                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                                : "bg-primary text-primary-foreground hover:bg-primary/90"
                                        )}
                                    >
                                        {hasImportedFromPrev ? (
                                            <>
                                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                                Importado de Sesión #{previousNote.session_number}
                                            </>
                                        ) : (
                                            <>
                                                <Zap className="h-3.5 w-3.5 text-amber-300" />
                                                Importar tareas de Sesión #{previousNote.session_number}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Continuidad Intersesión: Alerta cuando se detecta nota previa y aún no se importa */}
                            {previousNote && !hasImportedFromPrev && (
                                <div className="p-3 bg-gradient-to-r from-primary/5 via-primary/10 to-transparent border border-primary/20 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                                    <div className="flex items-start gap-2.5">
                                        <div className="p-1.5 bg-primary/10 rounded-md text-primary mt-0.5">
                                            <RotateCw className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground">
                                                Continuidad con Sesión #{previousNote.session_number}{' '}
                                                {previousNote.date && (
                                                    <span className="font-normal text-muted-foreground">
                                                        ({format(parseISO(previousNote.date), "d 'de' MMMM", { locale: es })})
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-muted-foreground mt-0.5">
                                                {Array.isArray(previousNote.action_plan) && previousNote.action_plan.length > 0
                                                    ? `${previousNote.action_plan.length} tarea(s) acordada(s) en la sesión previa.`
                                                    : 'Puedes consultar el plan y notas de la sesión previa.'}
                                                {previousNote.cie10_code && ` Diagnóstico: ${previousNote.cie10_code}.`}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="default"
                                        onClick={handleImportFromPreviousSession}
                                        className="text-xs h-7 gap-1 shrink-0"
                                    >
                                        <Zap className="h-3 w-3" /> Traer acuerdos al puente
                                    </Button>
                                </div>
                            )}

                            <div className="space-y-2">
                                {bridgeItems.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic py-2">
                                        No hay tareas ni acuerdos registrados aún. Agrega una nueva o importa las tareas de la sesión previa.
                                    </p>
                                ) : (
                                    bridgeItems.map((item, index) => (
                                        <div
                                            key={index}
                                            className={cn(
                                                "flex items-center justify-between group p-2.5 rounded-lg border transition-colors",
                                                item.completed
                                                    ? "bg-emerald-50/50 border-emerald-200/60"
                                                    : "bg-background border-border hover:bg-muted/40"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleBridgeItem(index)}
                                                    className="focus:outline-none shrink-0"
                                                    title={item.completed ? "Marcar como pendiente" : "Marcar como cumplida"}
                                                >
                                                    {item.completed ? (
                                                        <CheckCircle2 className="h-5 w-5 text-emerald-500 hover:text-emerald-600 transition-colors" />
                                                    ) : (
                                                        <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                                                    )}
                                                </button>
                                                <span className={cn("text-sm break-words", item.completed && "line-through text-muted-foreground")}>
                                                    {item.text}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                {/* Carry-Forward: Si no se completó, reasignar al plan de acción de hoy */}
                                                {!item.completed && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleCarryForwardToActionPlan(item.text)}
                                                        className="h-7 text-xs px-2 text-primary hover:text-primary hover:bg-primary/10 gap-1"
                                                        title="Reasignar esta tarea pendiente al plan de acción de la sesión de hoy"
                                                    >
                                                        <CornerDownRight className="h-3 w-3" />
                                                        <span className="hidden sm:inline">Reasignar a hoy</span>
                                                    </Button>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                    onClick={() => setBridgeItems(bridgeItems.filter((_, i) => i !== index))}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Input
                                    placeholder="Nueva tarea o acuerdo intersesión..."
                                    value={newBridgeItem}
                                    onChange={(e) => setNewBridgeItem(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleAddBridgeItem()}
                                    className="text-sm"
                                />
                                <Button type="button" variant="outline" size="icon" onClick={handleAddBridgeItem}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Notas sobre el cumplimiento y revisión del puente:</Label>
                                <Textarea
                                    placeholder="Obstáculos encontrados por el paciente, pensamientos automáticos al intentar la tarea, aprendizajes..."
                                    value={bridgeNotes}
                                    onChange={(e) => setBridgeNotes(e.target.value)}
                                    className="min-h-[80px] bg-background border-border text-sm"
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Mental Status Exam Section */}
                {hasSection('mental_status') && (
                    <MentalStatusSection
                        value={mentalStatus}
                        onChange={setMentalStatus}
                    />
                )}

                {/* Agenda Section */}
                {hasSection('agenda') && (
                    <Card className="border-border shadow-sm">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-bold text-primary">{getLabel('agenda', 'Agenda / Conceptualización')}</CardTitle>
                            <Button variant="outline" size="sm" onClick={handleAddAgendaItem} className="h-8 gap-1.5 font-bold">
                                <Plus className="h-3.5 w-3.5" /> Agregar Tema
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {agendaItems.map((item, index) => (
                                <div key={item.id} className="space-y-4 p-4 rounded-xl border border-border bg-muted/30 relative">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => setAgendaItems(agendaItems.filter(i => i.id !== item.id))}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">Tema / Problema</Label>
                                            <Input
                                                value={item.topic}
                                                onChange={(e) => updateAgendaItem(index, 'topic', e.target.value)}
                                                placeholder="¿De qué trata este punto?"
                                                className="bg-background h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">Situación</Label>
                                            <Input
                                                value={item.situation}
                                                onChange={(e) => updateAgendaItem(index, 'situation', e.target.value)}
                                                placeholder="¿Qué pasó exactamente?"
                                                className="bg-background h-9 text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">Pensamientos</Label>
                                            <Textarea
                                                value={item.thoughts}
                                                onChange={(e) => updateAgendaItem(index, 'thoughts', e.target.value)}
                                                placeholder="Cogniciones / Creencias"
                                                className="bg-background min-h-[60px] text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">Emociones</Label>
                                            <Input
                                                value={item.emotions}
                                                onChange={(e) => updateAgendaItem(index, 'emotions', e.target.value)}
                                                placeholder="Sentimientos e intensidad"
                                                className="bg-background h-9 text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">Intervenciones / Reestructuración</Label>
                                        <Textarea
                                            value={item.interventions}
                                            onChange={(e) => updateAgendaItem(index, 'interventions', e.target.value)}
                                            placeholder="¿Qué técnicas se aplicaron?"
                                            className="bg-background min-h-[60px] text-sm"
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* Beliefs Section */}
                {hasSection('beliefs') && (
                    <Card className="border-border shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold text-primary">{getLabel('beliefs', 'Creencias Nucleares')}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground">Creencias Identificadas</Label>
                                <Textarea
                                    value={coreBeliefs}
                                    onChange={(e) => setCoreBeliefs(e.target.value)}
                                    placeholder="Creencias nucleares o intermedias..."
                                    className="min-h-[100px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground">Creencias Alternativas</Label>
                                <Textarea
                                    value={alternativeBeliefs}
                                    onChange={(e) => setAlternativeBeliefs(e.target.value)}
                                    placeholder="Nuevas perspectivas desarrolladas..."
                                    className="min-h-[100px]"
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Dynamic Text Areas (Generic sections from template) */}
                {template?.sections.filter(s => ['free_text', 'techniques', 'observations', 'goals', 'homework'].includes(s)).map(sKey => (
                    <Card key={sKey} className="border-border shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold text-primary">{getLabel(sKey, sKey)}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={dynamicFields[sKey] || ''}
                                onChange={(e) => setDynamicFields({ ...dynamicFields, [sKey]: e.target.value })}
                                placeholder={`Escribe aquí...`}
                                className="min-h-[120px]"
                            />
                        </CardContent>
                    </Card>
                ))}

                {/* Action Plan Section */}
                {hasSection('action_plan') && (
                    <Card className="border-border shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold text-primary">{getLabel('action_plan', 'Plan de Acción / Tareas')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                {actionPlanItems.map((item, index) => (
                                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 group">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            <span className="text-sm font-medium text-emerald-900">{item}</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => setActionPlanItems(actionPlanItems.filter((_, i) => i !== index))}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Siguiente paso, tarea o recomendación..."
                                    value={newActionPlanItem}
                                    onChange={(e) => setNewActionPlanItem(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddActionPlanItem()}
                                />
                                <Button variant="zen" size="icon" onClick={handleAddActionPlanItem}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* CIE-10 Selector */}
                <Card className="border-border shadow-sm bg-muted/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                            <Save className="h-4 w-4" /> Diagnóstico y Clasificación (NOM-024)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground">Búsqueda CIE-10</Label>
                            <CIE10Selector onSelect={setCie10} />
                            {cie10 && (
                                <div className="mt-2 p-3 bg-white rounded-lg border border-primary/20 flex items-center justify-between">
                                    <div>
                                        <span className="font-bold text-primary mr-2">{cie10.code}</span>
                                        <span className="text-sm text-muted-foreground">{cie10.description}</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCie10(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground">Impresión Diagnóstica</Label>
                            <Textarea
                                placeholder="Detalles específicos del diagnóstico..."
                                value={diagnosticoPrincipal}
                                onChange={(e) => setDiagnosticoPrincipal(e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Modal de Vista Rápida de Sesión Previa (Continuidad Beck TCC) */}
            <Dialog open={showPrevNoteModal} onOpenChange={setShowPrevNoteModal}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wide uppercase">
                            <FileText className="h-4 w-4" />
                            Continuidad Clínica TCC
                        </div>
                        <DialogTitle className="text-lg font-bold flex items-center justify-between">
                            <span>
                                Sesión Previa #{previousNote?.session_number || 'N/A'}{' '}
                                {previousNote?.date && (
                                    <span className="font-normal text-sm text-muted-foreground">
                                        — {format(parseISO(previousNote.date), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                                    </span>
                                )}
                            </span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Resumen de agenda, tareas, estado de ánimo y acuerdos acordados en la última consulta con {patientName || 'el paciente'}.
                        </DialogDescription>
                    </DialogHeader>

                    {previousNote && (
                        <div className="space-y-4 py-2 text-sm">
                            {/* Diagnóstico / CIE-10 previo */}
                            {(previousNote.cie10_code || previousNote.diagnostico_principal) && (
                                <div className="p-3 bg-red-50/50 border border-red-200/60 rounded-lg">
                                    <div className="text-xs font-semibold text-red-800 mb-1 flex items-center gap-1.5">
                                        🏥 Diagnóstico registrado
                                    </div>
                                    <p className="text-xs text-red-950 font-medium">
                                        {previousNote.cie10_code && (
                                            <span className="font-bold mr-1">[{previousNote.cie10_code}]</span>
                                        )}
                                        {previousNote.cie10_description || previousNote.diagnostico_principal}
                                    </p>
                                </div>
                            )}

                            {/* Estado de ánimo */}
                            {previousNote.mood_rating !== undefined && previousNote.mood_rating !== null && (
                                <div className="p-3 bg-muted/30 border rounded-lg space-y-1">
                                    <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                                        <span>Estado de Ánimo Registrado</span>
                                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                            {Array.isArray(previousNote.mood_rating) ? previousNote.mood_rating[0] : previousNote.mood_rating}%
                                        </Badge>
                                    </div>
                                    {previousNote.mood_notes && (
                                        <p className="text-xs text-foreground italic mt-1">
                                            "{previousNote.mood_notes}"
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Tareas / Plan de Acción previo */}
                            <div className="p-3 bg-blue-50/40 border border-blue-200/60 rounded-lg space-y-2">
                                <div className="text-xs font-semibold text-blue-900 flex items-center justify-between">
                                    <span>Tareas y Plan de Acción Acordados</span>
                                    <span className="text-[11px] text-blue-600 font-normal">
                                        {Array.isArray(previousNote.action_plan) ? previousNote.action_plan.length : 0} items
                                    </span>
                                </div>
                                {Array.isArray(previousNote.action_plan) && previousNote.action_plan.length > 0 ? (
                                    <ul className="space-y-1 text-xs">
                                        {previousNote.action_plan.map((item: any, i: number) => {
                                            const text = typeof item === 'string' ? item : item?.task || '';
                                            return (
                                                <li key={i} className="flex items-start gap-2 text-blue-950">
                                                    <span className="text-blue-500 font-bold">•</span>
                                                    <span>{text}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-muted-foreground italic">No se registraron tareas en esa sesión.</p>
                                )}
                            </div>

                            {/* Agenda y temas tratados */}
                            {Array.isArray(previousNote.agenda) && previousNote.agenda.length > 0 && (
                                <div className="p-3 bg-muted/20 border rounded-lg space-y-2">
                                    <div className="text-xs font-semibold text-foreground">
                                        Agenda y Temas de la Sesión
                                    </div>
                                    <div className="space-y-2">
                                        {previousNote.agenda.map((ag: any, i: number) => (
                                            <div key={i} className="text-xs p-2 bg-background border rounded">
                                                <div className="font-semibold text-primary">{ag.topic || `Tema #${i + 1}`}</div>
                                                {ag.situation && <p className="text-muted-foreground mt-0.5"><span className="font-medium">Situación:</span> {ag.situation}</p>}
                                                {ag.thoughts && <p className="text-muted-foreground mt-0.5"><span className="font-medium">Pensamientos:</span> {ag.thoughts}</p>}
                                                {ag.interventions && <p className="text-muted-foreground mt-0.5"><span className="font-medium">Intervención:</span> {ag.interventions}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Creencias nucleares */}
                            {previousNote.beliefs && (previousNote.beliefs.core || previousNote.beliefs.alternative) && (
                                <div className="p-3 bg-purple-50/40 border border-purple-200/60 rounded-lg space-y-1.5 text-xs">
                                    <div className="font-semibold text-purple-900">Creencias y Reestructuración</div>
                                    {previousNote.beliefs.core && (
                                        <p className="text-purple-950">
                                            <span className="font-medium text-purple-800">Creencia central:</span> {previousNote.beliefs.core}
                                        </p>
                                    )}
                                    {previousNote.beliefs.alternative && (
                                        <p className="text-purple-950">
                                            <span className="font-medium text-purple-800">Creencia adaptativa:</span> {previousNote.beliefs.alternative}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-3 border-t mt-2">
                        <Button
                            type="button"
                            variant="zen"
                            size="sm"
                            disabled={hasImportedFromPrev}
                            onClick={() => {
                                handleImportFromPreviousSession();
                                setShowPrevNoteModal(false);
                            }}
                            className="gap-1.5 text-xs"
                        >
                            <Zap className="h-3.5 w-3.5" />
                            {hasImportedFromPrev ? 'Tareas ya importadas' : 'Importar tareas al puente de hoy'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPrevNoteModal(false)}
                            className="text-xs"
                        >
                            Cerrar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex justify-end gap-3 pt-6 border-t border-border mt-8">
                <Button variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button variant="zen" onClick={handleSave} className="gap-2">
                    <Save className="h-4 w-4" /> Guardar Nota
                </Button>
            </div>
        </div>
    );
};

export default StructuredNoteForm;
