import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CIEDiagnosisSelector, { DiagnosisItem } from '@/components/notes/CIEDiagnosisSelector';
import MentalStatusSection from '@/components/notes/MentalStatusSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Plus,
    X,
    Save,
    CheckCircle2,
    Circle,
    Sparkles,
    RefreshCw,
    ShieldCheck,
    Zap,
    Eye,
    RotateCw,
    FileText,
    Check,
    CornerDownRight,
    User,
    Calendar,
    Activity,
} from 'lucide-react';
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
    const [, setIsLoadingTemplate] = useState(false);

    // General Info
    const [patientId, setPatientId] = useState(initialPatientId || '');
    const [patientName, setPatientName] = useState(initialPatientName || '');
    const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
    const [sessionNumber, setSessionNumber] = useState('1');

    // Continuidad Clínica: Contexto de sesión anterior
    const [previousNote, setPreviousNote] = useState<any | null>(null);
    const [, setIsLoadingPrevNote] = useState(false);
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

    // Diagnósticos CIE-11 / CIE-10 (OMS & NOM-024)
    const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([]);
    const [cie10, setCie10] = useState<{ code: string; description: string } | null>(null);
    const [diagnosticoPrincipal, setDiagnosticoPrincipal] = useState('');

    // Dynamic Sections State (for generic text areas: free_text, observations, etc.)
    const [dynamicFields, setDynamicFields] = useState<Record<string, string>>({});

    // Load Template
    useEffect(() => {
        const fetchTemplate = async () => {
            if (!templateId) return;
            setIsLoadingTemplate(true);
            try {
                const { data } = await supabase
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

        // 3. CIE-11 / CIE-10 y Diagnóstico principal
        if (diagnoses.length === 0 && previousNote.cie10_code) {
            const isCie11 = previousNote.cie10_code.startsWith('6') || previousNote.cie10_code.startsWith('7') || previousNote.cie10_code.startsWith('Q');
            const importedDx: DiagnosisItem = {
                system: isCie11 ? 'CIE-11' : 'CIE-10',
                code: previousNote.cie10_code,
                description: previousNote.cie10_description || '',
                group: 'Sesión anterior'
            };
            setDiagnoses([importedDx]);
            setCie10({ code: importedDx.code, description: importedDx.description });
        }
        if (previousNote.content?.diagnoses && Array.isArray(previousNote.content.diagnoses) && previousNote.content.diagnoses.length > 0) {
            setDiagnoses(previousNote.content.diagnoses);
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
        diagnoses,
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
        diagnoses.length > 0 ||
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
            if (restored.diagnoses) setDiagnoses(restored.diagnoses);
            if (restored.cie10 !== undefined) setCie10(restored.cie10);
            if (restored.diagnosticoPrincipal !== undefined) setDiagnosticoPrincipal(restored.diagnosticoPrincipal);
            if (restored.dynamicFields) setDynamicFields(restored.dynamicFields);
            toast.success('Borrador clínico restaurado con éxito');
        }
    });

    const handleSave = () => {
        const primaryDx = diagnoses[0] || (cie10 ? { code: cie10.code, description: cie10.description, system: 'CIE-10' as const, group: '' } : null);
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
            cie10Code: primaryDx?.code || null,
            cie10Description: primaryDx?.description || null,
            diagnosticoPrincipal: diagnosticoPrincipal || null,
            diagnoses: diagnoses.length > 0 ? diagnoses : (primaryDx ? [primaryDx] : []),
            dynamicFields,
            createdAt: new Date().toISOString()
        };
        clearDraft();
        onSave(noteData);
    };

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6 pb-24 px-2 sm:px-4 animate-fade-in">
            {/* Banner de Recuperación de Borrador no guardado */}
            {hasDraft && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-xl text-amber-700 dark:text-amber-300 shrink-0">
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
                        <Button size="sm" variant="outline" onClick={discardDraft} className="text-xs h-9 rounded-xl">
                            Descartar
                        </Button>
                        <Button size="sm" onClick={() => restoreDraft()} className="text-xs h-9 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Restaurar notas
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Top Bar con Estado de Guardado y Botones ── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-card rounded-2xl border border-border shadow-xs">
                <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                        <FileText className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold tracking-tight text-foreground">
                                {template?.name || 'Nota Clínica Estructurada'}
                            </h2>
                            {template?.name && (
                                <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                                    Plantilla Activa
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {autosaveStatus === 'saving' && (
                                <span className="text-amber-600 animate-pulse flex items-center gap-1 font-medium">
                                    Guardando borrador local...
                                </span>
                            )}
                            {autosaveStatus === 'saved' && (
                                <span className="text-emerald-600 flex items-center gap-1 font-medium">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Borrador respaldado localmente
                                </span>
                            )}
                            {autosaveStatus === 'idle' && (
                                <span>Campos completos en pantalla amplia</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button variant="ghost" onClick={onCancel} className="h-10 px-4 text-xs font-semibold rounded-xl">
                        Cancelar
                    </Button>
                    <Button variant="zen" onClick={handleSave} className="h-10 px-6 gap-2 text-xs font-bold rounded-xl shadow-md shadow-primary/20">
                        <Save className="h-4 w-4" />
                        Guardar Nota
                    </Button>
                </div>
            </div>

            {/* ── Card 1: Información General y Diagnóstico Clínico (Abarca toda la pantalla) ── */}
            <Card className="border-border shadow-xs w-full bg-card rounded-2xl overflow-hidden">
                <CardHeader className="py-4 px-6 bg-muted/20 border-b border-border/50 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-bold text-foreground">
                            Identificación del Paciente y Diagnóstico
                        </CardTitle>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                        Sesión #{sessionNumber}
                    </span>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    {/* Fila 1: Paciente, Fecha, Número de Sesión */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
                        <div className="lg:col-span-6 space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" /> Paciente
                            </Label>
                            {initialPatientId ? (
                                <div className="h-11 px-3.5 rounded-xl bg-muted/40 border border-border/60 flex items-center font-bold text-sm truncate">
                                    {patientName || 'Paciente seleccionado'}
                                </div>
                            ) : (
                                <PatientAutocomplete
                                    value={patientId}
                                    onSelect={(id, name) => {
                                        setPatientId(id);
                                        setPatientName(name);
                                    }}
                                    placeholder="Buscar paciente por nombre..."
                                />
                            )}
                        </div>

                        <div className="lg:col-span-4 space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" /> Fecha de Consulta
                            </Label>
                            <Input
                                type="date"
                                value={sessionDate}
                                onChange={(e) => setSessionDate(e.target.value)}
                                className="h-11 rounded-xl text-sm"
                            />
                        </div>

                        <div className="lg:col-span-2 space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground block text-center">
                                Sesión #
                            </Label>
                            <Input
                                type="text"
                                value={sessionNumber}
                                readOnly
                                className="h-11 rounded-xl text-sm font-bold text-center bg-muted/30 cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {/* Fila 2: Diagnóstico Clínico (CIE-11 / CIE-10) */}
                    <div className="pt-4 border-t border-border/60 space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                🏥 Diagnóstico Clínico y Clasificación (CIE-11 / CIE-10)
                            </Label>
                            <span className="text-[11px] text-muted-foreground hidden sm:inline">
                                Puedes seleccionar y añadir uno o varios diagnósticos a la nota
                            </span>
                        </div>

                        <CIEDiagnosisSelector
                            selectedDiagnoses={diagnoses}
                            onDiagnosesChange={setDiagnoses}
                            value={cie10}
                            onChange={setCie10}
                        />

                        <div className="space-y-1.5 pt-1">
                            <Label className="text-xs font-semibold text-muted-foreground">
                                Impresión diagnóstica complementaria / Motivo principal de atención (texto libre)
                            </Label>
                            <Input
                                type="text"
                                value={diagnosticoPrincipal}
                                onChange={(e) => setDiagnosticoPrincipal(e.target.value)}
                                placeholder="Ej: Trastorno de ansiedad generalizada con síntomas afectivos leves, en proceso de evaluación..."
                                className="h-11 rounded-xl text-sm"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── Dynamic Sections (Nota Básica: free_text, observations, etc.) — Abarcan toda la pantalla ── */}
            {template?.sections.filter(s => ['free_text', 'techniques', 'observations', 'goals', 'homework'].includes(s)).map(sKey => {
                const isFreeText = sKey === 'free_text';
                const isObservations = sKey === 'observations';
                return (
                    <Card key={sKey} className="border-border shadow-xs w-full overflow-hidden bg-card rounded-2xl">
                        <CardHeader className="py-4 px-6 bg-muted/20 border-b border-border/50 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold text-foreground">
                                    {getLabel(sKey, sKey)}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {isFreeText
                                        ? 'Espacio principal de redacción de la nota clínica'
                                        : isObservations
                                        ? 'Observaciones generales del estado del paciente, interacción o recomendaciones'
                                        : `Sección clínica: ${getLabel(sKey, sKey)}`}
                                </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20">
                                {isFreeText ? 'Principal' : 'Sección Libre'}
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-6">
                            <Textarea
                                value={dynamicFields[sKey] || ''}
                                onChange={(e) => setDynamicFields({ ...dynamicFields, [sKey]: e.target.value })}
                                placeholder={
                                    isFreeText
                                        ? 'Escribe el desarrollo completo de la sesión, motivos de consulta, intervenciones terapéuticas aplicadas y evolución del paciente...'
                                        : isObservations
                                        ? 'Notas y observaciones de conducta, afecto o seguimiento para próximas sesiones...'
                                        : `Escribe las ${getLabel(sKey, sKey).toLowerCase()}...`
                                }
                                className={cn(
                                    "w-full text-base leading-relaxed p-4 rounded-xl border-border bg-background focus:ring-2 focus:ring-primary/20",
                                    isFreeText ? "min-h-[340px]" : "min-h-[150px]"
                                )}
                            />
                        </CardContent>
                    </Card>
                );
            })}

            {/* ── Mood Section (Estado de Ánimo) ── */}
            {hasSection('mood') && (
                <Card className="border-border shadow-xs w-full bg-card rounded-2xl overflow-hidden">
                    <CardHeader className="py-4 px-6 bg-muted/20 border-b border-border/50 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-primary" />
                            <CardTitle className="text-sm font-bold text-foreground">
                                {getLabel('mood', 'Estado de Ánimo')}
                            </CardTitle>
                        </div>
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold px-3 py-1 text-xs">
                            Ánimo: {moodRating[0]}%
                        </Badge>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="py-2">
                            <Slider
                                value={moodRating}
                                onValueChange={setMoodRating}
                                max={100}
                                step={1}
                                className="py-3"
                            />
                        </div>
                        <Textarea
                            placeholder="Notas clínicas sobre el estado de ánimo, afecto, congruencia y reactividad emocional..."
                            value={moodNotes}
                            onChange={(e) => setMoodNotes(e.target.value)}
                            className="min-h-[90px] w-full text-sm rounded-xl p-3"
                        />
                    </CardContent>
                </Card>
            )}

            {/* ── Bridge Section (Puente Intersesión) ── */}
            {hasSection('bridge') && (
                <Card className="border-border shadow-xs w-full bg-card rounded-2xl overflow-hidden">
                    <CardHeader className="py-4 px-6 bg-muted/20 border-b border-border/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                            <CardTitle className="text-sm font-bold text-primary">
                                {getLabel('bridge', 'Puente Intersesión')}
                            </CardTitle>
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
                                    className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5 rounded-xl"
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
                                        "h-8 text-xs gap-1.5 rounded-xl font-bold",
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
                    <CardContent className="p-6 space-y-4">
                        {previousNote && !hasImportedFromPrev && (
                            <div className="p-3 bg-gradient-to-r from-primary/5 via-primary/10 to-transparent border border-primary/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                                <div className="flex items-start gap-2.5">
                                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary mt-0.5">
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
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="default"
                                    onClick={handleImportFromPreviousSession}
                                    className="text-xs h-7 gap-1 shrink-0 rounded-lg"
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
                                            "flex items-center justify-between group p-3 rounded-xl border transition-colors",
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
                                            {!item.completed && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleCarryForwardToActionPlan(item.text)}
                                                    className="h-7 text-xs px-2 text-primary hover:text-primary hover:bg-primary/10 gap-1 rounded-lg"
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
                                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive rounded-lg"
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
                                onKeyDown={(e) => e.key === 'Enter' && handleAddBridgeItem()}
                                className="text-sm h-10 rounded-xl"
                            />
                            <Button type="button" variant="outline" size="icon" onClick={handleAddBridgeItem} className="h-10 w-10 rounded-xl shrink-0">
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="space-y-1.5 pt-1">
                            <Label className="text-xs text-muted-foreground">Notas sobre el cumplimiento y revisión del puente:</Label>
                            <Textarea
                                placeholder="Obstáculos encontrados por el paciente, pensamientos automáticos al intentar la tarea, aprendizajes..."
                                value={bridgeNotes}
                                onChange={(e) => setBridgeNotes(e.target.value)}
                                className="min-h-[80px] bg-background border-border text-sm rounded-xl p-3"
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Mental Status Exam Section ── */}
            {hasSection('mental_status') && (
                <div className="w-full">
                    <MentalStatusSection
                        value={mentalStatus}
                        onChange={setMentalStatus}
                    />
                </div>
            )}

            {/* ── Agenda Section ── */}
            {hasSection('agenda') && (
                <Card className="border-border shadow-xs w-full bg-card rounded-2xl overflow-hidden">
                    <CardHeader className="py-4 px-6 bg-muted/20 border-b border-border/50 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-bold text-primary">
                                {getLabel('agenda', 'Agenda / Conceptualización')}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Estructuración de temas, situaciones detonantes y cogniciones tratadas
                            </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleAddAgendaItem} className="h-8 gap-1.5 font-bold rounded-xl">
                            <Plus className="h-3.5 w-3.5" /> Agregar Tema
                        </Button>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        {agendaItems.length === 0 ? (
                            <div className="p-8 text-center border-2 border-dashed border-border/60 rounded-2xl">
                                <p className="text-sm font-semibold text-muted-foreground mb-2">No hay temas en la agenda</p>
                                <Button variant="zen" size="sm" onClick={handleAddAgendaItem} className="gap-1.5 text-xs rounded-xl">
                                    <Plus className="h-3.5 w-3.5" /> Agregar Primer Punto de Agenda
                                </Button>
                            </div>
                        ) : (
                            agendaItems.map((item, index) => (
                                <div key={item.id} className="space-y-4 p-5 rounded-2xl border border-border bg-muted/20 relative">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-3 right-3 h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                                        onClick={() => setAgendaItems(agendaItems.filter(i => i.id !== item.id))}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Tema / Problema</Label>
                                            <Input
                                                value={item.topic}
                                                onChange={(e) => updateAgendaItem(index, 'topic', e.target.value)}
                                                placeholder="¿De qué trata este punto?"
                                                className="bg-background h-10 text-sm rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Situación</Label>
                                            <Input
                                                value={item.situation}
                                                onChange={(e) => updateAgendaItem(index, 'situation', e.target.value)}
                                                placeholder="¿Qué pasó exactamente?"
                                                className="bg-background h-10 text-sm rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Pensamientos</Label>
                                            <Textarea
                                                value={item.thoughts}
                                                onChange={(e) => updateAgendaItem(index, 'thoughts', e.target.value)}
                                                placeholder="Cogniciones / Creencias automáticas..."
                                                className="bg-background min-h-[70px] text-sm rounded-xl p-3"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Emociones</Label>
                                            <Input
                                                value={item.emotions}
                                                onChange={(e) => updateAgendaItem(index, 'emotions', e.target.value)}
                                                placeholder="Sentimientos e intensidad (ej: Ansiedad 8/10)..."
                                                className="bg-background h-10 text-sm rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Intervenciones / Reestructuración</Label>
                                        <Textarea
                                            value={item.interventions}
                                            onChange={(e) => updateAgendaItem(index, 'interventions', e.target.value)}
                                            placeholder="¿Qué técnicas se aplicaron? Cuestionamiento socrático, experimentos conductuales..."
                                            className="bg-background min-h-[70px] text-sm rounded-xl p-3"
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ── Beliefs Section ── */}
            {hasSection('beliefs') && (
                <Card className="border-border shadow-xs w-full bg-card rounded-2xl overflow-hidden">
                    <CardHeader className="py-4 px-6 bg-muted/20 border-b border-border/50">
                        <CardTitle className="text-sm font-bold text-primary">
                            {getLabel('beliefs', 'Creencias Nucleares e Intermedias')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground">Creencias Identificadas</Label>
                            <Textarea
                                value={coreBeliefs}
                                onChange={(e) => setCoreBeliefs(e.target.value)}
                                placeholder="Creencias nucleares o intermedias identificadas..."
                                className="min-h-[120px] rounded-xl p-3 text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground">Creencias Alternativas / Adaptativas</Label>
                            <Textarea
                                value={alternativeBeliefs}
                                onChange={(e) => setAlternativeBeliefs(e.target.value)}
                                placeholder="Nuevas perspectivas más funcionales desarrolladas..."
                                className="min-h-[120px] rounded-xl p-3 text-sm"
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Action Plan Section ── */}
            {hasSection('action_plan') && (
                <Card className="border-border shadow-xs w-full bg-card rounded-2xl overflow-hidden">
                    <CardHeader className="py-4 px-6 bg-muted/20 border-b border-border/50">
                        <CardTitle className="text-sm font-bold text-primary">
                            {getLabel('action_plan', 'Plan de Acción / Tareas para Casa')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="space-y-2">
                            {actionPlanItems.map((item, index) => (
                                <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 group">
                                    <div className="flex items-center gap-2.5">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                        <span className="text-sm font-medium text-foreground">{item}</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                                        onClick={() => setActionPlanItems(actionPlanItems.filter((_, i) => i !== index))}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Siguiente paso, tarea intersesión o recomendación..."
                                value={newActionPlanItem}
                                onChange={(e) => setNewActionPlanItem(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddActionPlanItem()}
                                className="h-10 text-sm rounded-xl"
                            />
                            <Button variant="zen" size="icon" onClick={handleAddActionPlanItem} className="h-10 w-10 rounded-xl shrink-0">
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Modal de Vista Rápida de Sesión Previa (Continuidad Beck TCC) ── */}
            <Dialog open={showPrevNoteModal} onOpenChange={setShowPrevNoteModal}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
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
                            {/* Diagnóstico / CIE previo */}
                            {(previousNote.cie10_code || previousNote.diagnostico_principal) && (
                                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                                    <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                                        🏥 Diagnóstico registrado
                                    </div>
                                    <p className="text-xs text-foreground font-medium">
                                        {previousNote.cie10_code && (
                                            <span className="font-bold mr-1">[{previousNote.cie10_code}]</span>
                                        )}
                                        {previousNote.cie10_description || previousNote.diagnostico_principal}
                                    </p>
                                </div>
                            )}

                            {/* Estado de ánimo */}
                            {previousNote.mood_rating !== undefined && previousNote.mood_rating !== null && (
                                <div className="p-3 bg-muted/30 border rounded-xl space-y-1">
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

                            {/* Tareas previo */}
                            <div className="p-3 bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 rounded-xl space-y-2">
                                <div className="text-xs font-semibold text-blue-900 dark:text-blue-300 flex items-center justify-between">
                                    <span>Tareas y Plan de Acción Acordados</span>
                                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-normal">
                                        {Array.isArray(previousNote.action_plan) ? previousNote.action_plan.length : 0} items
                                    </span>
                                </div>
                                {Array.isArray(previousNote.action_plan) && previousNote.action_plan.length > 0 ? (
                                    <ul className="space-y-1 text-xs">
                                        {previousNote.action_plan.map((item: any, i: number) => {
                                            const text = typeof item === 'string' ? item : item?.task || '';
                                            return (
                                                <li key={i} className="flex items-start gap-2 text-foreground">
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
                            className="gap-1.5 text-xs rounded-xl"
                        >
                            <Zap className="h-3.5 w-3.5" />
                            {hasImportedFromPrev ? 'Tareas ya importadas' : 'Importar tareas al puente de hoy'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPrevNoteModal(false)}
                            className="text-xs rounded-xl"
                        >
                            Cerrar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Botones de Guardado Inferior ── */}
            <div className="flex justify-end gap-3 pt-6 border-t border-border mt-8">
                <Button variant="outline" onClick={onCancel} className="h-11 px-6 rounded-xl font-bold">
                    Cancelar
                </Button>
                <Button variant="zen" onClick={handleSave} className="h-11 px-8 gap-2 font-bold rounded-xl shadow-lg shadow-primary/20">
                    <Save className="h-4 w-4" /> Guardar Nota
                </Button>
            </div>
        </div>
    );
};

export default StructuredNoteForm;
