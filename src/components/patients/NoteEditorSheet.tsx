import React, { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Save,
  X,
  Plus,
  Trash2,
  Sparkles,
  FileText,
  Loader2,
  Download,
  Activity,
  ChevronDown,
  ChevronUp,
  Smile,
  ListChecks,
  CheckSquare,
  Square,
  Copy,
  Printer,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import MiniEditor from '@/components/ui/MiniEditor';
import { SessionNote } from '@/types';
import { useOrganization } from '@/hooks/useOrganization';
import { generateSessionNotePDF, printSessionNotePDF } from '@/lib/generateExpedientePDF';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface AgendaItem {
  id?: string;
  topic?: string;
  situation?: string;
  thoughts?: string;
  emotions?: string;
  interventions?: string;
  notes?: string;
}

export interface BridgeItem {
  text: string;
  completed: boolean;
}

interface DiffPart {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  id: string;
}

function getSentenceDiff(original: string, modified: string): DiffPart[] {
  const cleanText = (html: string) => {
    return html
      .replace(/<p>/gi, '')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '') // Strip remaining HTML
      .replace(/\s+/g, ' ')
      .trim();
  };

  const origClean = cleanText(original);
  const modClean = cleanText(modified);

  const origSentences = origClean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const modSentences = modClean.split(/(?<=[.!?])\s+/).filter(Boolean);

  const n = origSentences.length;
  const m = modSentences.length;

  const dp: number[][] = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (origSentences[i - 1] === modSentences[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffPart[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origSentences[i - 1] === modSentences[j - 1]) {
      result.unshift({
        type: 'unchanged',
        text: origSentences[i - 1],
        id: `unchanged-${i}-${j}`,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({
        type: 'added',
        text: modSentences[j - 1],
        id: `added-${j}-${Math.random().toString(36).substr(2, 4)}`,
      });
      j--;
    } else {
      result.unshift({
        type: 'removed',
        text: origSentences[i - 1],
        id: `removed-${i}-${Math.random().toString(36).substr(2, 4)}`,
      });
      i--;
    }
  }

  return result;
}

export function isStructuredAgenda(items?: any[]): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  if (items.length > 1) return true;
  const it = items[0];
  const generic = !it.topic || ['Reporte Clínico', 'Consulta IA', 'SOAP', 'General', 'tcc-clasica'].includes(it.topic);
  return !generic || Boolean(it.situation || it.emotions || it.interventions || it.notes);
}

export function compileAgendaToHtml(items: AgendaItem[]): string {
  if (!items || items.length === 0) return '';
  return items
    .filter((it) => it.topic || it.situation || it.thoughts || it.emotions || it.interventions || it.notes)
    .map((it, idx) => {
      const title = it.topic ? `Tema ${idx + 1}: ${it.topic}` : `Tema ${idx + 1}`;
      const lines = [`<h3 style="font-weight: 700; font-size: 1.1rem; color: #0f766e; margin-bottom: 0.5rem;">${title}</h3>`];
      if (it.situation) lines.push(`<p><strong>Situación:</strong> ${it.situation}</p>`);
      if (it.emotions) lines.push(`<p><strong>Emociones:</strong> ${it.emotions}</p>`);
      if (it.thoughts) lines.push(`<p><strong>Imp. Clínica:</strong> ${it.thoughts}</p>`);
      if (it.interventions) lines.push(`<p><strong>Intervenciones:</strong> ${it.interventions}</p>`);
      if (it.notes) lines.push(`<p><strong>Notas:</strong> ${it.notes}</p>`);
      return lines.join('');
    })
    .join('<hr style="margin: 1.25rem 0; opacity: 0.2;" />');
}

interface NoteEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  note: SessionNote | null;
  patientId: string;
  patientName: string;
  patientDOB?: string;
  initialMode: 'manual' | 'ai';
  onNoteUpdated: () => void;
  /** When true, renders inline within the page instead of as a Sheet overlay */
  inline?: boolean;
}

export default function NoteEditorSheet({
  isOpen,
  onClose,
  note,
  patientId,
  patientName,
  patientDOB,
  initialMode,
  onNoteUpdated,
  inline = false,
}: NoteEditorSheetProps) {
  const { organization } = useOrganization();
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');

  // Note data states
  const [editorContent, setEditorContent] = useState('');
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [bulletPoints, setBulletPoints] = useState('');
  const [bridgeItems, setBridgeItems] = useState<BridgeItem[]>([]);
  const [newBridgeItemText, setNewBridgeItemText] = useState('');
  const [moodRating, setMoodRating] = useState<number | null>(null);
  const [moodNotes, setMoodNotes] = useState('');
  const [cie10Code, setCie10Code] = useState('');
  const [cie10Description, setCie10Description] = useState('');
  const [diagnosticoPrincipal, setDiagnosticoPrincipal] = useState('');

  // UX states
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDiagnosticPanel, setShowDiagnosticPanel] = useState(false);
  const [showMoodPanel, setShowMoodPanel] = useState(false);
  const [showBridgePanel, setShowBridgePanel] = useState(true);

  // AI Refinement states
  const [aiRefinePrompt, setAiRefinePrompt] = useState('');
  const [isRefiningAI, setIsRefiningAI] = useState(false);

  // Autosave and Draft states
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleRequestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // Interactive Diff states
  const [diffParts, setDiffParts] = useState<DiffPart[] | null>(null);

  // Synchronize with selected note
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode);
      if (note) {
        // 1. Structured Agenda vs Freeform
        const isStructured = isStructuredAgenda(note.agenda);
        if (Array.isArray(note.agenda) && note.agenda.length > 0) {
          const mappedAgenda: AgendaItem[] = note.agenda.map((it, idx) => ({
            id: it.id || `ag-${idx + 1}-${Date.now()}`,
            topic: it.topic || '',
            situation: it.situation || '',
            thoughts: it.thoughts || '',
            emotions: it.emotions || '',
            interventions: it.interventions || '',
            notes: it.notes || '',
          }));
          setAgendaItems(mappedAgenda);

          if (note.transcript_summary) {
            setEditorContent(note.transcript_summary);
          } else if (isStructured) {
            // Pre-compile into editorContent as well so the user immediately sees all their text
            setEditorContent(compileAgendaToHtml(mappedAgenda));
          } else {
            // Freeform AI report stored in thoughts
            setEditorContent(note.agenda[0]?.thoughts || '');
          }
        } else {
          setAgendaItems([]);
          setEditorContent(note.transcript_summary || '');
        }

        // 2. Bridge & Homework
        setBulletPoints(note.bridge?.notes || '');
        setBridgeItems(Array.isArray(note.bridge?.items) ? note.bridge.items : []);
        if (Array.isArray(note.bridge?.items) && note.bridge.items.length > 0) {
          setShowBridgePanel(true);
        }

        // 3. Mood
        if (note.mood && (note.mood.rating !== undefined || note.mood.notes)) {
          setMoodRating(typeof note.mood.rating === 'number' ? note.mood.rating : 50);
          setMoodNotes(note.mood.notes || '');
          setShowMoodPanel(true);
        } else {
          setMoodRating(null);
          setMoodNotes('');
          setShowMoodPanel(false);
        }

        // 4. CIE-10 and Diagnóstico
        setCie10Code(note.cie10_code || '');
        setCie10Description(note.cie10_description || '');
        setDiagnosticoPrincipal(note.diagnostico_principal || '');
        if (note.cie10_code || note.diagnostico_principal) {
          setShowDiagnosticPanel(true);
        }
      } else {
        // Clear for new note
        setEditorContent('');
        setAgendaItems([]);
        setBulletPoints('');
        setBridgeItems([]);
        setMoodRating(null);
        setMoodNotes('');
        setCie10Code('');
        setCie10Description('');
        setDiagnosticoPrincipal('');
        setShowDiagnosticPanel(false);
        setShowMoodPanel(false);
      }
      setIsDirty(false);
    }
  }, [isOpen, note, initialMode]);

  // Check for draft on open
  useEffect(() => {
    if (isOpen) {
      const draftKey = `mindful-flow-draft-${patientId}-${note?.id || 'new'}`;
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (
            parsed &&
            (parsed.editorContent ||
              parsed.bulletPoints ||
              (parsed.agendaItems && parsed.agendaItems.length > 0))
          ) {
            setDraftData(parsed);
            setHasDraft(true);
          }
        } catch (e) {
          console.error('Error parsing draft:', e);
        }
      }
    } else {
      setHasDraft(false);
      setDraftData(null);
      setAutosaveStatus('idle');
    }
  }, [isOpen, note, patientId]);

  // Debounced Autosave effect
  useEffect(() => {
    if (!isOpen || !isDirty) return;

    setAutosaveStatus('saving');
    const timer = setTimeout(() => {
      const draftKey = `mindful-flow-draft-${patientId}-${note?.id || 'new'}`;
      const payload = {
        editorContent,
        agendaItems,
        bulletPoints,
        bridgeItems,
        moodRating,
        moodNotes,
        cie10Code,
        cie10Description,
        diagnosticoPrincipal,
        timestamp: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
      setAutosaveStatus('saved');
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    editorContent,
    agendaItems,
    bulletPoints,
    bridgeItems,
    moodRating,
    moodNotes,
    cie10Code,
    cie10Description,
    diagnosticoPrincipal,
    isOpen,
    isDirty,
    patientId,
    note,
  ]);

  // Emergency save on inactivity timeout
  useEffect(() => {
    const handleEmergencySave = () => {
      if (isOpen && isDirty) {
        const draftKey = `mindful-flow-draft-${patientId}-${note?.id || 'new'}`;
        const payload = {
          editorContent,
          agendaItems,
          bulletPoints,
          bridgeItems,
          moodRating,
          moodNotes,
          cie10Code,
          cie10Description,
          diagnosticoPrincipal,
          timestamp: Date.now(),
        };
        try {
          localStorage.setItem(draftKey, JSON.stringify(payload));
        } catch (e) {
          console.warn('Error en guardado de emergencia:', e);
        }
      }
    };
    window.addEventListener('mindful-emergency-save', handleEmergencySave);
    return () => window.removeEventListener('mindful-emergency-save', handleEmergencySave);
  }, [
    isOpen,
    isDirty,
    patientId,
    note,
    editorContent,
    agendaItems,
    bulletPoints,
    bridgeItems,
    moodRating,
    moodNotes,
    cie10Code,
    cie10Description,
    diagnosticoPrincipal,
  ]);

  const handleRestoreDraft = () => {
    if (!draftData) return;
    if (draftData.editorContent !== undefined) setEditorContent(draftData.editorContent);
    if (draftData.agendaItems !== undefined) setAgendaItems(draftData.agendaItems);
    if (draftData.bulletPoints !== undefined) setBulletPoints(draftData.bulletPoints);
    if (draftData.bridgeItems !== undefined) setBridgeItems(draftData.bridgeItems);
    if (draftData.moodRating !== undefined) setMoodRating(draftData.moodRating);
    if (draftData.moodNotes !== undefined) setMoodNotes(draftData.moodNotes);
    if (draftData.cie10Code !== undefined) setCie10Code(draftData.cie10Code);
    if (draftData.cie10Description !== undefined) setCie10Description(draftData.cie10Description);
    if (draftData.diagnosticoPrincipal !== undefined) setDiagnosticoPrincipal(draftData.diagnosticoPrincipal);
    setHasDraft(false);
    setIsDirty(true);
    toast.success('Borrador local restaurado');
  };

  const handleDiscardDraft = () => {
    const draftKey = `mindful-flow-draft-${patientId}-${note?.id || 'new'}`;
    localStorage.removeItem(draftKey);
    setHasDraft(false);
    setDraftData(null);
    toast.info('Borrador descartado');
  };

  // Agenda Item handlers
  const handleUpdateAgendaItem = (index: number, field: keyof AgendaItem, value: string) => {
    setAgendaItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setIsDirty(true);
  };

  const handleAddAgendaItem = () => {
    setAgendaItems((prev) => [
      ...prev,
      {
        id: `ag-${prev.length + 1}-${Date.now()}`,
        topic: '',
        situation: '',
        thoughts: '',
        emotions: '',
        interventions: '',
        notes: '',
      },
    ]);
    setIsDirty(true);
  };

  const handleRemoveAgendaItem = (index: number) => {
    setAgendaItems((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleSyncAgendaToEditor = () => {
    const html = compileAgendaToHtml(agendaItems);
    setEditorContent(html);
    setIsDirty(true);
    toast.success('Temas compilados en el reporte clínico');
  };

  // Bridge Item handlers
  const handleAddBridgeItem = () => {
    if (!newBridgeItemText.trim()) return;
    setBridgeItems((prev) => [...prev, { text: newBridgeItemText.trim(), completed: false }]);
    setNewBridgeItemText('');
    setIsDirty(true);
  };

  const handleToggleBridgeItem = (index: number) => {
    setBridgeItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], completed: !updated[index].completed };
      return updated;
    });
    setIsDirty(true);
  };

  const handleRemoveBridgeItem = (index: number) => {
    setBridgeItems((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const applyFinalText = (parts: DiffPart[]) => {
    const text = parts.map((p) => p.text).join(' ');
    const formatted = text
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${p}</p>`)
      .join('');

    setEditorContent(formatted || text);
    setDiffParts(null);
    setIsDirty(true);
  };

  const handleAcceptAllDiff = () => {
    if (!diffParts) return;
    const finalParts = diffParts.map((part) => {
      if (part.type === 'added') return { ...part, type: 'unchanged' as const };
      if (part.type === 'removed') return null;
      return part;
    }).filter(Boolean) as DiffPart[];
    applyFinalText(finalParts);
    toast.success('Todos los cambios sugeridos fueron aplicados');
  };

  const handleRejectAllDiff = () => {
    if (!diffParts) return;
    const finalParts = diffParts.map((part) => {
      if (part.type === 'added') return null;
      if (part.type === 'removed') return { ...part, type: 'unchanged' as const };
      return part;
    }).filter(Boolean) as DiffPart[];
    applyFinalText(finalParts);
    toast.info('Cambios de la IA rechazados');
  };

  // Fetch patient clinical context for better AI analysis
  const fetchPatientContext = async (): Promise<string> => {
    if (!organization?.id) return '';
    try {
      const [{ data: patient }, { data: prevNotes }] = await Promise.all([
        supabase
          .from('patients')
          .select('name, date_of_birth, birth_date, gender, occupation, status, tags, curp, patient_clinical_data(notes)')
          .eq('id', patientId)
          .eq('organization_id', organization.id)
          .single(),
        supabase
          .from('session_notes')
          .select('date, session_number, bridge, agenda, cie10_code, cie10_description, diagnostico_principal')
          .eq('patient_id', patientId)
          .eq('organization_id', organization.id)
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .limit(3),
      ]);

      if (!patient) return '';

      const dob = patient.birth_date || patient.date_of_birth;
      const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;

      let ctx = `=== EXPEDIENTE DEL PACIENTE ===\n`;
      ctx += `Nombre: ${patient.name}\n`;
      if (age) ctx += `Edad: ${age} años\n`;
      ctx += `Género: ${patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Femenino' : patient.gender || 'No especificado'}\n`;

      const clinicalNotes = patient.patient_clinical_data?.[0]?.notes;
      if (clinicalNotes) ctx += `Notas generales: ${clinicalNotes}\n`;

      if (prevNotes && prevNotes.length > 0) {
        ctx += `\n=== ÚLTIMAS NOTAS CLÍNICAS ===\n`;
        prevNotes.forEach((n: any, i: number) => {
          ctx += `\n--- Sesión ${n.session_number || i + 1} (${n.date}) ---\n`;
          if (n.diagnostico_principal) ctx += `Diagnóstico: ${n.diagnostico_principal}\n`;
          const thoughtsText = n.agenda?.[0]?.thoughts || n.transcript_summary;
          if (thoughtsText) ctx += `Resumen: ${thoughtsText.slice(0, 300)}...\n`;
        });
      }
      return ctx;
    } catch (e) {
      console.error('Error fetching patient context:', e);
      return '';
    }
  };

  // Generate note using Supabase Edge Function
  const handleGenerateAI = async () => {
    if (!bulletPoints.trim()) {
      toast.error('Por favor escribe algunos puntos clave de la sesión.');
      return;
    }

    setIsProcessingAI(true);
    try {
      const patientContext = await fetchPatientContext();

      const { data, error } = await supabase.functions.invoke('process-clinical-note', {
        body: {
          text: bulletPoints,
          action: 'generate_soap',
          patient_context: patientContext,
        },
      });

      if (error) throw error;

      if (data?.report) {
        setEditorContent(data.report);
        if (data.cie10) setCie10Code(data.cie10);
        if (data.diagnostico) setDiagnosticoPrincipal(data.diagnostico);

        toast.success('Reporte clínico estructurado generado', {
          icon: <Sparkles className="h-4 w-4 text-primary animate-pulse" />,
        });

        setActiveTab('manual');
        setIsDirty(true);
      } else {
        throw new Error('No se recibió el reporte generado de la IA');
      }
    } catch (err: any) {
      console.error('Error generating AI report:', err);
      toast.error('Error al generar con IA: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsProcessingAI(false);
    }
  };

  // Refine note using Writing Tools
  const handleRefineAI = async (instruction: string) => {
    if (!instruction.trim()) return;

    let contentToRefine = editorContent;
    if (!contentToRefine.trim() && agendaItems.length > 0) {
      contentToRefine = compileAgendaToHtml(agendaItems);
      setEditorContent(contentToRefine);
    }

    if (!contentToRefine.trim()) {
      toast.error('No hay contenido en el reporte para refinar.');
      return;
    }

    setIsRefiningAI(true);
    try {
      let finalInstruction = instruction;
      if (instruction === 'Profesionalizar' || instruction === 'Profesionaliza el lenguaje clínico') {
        finalInstruction = 'Reescribe el reporte clínico para hacerlo más formal, técnico y profesional, utilizando terminología psicológica precisa y estructuración impecable.';
      } else if (instruction === 'Corregir Redacción' || instruction === 'Corrige la redacción y ortografía') {
        finalInstruction = 'Corrige errores ortográficos, de puntuación, concordancia y gramática, sin alterar el contenido clínico ni eliminar información relevante.';
      } else if (instruction === 'Resumir' || instruction === 'Resume de forma concisa') {
        finalInstruction = 'Resume este reporte clínico manteniendo la esencia de cada sección de forma muy sintética y clara.';
      } else {
        finalInstruction = `Modifica el reporte aplicando esta instrucción: "${instruction}". Mantén la coherencia del resto del texto.`;
      }

      const { data, error } = await supabase.functions.invoke('process-clinical-note', {
        body: {
          text: finalInstruction,
          action: 'refine_note',
          patient_context: contentToRefine,
        },
      });

      if (error) throw error;

      if (data?.report) {
        const diff = getSentenceDiff(contentToRefine, data.report);
        const hasDiffChanges = diff.some((p) => p.type === 'added' || p.type === 'removed');

        if (hasDiffChanges) {
          setDiffParts(diff);
          toast.info('Revisa los cambios sugeridos por la IA en el editor');
        } else {
          setEditorContent(data.report);
          toast.success('Nota refinada con IA');
        }
        setAiRefinePrompt('');
        setIsDirty(true);
      } else {
        throw new Error('No se recibió la nota refinada');
      }
    } catch (err: any) {
      console.error('Error refining note with AI:', err);
      toast.error('Error al refinar nota: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsRefiningAI(false);
    }
  };

  // Backward-compatible handler aliases
  const handleGenerateWithAI = handleGenerateAI;
  const handleRefineWithAI = handleRefineAI;
  const handleAcceptDiff = handleAcceptAllDiff;
  const handleRejectDiff = handleRejectAllDiff;

  // Save changes to Supabase
  const handleSave = async () => {
    const hasAgendaContent = agendaItems.some(
      (i) => i.topic?.trim() || i.thoughts?.trim() || i.interventions?.trim()
    );
    if (!editorContent.trim() && !hasAgendaContent && !bulletPoints.trim()) {
      toast.error('La nota clínica no puede estar vacía.');
      return;
    }

    if (!organization?.id) {
      toast.error('Contexto de organización no disponible.');
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión de usuario inactiva');

      let finalAgenda = agendaItems;
      if (finalAgenda.length === 0) {
        if (editorContent.trim()) {
          finalAgenda = [
            {
              id: note?.agenda?.[0]?.id || '1',
              topic: 'Reporte Clínico',
              situation: '',
              thoughts: editorContent,
              emotions: '',
              interventions: '',
            },
          ];
        } else {
          finalAgenda = note?.agenda || [];
        }
      }

      const notePayload: any = {
        transcript_summary: editorContent || null,
        cie10_code: cie10Code || null,
        cie10_description: cie10Description || null,
        diagnostico_principal: diagnosticoPrincipal || null,
        bridge: {
          ...(note?.bridge || {}),
          items: bridgeItems,
          notes: bulletPoints,
        },
        agenda: finalAgenda,
      };

      if (moodRating !== null || moodNotes) {
        notePayload.mood = {
          rating: moodRating ?? 50,
          notes: moodNotes,
        };
      }

      // Preserve existing clinical sections if any
      if (note?.beliefs) notePayload.beliefs = note.beliefs;
      if (note?.action_plan) notePayload.action_plan = note.action_plan;
      if (note?.mental_status) notePayload.mental_status = note.mental_status;

      if (note?.id) {
        const { error } = await supabase
          .from('session_notes')
          .update(notePayload)
          .eq('id', note.id);

        if (error) throw error;
        toast.success('Nota clínica actualizada correctamente');
      } else {
        const { data: lastNotes } = await supabase
          .from('session_notes')
          .select('session_number')
          .eq('patient_id', patientId)
          .eq('organization_id', organization.id)
          .order('session_number', { ascending: false })
          .limit(1);

        const nextSession = (lastNotes?.[0]?.session_number || 0) + 1;

        const { error } = await supabase
          .from('session_notes')
          .insert({
            ...notePayload,
            patient_id: patientId,
            organization_id: organization.id,
            session_number: nextSession,
            date: new Date().toISOString().split('T')[0],
          });

        if (error) throw error;
        toast.success('Nueva nota clínica guardada en el expediente');
      }

      const draftKey = `mindful-flow-draft-${patientId}-${note?.id || 'new'}`;
      localStorage.removeItem(draftKey);

      onNoteUpdated();
      onClose();
    } catch (err: any) {
      console.error('Error saving note:', err);
      toast.error('Error al guardar: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSaving(false);
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  // Print PDF directly (NOM-004)
  const handlePrintPDF = async () => {
    if (!note) return;
    setIsPrinting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, prefix, cedulas, signature_data, logo_data')
        .eq('id', user.id)
        .single();

      printSessionNotePDF(
        { name: patientName, id: patientId, date_of_birth: patientDOB },
        {
          ...note,
          agenda: agendaItems.length > 0 ? agendaItems : note?.agenda,
          bridge: { ...(note?.bridge || {}), items: bridgeItems, notes: bulletPoints },
          mood: moodRating !== null ? { rating: moodRating, notes: moodNotes } : note?.mood,
          transcript_summary: editorContent,
          cie10_code: cie10Code,
          diagnostico_principal: diagnosticoPrincipal,
        } as any,
        prof || undefined
      );
      toast.success('Abriendo vista de impresión conforme a NOM-004');
    } catch (err: any) {
      console.error('Error printing PDF:', err);
      toast.error('Error al imprimir: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  // Export PDF
  const handleExportPDF = async () => {
    if (!note) return;
    setIsExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, prefix, cedulas, signature_data, logo_data')
        .eq('id', user.id)
        .single();

      generateSessionNotePDF(
        { name: patientName, id: patientId, date_of_birth: patientDOB },
        {
          ...note,
          agenda: agendaItems.length > 0 ? agendaItems : note?.agenda,
          bridge: { ...(note?.bridge || {}), items: bridgeItems, notes: bulletPoints },
          mood: moodRating !== null ? { rating: moodRating, notes: moodNotes } : note?.mood,
          transcript_summary: editorContent,
          cie10_code: cie10Code,
          diagnostico_principal: diagnosticoPrincipal,
        } as any,
        prof || undefined
      );
      toast.success('Reporte PDF descargado con éxito');
    } catch (err: any) {
      console.error('Error exporting PDF:', err);
      toast.error('Error al generar PDF: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const getNoteDateFormatted = () => {
    if (!note?.date) return 'Nueva Nota';
    try {
      return format(parseISO(note.date), "d 'de' MMMM, yyyy", { locale: es });
    } catch (e) {
      return note.date;
    }
  };

  // ── Header ──
  const editorHeader = (
    <div className="flex items-center justify-between px-6 py-5 border-b border-border/80 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          {note ? `Edición de Nota` : 'Nueva Nota Clínica'}
        </h2>
        <p className="text-xs text-muted-foreground font-medium">
          Paciente: <span className="text-foreground font-semibold">{patientName}</span>
          {note && ` • Sesión ${note.session_number || 1} (${getNoteDateFormatted()})`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {note && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-slate-100 rounded-xl"
              onClick={handlePrintPDF}
              disabled={isPrinting}
              title="Imprimir Nota Clínica (NOM-004)"
            >
              {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 text-slate-500" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-slate-100 rounded-xl"
              onClick={handleExportPDF}
              disabled={isExporting}
              title="Exportar Reporte PDF"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-slate-500" />}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-slate-100 rounded-xl"
          onClick={handleRequestClose}
          title="Volver al expediente"
        >
          <X className="h-4 w-4 text-slate-500" />
        </Button>
      </div>
    </div>
  );

  // ── Tabs ──
  const editorTabs = (
    <div className="px-6 py-4 bg-muted/20 border-b border-border/50">
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'manual' | 'ai')}
        className="w-full"
      >
        <TabsList className="grid grid-cols-2 w-full p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
          <TabsTrigger
            value="manual"
            className="flex items-center gap-2 rounded-xl text-xs font-semibold py-2 transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm"
          >
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            Edición Manual
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="flex items-center gap-2 rounded-xl text-xs font-semibold py-2 transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Asistente de IA
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );

  // ── Body ──
  const editorBody = (
    <>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-zen">
        {hasDraft && draftData && (
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Tienes un borrador sin guardar de esta sesión</h4>
                <p className="text-[10px] text-muted-foreground">
                  Guardado localmente el {draftData.timestamp ? format(new Date(draftData.timestamp), "d 'de' MMMM, h:mm a", { locale: es }) : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button size="sm" variant="ghost" onClick={handleDiscardDraft} className="h-8 text-[10px] font-bold rounded-xl text-slate-500 hover:text-slate-800">
                Descartar
              </Button>
              <Button size="sm" variant="zen" onClick={handleRestoreDraft} className="h-8 text-[10px] font-bold rounded-xl px-4 shadow-sm">
                Restaurar
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'manual' ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* AI Writing Tools Panel */}
            <div className="bg-gradient-to-r from-violet-500/5 via-indigo-500/5 to-primary/5 border border-primary/10 p-4 rounded-2xl space-y-3 shadow-sm relative overflow-hidden animate-in slide-in-from-top-1 duration-300">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Sparkles className="h-4 w-4 text-violet-500 animate-pulse" />
                <span>Herramientas de Escritura con IA</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Instrucción libre (ej: 'traduce a tono TCC', 'hazlo más formal')"
                  value={aiRefinePrompt}
                  onChange={(e) => setAiRefinePrompt(e.target.value)}
                  className="flex-1 h-9 rounded-xl border-primary/15 bg-white/70 dark:bg-slate-800/70 text-xs placeholder:text-slate-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiRefinePrompt.trim()) handleRefineAI(aiRefinePrompt);
                  }}
                />
                <Button
                  size="sm"
                  variant="zen"
                  className="h-9 px-3 text-xs rounded-xl"
                  onClick={() => handleRefineAI(aiRefinePrompt)}
                  disabled={isRefiningAI || !aiRefinePrompt.trim()}
                >
                  {isRefiningAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Aplicar'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] rounded-xl border-primary/20 hover:bg-primary/5 gap-1 font-medium"
                  onClick={() => handleRefineAI('Profesionalizar')}
                  disabled={isRefiningAI || (!editorContent.trim() && agendaItems.length === 0)}
                >
                  <Sparkles className="h-3 w-3 text-primary" /> Profesionalizar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] rounded-xl border-primary/20 hover:bg-primary/5 gap-1 font-medium"
                  onClick={() => handleRefineAI('Corregir Redacción')}
                  disabled={isRefiningAI || (!editorContent.trim() && agendaItems.length === 0)}
                >
                  <Sparkles className="h-3 w-3 text-orange-500" /> Corregir Redacción
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] rounded-xl border-primary/20 hover:bg-primary/5 gap-1 font-medium"
                  onClick={() => handleRefineAI('Resumir')}
                  disabled={isRefiningAI || (!editorContent.trim() && agendaItems.length === 0)}
                >
                  <Sparkles className="h-3 w-3 text-blue-500" /> Resumir
                </Button>
              </div>
            </div>

            {/* Accordion: Diagnósticos (CIE-10) */}
            <div className="border border-border/80 rounded-2xl bg-card overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setShowDiagnosticPanel(!showDiagnosticPanel)}
                className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Datos Diagnósticos (CIE-10)
                  </span>
                  {cie10Code && (
                    <Badge variant="outline" className="text-[10px] ml-1 bg-primary/10 text-primary border-primary/20">
                      {cie10Code}
                    </Badge>
                  )}
                </div>
                {showDiagnosticPanel ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showDiagnosticPanel && (
                <div className="p-4 border-t border-border/60 bg-muted/20 space-y-3 animate-in slide-in-from-top-1 duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Código CIE-10</label>
                      <Input
                        value={cie10Code}
                        onChange={(e) => {
                          setCie10Code(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="Ej: F41.1"
                        className="mt-1 h-9 rounded-xl text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Descripción CIE-10</label>
                      <Input
                        value={cie10Description}
                        onChange={(e) => {
                          setCie10Description(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="Ej: Trastorno de ansiedad generalizada"
                        className="mt-1 h-9 rounded-xl text-xs bg-background"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Diagnóstico Principal</label>
                    <Input
                      value={diagnosticoPrincipal}
                      onChange={(e) => {
                        setDiagnosticoPrincipal(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="Diagnóstico clínico principal"
                      className="mt-1 h-9 rounded-xl text-xs bg-background"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Accordion: Estado de Ánimo / Evolución */}
            <div className="border border-border/80 rounded-2xl bg-card overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setShowMoodPanel(!showMoodPanel)}
                className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Smile className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Estado de Ánimo / Evolución
                  </span>
                  {moodRating !== null && (
                    <Badge variant="outline" className="text-[10px] ml-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      {moodRating}%
                    </Badge>
                  )}
                </div>
                {showMoodPanel ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showMoodPanel && (
                <div className="p-4 border-t border-border/60 bg-muted/20 space-y-4 animate-in slide-in-from-top-1 duration-200">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-muted-foreground">Calificación de Ánimo</span>
                      <span className="font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        {moodRating ?? 50}%
                      </span>
                    </div>
                    <Slider
                      value={[moodRating ?? 50]}
                      onValueChange={(val) => {
                        setMoodRating(val[0]);
                        setIsDirty(true);
                      }}
                      max={100}
                      step={1}
                      className="py-2"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Notas de Ánimo / Evolución</label>
                    <Input
                      value={moodNotes}
                      onChange={(e) => {
                        setMoodNotes(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="Ej: Tranquilo, motivado, mayor energía..."
                      className="mt-1 h-9 rounded-xl text-xs bg-background"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Section: Temas y Notas Clínicas de la Sesión (Agenda TCC) ── */}
            <div className="border border-border/80 rounded-2xl bg-card p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                    Temas y Nota Clínica (Agenda)
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    {agendaItems.length} {agendaItems.length === 1 ? 'tema' : 'temas'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {agendaItems.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] font-bold text-primary hover:bg-primary/10 gap-1 rounded-xl"
                      onClick={handleSyncAgendaToEditor}
                      title="Copiar contenido de los temas al editor de Reporte Clínico"
                    >
                      <Copy className="h-3 w-3" /> Compilar a Reporte
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] font-bold border-primary/20 text-primary hover:bg-primary/5 gap-1 rounded-xl"
                    onClick={handleAddAgendaItem}
                  >
                    <Plus className="h-3 w-3" /> Agregar Tema
                  </Button>
                </div>
              </div>

              {agendaItems.length === 0 ? (
                <div className="text-center py-6 px-4 border-2 border-dashed border-border/60 rounded-xl bg-muted/20">
                  <p className="text-xs text-muted-foreground font-medium mb-3">
                    No hay temas estructurados en esta sesión. Puedes agregarlos o escribir libremente en el Reporte Clínico.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="zen"
                    className="h-8 text-xs font-bold gap-1.5"
                    onClick={handleAddAgendaItem}
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar Tema Estructurado (TCC)
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {agendaItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 rounded-xl border border-border/80 bg-slate-50/60 dark:bg-slate-900/30 space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-border/40">
                        <span className="text-xs font-bold text-primary flex items-center gap-2">
                          <span className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center text-[11px] font-black text-primary">
                            {idx + 1}
                          </span>
                          {item.topic ? item.topic : `Tema #${idx + 1}`}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                          onClick={() => handleRemoveAgendaItem(idx)}
                          title="Eliminar tema"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Tema / Problema</label>
                          <Input
                            value={item.topic || ''}
                            onChange={(e) => handleUpdateAgendaItem(idx, 'topic', e.target.value)}
                            placeholder="Ej: Laboral, Duelo, Pareja..."
                            className="mt-1 h-9 rounded-xl text-xs bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Situación</label>
                          <Input
                            value={item.situation || ''}
                            onChange={(e) => handleUpdateAgendaItem(idx, 'situation', e.target.value)}
                            placeholder="¿Qué ocurrió exactamente?"
                            className="mt-1 h-9 rounded-xl text-xs bg-background"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Emociones</label>
                          <Input
                            value={item.emotions || ''}
                            onChange={(e) => handleUpdateAgendaItem(idx, 'emotions', e.target.value)}
                            placeholder="Ej: Ansiedad (8/10), Frustración..."
                            className="mt-1 h-9 rounded-xl text-xs bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Intervenciones / Técnicas</label>
                          <Textarea
                            value={item.interventions || ''}
                            onChange={(e) => handleUpdateAgendaItem(idx, 'interventions', e.target.value)}
                            placeholder="Técnicas aplicadas (ej: Reestructuración cognitiva, Psicoeducación...)"
                            className="mt-1 min-h-[60px] rounded-xl text-xs bg-background resize-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">
                          Pensamientos / Impresión Clínica
                        </label>
                        <Textarea
                          value={item.thoughts || ''}
                          onChange={(e) => handleUpdateAgendaItem(idx, 'thoughts', e.target.value)}
                          placeholder="Cogniciones automáticas, análisis o notas clínicas del tema..."
                          className="mt-1 min-h-[70px] rounded-xl text-xs bg-background leading-relaxed"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Section: Reporte Clínico Narrativo / Resumen SOAP (MiniEditor) ── */}
            <div className="border border-border/80 rounded-2xl bg-card p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 block">
                  Reporte Clínico (Texto Narrativo / Resumen SOAP)
                </label>
                {agendaItems.length > 0 && !editorContent && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[10px] font-bold text-primary hover:bg-primary/10 gap-1 rounded-xl"
                    onClick={handleSyncAgendaToEditor}
                  >
                    <Copy className="h-3 w-3" /> Traer texto de los temas
                  </Button>
                )}
              </div>

              {isRefiningAI && (
                <div className="flex items-center gap-2 text-xs text-primary font-semibold mb-2 animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> La IA está refinando tu reporte...
                </div>
              )}

              {diffParts ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4">
                    <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4" /> Revisión de cambios sugeridos por la IA
                    </h4>
                    <div className="text-sm leading-relaxed space-x-1">
                      {diffParts.map((part) => (
                        <span
                          key={part.id}
                          className={
                            part.type === 'added'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 px-0.5 rounded'
                              : part.type === 'removed'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 line-through px-0.5 rounded opacity-70'
                              : ''
                          }
                        >
                          {part.text}{' '}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={handleRejectAllDiff}>
                      Rechazar
                    </Button>
                    <Button size="sm" variant="zen" className="rounded-xl text-xs" onClick={handleAcceptAllDiff}>
                      Aceptar cambios
                    </Button>
                  </div>
                </div>
              ) : (
                <MiniEditor
                  content={editorContent}
                  onChange={(val) => {
                    setEditorContent(val);
                    setIsDirty(true);
                  }}
                />
              )}
            </div>

            {/* ── Section: Tareas para el Hogar y Notas Puente (Bridge) ── */}
            <div className="border border-border/80 rounded-2xl bg-card p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                    Tareas para el Hogar y Notas Puente
                  </span>
                  {bridgeItems.length > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      {bridgeItems.filter((i) => i.completed).length}/{bridgeItems.length} hechas
                    </Badge>
                  )}
                </div>
              </div>

              {/* Checklist de tareas */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground block">
                  Tareas Acordadas con el Paciente
                </label>
                {bridgeItems.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {bridgeItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-2 rounded-xl border border-border/60 bg-muted/20 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleBridgeItem(index)}
                          className="text-primary hover:text-primary/80 transition-colors"
                        >
                          {item.completed ? (
                            <CheckSquare className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        <span className={cn('flex-1 truncate', item.completed && 'line-through text-muted-foreground')}>
                          {item.text}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-destructive rounded-md"
                          onClick={() => handleRemoveBridgeItem(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    value={newBridgeItemText}
                    onChange={(e) => setNewBridgeItemText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddBridgeItem();
                      }
                    }}
                    placeholder="Nueva tarea acordada (ej: Registro de pensamientos...)"
                    className="h-9 rounded-xl text-xs bg-background"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-xs rounded-xl border-primary/20 text-primary font-bold"
                    onClick={handleAddBridgeItem}
                    disabled={!newBridgeItemText.trim()}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                  </Button>
                </div>
              </div>

              {/* Textarea notas de puente */}
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">
                  Notas de Continuidad / Puntos para la Próxima Sesión
                </label>
                <Textarea
                  value={bulletPoints}
                  onChange={(e) => {
                    setBulletPoints(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Puntos clave a retomar en la siguiente sesión..."
                  className="min-h-[90px] rounded-2xl text-xs border-border/80 resize-none bg-background leading-relaxed"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-gradient-to-r from-violet-500/5 via-indigo-500/5 to-primary/5 border border-primary/10 p-6 rounded-2xl text-center space-y-4">
              <div className="inline-flex p-3 rounded-2xl bg-primary/10">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold">Asistente de IA para Notas</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Dicta o escribe puntos clave de la sesión y la IA generará un reporte clínico estructurado.
              </p>
              <Textarea
                value={bulletPoints}
                onChange={(e) => {
                  setBulletPoints(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Escribe los puntos clave de la sesión aquí..."
                className="min-h-[150px] rounded-2xl text-sm bg-background"
              />
              <Button
                variant="zen"
                className="gap-2"
                onClick={handleGenerateAI}
                disabled={isProcessingAI || !bulletPoints.trim()}
              >
                {isProcessingAI ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generar Nota con IA
                  </>
                )}
              </Button>
            </div>
            {editorContent && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 mb-2 block">
                  Resultado Generado
                </label>
                <MiniEditor
                  content={editorContent}
                  onChange={(val) => {
                    setEditorContent(val);
                    setIsDirty(true);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/80 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky bottom-0 z-10">
        <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
          {autosaveStatus === 'saving' && (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Guardando...</span>
            </>
          )}
          {autosaveStatus === 'saved' && (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Borrador guardado</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {note && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrintPDF}
              disabled={isPrinting || isSaving}
              className="rounded-xl h-10 px-3.5 text-xs font-semibold gap-1.5 border-border hover:bg-muted"
              title="Imprimir Nota Clínica Conforme a NOM-004-SSA3"
            >
              {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 text-primary" />}
              <span className="hidden sm:inline">Imprimir NOM-004</span>
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleRequestClose}
            disabled={isSaving}
            className="rounded-xl h-10 px-4 text-slate-600 font-bold hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </Button>
          <Button
            variant="zen"
            onClick={handleSave}
            disabled={isSaving || isProcessingAI || !!diffParts}
            className="rounded-xl h-10 px-5 font-bold shadow-md shadow-primary/15 transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar Cambios
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );

  const discardAlertDialog = (
    <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
      <AlertDialogContent className="rounded-2xl max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-bold text-foreground">
            ¿Descartar los cambios no guardados?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Tienes cambios sin guardar en esta nota clínica. Si sales ahora, las modificaciones se perderán.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel className="rounded-xl font-medium">Continuar editando</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setIsDirty(false);
              setShowDiscardConfirm(false);
              onClose();
            }}
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
          >
            Descartar cambios
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ── Inline mode: render directly within the page ──
  if (inline) {
    if (!isOpen) return null;
    return (
      <>
        <div className="flex flex-col bg-card rounded-2xl shadow-soft border border-border overflow-hidden min-h-[500px] animate-in fade-in slide-in-from-bottom-2 duration-300">
          {editorHeader}
          {editorTabs}
          {editorBody}
        </div>
        {discardAlertDialog}
      </>
    );
  }

  // ── Sheet mode: render as overlay ──
  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && handleRequestClose()}>
        <SheetContent className="w-full sm:max-w-2xl flex flex-col h-full bg-background border-l border-border p-0 shadow-elevated">
          <SheetTitle className="sr-only">{note ? 'Edición de Nota' : 'Nueva Nota Clínica'}</SheetTitle>
          {editorHeader}
          {editorTabs}
          {editorBody}
        </SheetContent>
      </Sheet>
      {discardAlertDialog}
    </>
  );
}
