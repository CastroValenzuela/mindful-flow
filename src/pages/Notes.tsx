import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import FeatureGate from '@/components/subscription/FeatureGate';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  Filter,
  FileText,
  Calendar,
  Brain,
  ArrowLeft,
  Loader2,
  Trash2,
  Pencil,
  Save,
  X,
  ChevronRight,
  Activity,
  Download,
  Sparkles,
  Settings,
  Printer,
  Pen,
  User
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import StructuredNoteForm from '@/components/notes/StructuredNoteForm';
import HandwrittenNoteCanvas from '@/components/notes/HandwrittenNoteCanvas';
import FreeTextNoteForm from '@/components/notes/FreeTextNoteForm';
import PatientAutocomplete from '@/components/patients/PatientAutocomplete';
import { toast } from 'sonner';
import { useOrganization } from '@/hooks/useOrganization';
import { cn } from '@/lib/utils';
import { SessionNote } from '@/types';
import { generateSessionNotePDF } from '@/lib/generateExpedientePDF';
import AIVoiceRecorder from '@/components/notes/AIVoiceRecorder';
import MiniEditor from '@/components/ui/MiniEditor';
import DOMPurify from 'dompurify';
import { useNotes, useNoteTemplates, useProfessionalProfile, useMutateNotes } from '@/hooks/useNotes';

const getNoteFullDisplayHtml = (note: any): string => {
  if (!note) return 'Sin reporte detallado registrado.';
  if (note.content?.note_type === 'free_text' && note.content?.text) {
    return note.content.text;
  }
  if (note.transcript_summary) return note.transcript_summary;
  if (!Array.isArray(note.agenda) || note.agenda.length === 0) return 'Sin reporte detallado registrado.';
  
  if (
    note.agenda.length === 1 &&
    (!note.agenda[0].topic || ['Reporte Clínico', 'Consulta IA', 'General', 'SOAP', 'Nota Libre'].includes(note.agenda[0].topic)) &&
    !note.agenda[0].interventions &&
    !note.agenda[0].situation
  ) {
    return note.agenda[0].thoughts || 'Sin reporte detallado registrado.';
  }

  return note.agenda
    .map((item: any, idx: number) => {
      const parts: string[] = [];
      const title = item.topic ? `Tema ${idx + 1}: ${item.topic}` : `Tema ${idx + 1}`;
      parts.push(`<h4 style="font-weight: 700; font-size: 1.05rem; margin-top: 0.75rem; color: #0f766e;">${title}</h4>`);
      if (item.situation) parts.push(`<p><strong>Situación:</strong> ${item.situation}</p>`);
      if (item.emotions) parts.push(`<p><strong>Emociones:</strong> ${item.emotions}</p>`);
      if (item.interventions) parts.push(`<p><strong>Intervenciones:</strong> ${item.interventions}</p>`);
      if (item.thoughts) parts.push(`<p><strong>Imp. Clínica:</strong> ${item.thoughts}</p>`);
      if (item.notes) parts.push(`<p><strong>Notas:</strong> ${item.notes}</p>`);
      return parts.join('');
    })
    .join('<hr style="margin: 1.25rem 0; opacity: 0.2;" />');
};

const formatDateSafe = (dateStr: string | null | undefined, formatPattern: string): string => {
  if (!dateStr) return 'Sin fecha';
  try {
    const parsed = parseISO(dateStr);
    if (isNaN(parsed.getTime())) return String(dateStr);
    return format(parsed, formatPattern, { locale: es });
  } catch {
    return String(dateStr);
  }
};

const Notes = () => {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedPatientName, setSelectedPatientName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedFilter, setFeedFilter] = useState<'all' | 'today' | 'unlinked' | 'handwritten' | 'free_text' | 'structured'>('all');
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  
  const { data: notes = [], isLoading: loading } = useNotes(selectedPatient);
  const { data: noteTemplates = [], isLoading: isLoadingTemplates } = useNoteTemplates();
  const { data: professionalProfile } = useProfessionalProfile();
  const { createNote, archiveNote, updateNote } = useMutateNotes();

  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState('');
  const [isExportingNote, setIsExportingNote] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [creationMode, setCreationMode] = useState<'selector' | 'structured' | 'free_text' | 'handwritten'>('selector');
  const [editingHandwrittenNote, setEditingHandwrittenNote] = useState<any | null>(null);

  useEffect(() => {
    const pId = searchParams.get('patientId');
    const nId = searchParams.get('noteId');
    const newNote = searchParams.get('newNote');
    if (pId) {
      setSelectedPatient(pId);
      supabase
        .from('patients')
        .select('name')
        .eq('id', pId)
        .single()
        .then(({ data }) => {
          if (data) setSelectedPatientName(data.name);
        });
    }
    if (nId) {
      setSelectedNote(nId);
      supabase
        .from('session_notes')
        .select('patient_id, patient_name')
        .eq('id', nId)
        .single()
        .then(({ data }) => {
          if (data?.patient_id) {
            setSelectedPatient(data.patient_id);
            if (data.patient_name) setSelectedPatientName(data.patient_name);
          }
        });
    }
    if (newNote === 'true') {
      setIsCreatingNote(true);
    }
  }, [searchParams]);

  const [includeDiagnosisInExport, setIncludeDiagnosisInExport] = useState(true);

  const handleDownloadNote = async (
    note: SessionNote,
    options: { includeDiagnosis?: boolean; autoPrint?: boolean } = { includeDiagnosis: includeDiagnosisInExport }
  ) => {
    setIsExportingNote(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No hay sesión activa");

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, prefix, cedulas, signature_data, logo_data')
        .eq('id', user.id)
        .single();

      let dateOfBirth: string | undefined = undefined;
      if (selectedPatient) {
        const { data: patientData } = await supabase
          .from('patients')
          .select('date_of_birth')
          .eq('id', selectedPatient)
          .single();
        if (patientData) {
          dateOfBirth = patientData.date_of_birth;
        }
      }

      generateSessionNotePDF(
        { name: selectedPatientName, id: selectedPatient!, date_of_birth: dateOfBirth },
        note as any,
        prof || undefined,
        options
      );
      toast.success(options?.autoPrint ? 'Abriendo vista de impresión...' : 'Reporte generado con éxito');
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast.error('Error al generar PDF: ' + err.message);
    } finally {
      setIsExportingNote(false);
    }
  };

  const handleSaveNote = async (noteData: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No hay sesión activa');

    const payload = {
      user_id: user.id,
      patient_id: noteData.patientId || null,
      patient_name: noteData.patientName || 'Sin paciente',
      date: noteData.date,
      session_number: noteData.patientId ? notes.filter((n: any) => n.patient_id === noteData.patientId).length + 1 : 1,
      mood: noteData.mood,
      bridge: noteData.bridge,
      agenda: noteData.agenda,
      beliefs: noteData.beliefs,
      action_plan: noteData.actionPlan,
      cie10_code: noteData.cie10Code || null,
      cie10_description: noteData.cie10Description || null,
      diagnostico_principal: noteData.diagnosticoPrincipal || null,
      mental_status: noteData.mentalStatus || null,
      organization_id: organization?.id,
    };

    createNote.mutate(payload, {
      onSuccess: () => setIsCreatingNote(false)
    });
  };

  const handleDelete = async () => {
    if (!selectedNote) return;
    setIsDeleting(true);
    const { data: { user } } = await supabase.auth.getUser();
    archiveNote.mutate({ noteId: selectedNote, userId: user?.id }, {
      onSuccess: () => {
        setSelectedNote(null);
        setConfirmDelete(false);
        setIsDeleting(false);
      },
      onError: () => setIsDeleting(false)
    });
  };

  const handleUpdateReport = async () => {
    if (!selectedNote || !selectedNoteData) return;

    if (selectedNoteData.content?.note_type === 'free_text') {
      updateNote.mutate({
        noteId: selectedNote,
        payload: {
          content: { ...selectedNoteData.content, text: editingText },
          transcript_summary: editingText,
          agenda: [{ id: 'free-text-1', topic: selectedNoteData.content?.topic || 'Nota Libre', thoughts: editingText }]
        }
      }, {
        onSuccess: () => setIsEditing(false)
      });
      return;
    }

    const updatedAgenda = [...(selectedNoteData.agenda || [])];
    if (updatedAgenda.length === 0) {
      updatedAgenda.push({ id: '', topic: 'Reporte', situation: '', thoughts: editingText, emotions: '', interventions: '' });
    } else {
      updatedAgenda[0] = { ...updatedAgenda[0], thoughts: editingText };
    }
    
    updateNote.mutate({ noteId: selectedNote, payload: { agenda: updatedAgenda } }, {
      onSuccess: () => setIsEditing(false)
    });
  };

  const handleSaveHandwrittenNote = async (data: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('No hay sesión activa');
      return;
    }

    const payload = {
      user_id: user.id,
      patient_id: data.patientId || selectedPatient || null,
      patient_name: data.patientName || selectedPatientName || 'Sin paciente',
      date: data.date,
      session_number: Number(data.sessionNumber) || 1,
      content: {
        note_type: 'handwritten',
        topic: data.topic,
        drawing_data_url: data.drawingDataUrl,
        strokes: data.strokes,
        paper_type: data.paperType,
        notes: data.notes,
      },
      cie10_code: data.cie10Code || null,
      cie10_description: data.cie10Description || null,
      transcript_summary: data.notes || 'Anotaciones manuscritas tomadas en tableta/iPad',
      agenda: [{
        id: 'handwritten-1',
        topic: data.topic || 'Anotación Manuscrita (Touch)',
        thoughts: data.notes || 'Anotaciones manuscritas de sesión',
      }],
      organization_id: organization?.id,
    };

    if (editingHandwrittenNote?.id) {
      updateNote.mutate({
        noteId: editingHandwrittenNote.id,
        payload,
      }, {
        onSuccess: () => {
          setIsCreatingNote(false);
          setEditingHandwrittenNote(null);
          setCreationMode('selector');
        }
      });
    } else {
      createNote.mutate(payload, {
        onSuccess: () => {
          setIsCreatingNote(false);
          setCreationMode('selector');
          if (searchParams.get('newNote') === 'true' && selectedPatient) {
            navigate('/patients', { state: { selectPatientId: selectedPatient } });
          }
        }
      });
    }
  };

  const handleSaveFreeTextNote = async (data: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('No hay sesión activa');
      return;
    }

    const payload = {
      user_id: user.id,
      patient_id: data.patientId || selectedPatient || null,
      patient_name: data.patientName || selectedPatientName || 'Sin paciente',
      date: data.date,
      session_number: Number(data.sessionNumber) || 1,
      content: {
        note_type: 'free_text',
        topic: data.topic,
        text: data.text,
        diagnoses: data.diagnoses || [],
        cie11_code: data.diagnoses?.find((d: any) => d.system === 'CIE-11')?.code,
        cie11_description: data.diagnoses?.find((d: any) => d.system === 'CIE-11')?.description,
      },
      cie10_code: data.cie10Code || null,
      cie10_description: data.cie10Description || null,
      transcript_summary: data.text,
      agenda: [{
        id: 'free-text-1',
        topic: data.topic || 'Nota Libre',
        thoughts: data.text,
      }],
      organization_id: organization?.id,
    };

    createNote.mutate(payload, {
      onSuccess: () => {
        setIsCreatingNote(false);
        setCreationMode('selector');
        if (searchParams.get('newNote') === 'true' && selectedPatient) {
          navigate('/patients', { state: { selectPatientId: selectedPatient } });
        }
      }
    });
  };

  const filteredNotes = notes.filter((n: any) => {
    // 1. Text Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const patientMatch = (n.patient_name || '').toLowerCase().includes(q);
      const topicMatch = (n.content?.topic || n.agenda?.[0]?.topic || '').toLowerCase().includes(q);
      const cieMatch = (n.cie10_code || '').toLowerCase().includes(q) || 
                       (n.cie10_description || '').toLowerCase().includes(q) || 
                       (n.cie11_code || '').toLowerCase().includes(q) || 
                       (n.cie11_description || '').toLowerCase().includes(q);
      const textMatch = (n.transcript_summary || n.content?.text || '').toLowerCase().includes(q);
      const dxMatch = Array.isArray(n.content?.diagnoses) && n.content.diagnoses.some((d: any) => 
        (d.code || '').toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)
      );
      if (!patientMatch && !topicMatch && !cieMatch && !textMatch && !dxMatch) {
        return false;
      }
    }

    // 2. Tab Filter
    if (feedFilter === 'today') {
      const noteDate = n.date ? new Date(n.date).toDateString() : '';
      const todayDate = new Date().toDateString();
      return noteDate === todayDate;
    }
    if (feedFilter === 'unlinked') {
      return !n.patient_id;
    }
    if (feedFilter === 'handwritten') {
      return n.content?.note_type === 'handwritten' || Boolean(n.content?.drawing_data_url);
    }
    if (feedFilter === 'free_text') {
      return n.content?.note_type === 'free_text';
    }
    if (feedFilter === 'structured') {
      return !n.content?.note_type || n.content?.note_type === 'structured';
    }

    return true;
  });

  const selectedNoteData = notes.find((n: any) => n.id === selectedNote);

  if (isCreatingNote) {
    if (isDictating) {
      return (
        <Layout>
          <FeatureGate feature="core_notes">
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] py-12">
            <FeatureGate feature="ai_voice">
            <AIVoiceRecorder 
              onCancel={() => setIsDictating(false)}
              onSuccess={async (mockText) => {
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) throw new Error('Sesión inválida');
                  
                  const sessionNum = selectedPatient ? notes.filter((n: any) => n.patient_id === selectedPatient).length + 1 : 1;

                  const payload = {
                    user_id: user.id,
                    patient_id: selectedPatient || null,
                    patient_name: selectedPatientName || 'Sin paciente',
                    date: new Date().toISOString(),
                    session_number: sessionNum,
                    agenda: [{ id: 'ai-gen', topic: 'Reporte Generado por IA', situation: '', thoughts: mockText, emotions: '', interventions: '' }],
                    organization_id: organization?.id,
                  };

                  const { error } = await supabase.from('session_notes').insert([payload]);
                  if (error) throw error;

                  queryClient.invalidateQueries({ queryKey: ['session_notes'] });
                  toast.success('Nota estructurada y guardada con éxito.');
                  setIsDictating(false);
                  setIsCreatingNote(false);
                  if (searchParams.get('newNote') === 'true' && selectedPatient) {
                    navigate('/patients', { state: { selectPatientId: selectedPatient } });
                  }
                } catch (err: any) {
                  toast.error('Error al guardar la nota: ' + err.message);
                }
              }}
            />
            </FeatureGate>
          </div>
          </FeatureGate>
        </Layout>
      );
    }

    if (creationMode === 'handwritten') {
      return (
        <Layout>
          <FeatureGate feature="core_notes">
            <div className="space-y-6 animate-fade-in">
              <HandwrittenNoteCanvas
                initialStrokes={editingHandwrittenNote?.content?.strokes || []}
                initialPaperType={editingHandwrittenNote?.content?.paper_type || 'ruled'}
                initialTopic={editingHandwrittenNote?.content?.topic || ''}
                initialPatientId={editingHandwrittenNote?.patient_id || selectedPatient || undefined}
                initialPatientName={editingHandwrittenNote?.patient_name || selectedPatientName || undefined}
                initialDate={editingHandwrittenNote?.date || undefined}
                initialSessionNumber={editingHandwrittenNote?.session_number || (selectedPatient ? notes.filter((n: any) => n.patient_id === selectedPatient).length + 1 : 1)}
                onCancel={() => {
                  setIsCreatingNote(false);
                  setCreationMode('selector');
                  setEditingHandwrittenNote(null);
                  if (searchParams.get('newNote') === 'true' && selectedPatient) {
                    navigate('/patients', { state: { selectPatientId: selectedPatient } });
                  }
                }}
                onSave={handleSaveHandwrittenNote}
              />
            </div>
          </FeatureGate>
        </Layout>
      );
    }

    if (creationMode === 'free_text') {
      return (
        <Layout>
          <FeatureGate feature="core_notes">
            <div className="space-y-6 animate-fade-in">
              <FreeTextNoteForm
                initialPatientId={selectedPatient || undefined}
                initialPatientName={selectedPatientName || undefined}
                initialSessionNumber={selectedPatient ? notes.filter((n: any) => n.patient_id === selectedPatient).length + 1 : 1}
                onCancel={() => {
                  setIsCreatingNote(false);
                  setCreationMode('selector');
                  if (searchParams.get('newNote') === 'true' && selectedPatient) {
                    navigate('/patients', { state: { selectPatientId: selectedPatient } });
                  }
                }}
                onSave={handleSaveFreeTextNote}
              />
            </div>
          </FeatureGate>
        </Layout>
      );
    }

    if (creationMode === 'structured' && selectedTemplateId) {
      return (
        <Layout>
          <FeatureGate feature="core_notes">
            <div className="space-y-6 animate-fade-in">
              <StructuredNoteForm
                templateId={selectedTemplateId}
                initialPatientId={selectedPatient || undefined}
                initialPatientName={selectedPatientName || undefined}
                onCancel={() => {
                  setIsCreatingNote(false);
                  setSelectedTemplateId(null);
                  setCreationMode('selector');
                  if (searchParams.get('newNote') === 'true' && selectedPatient) {
                    navigate('/patients', { state: { selectPatientId: selectedPatient } });
                  }
                }}
                onSave={async (noteData) => {
                  const { data: { user } } = await supabase.auth.getUser();
                  const { error } = await supabase
                    .from('session_notes')
                    .insert({
                      user_id: user?.id,
                      patient_id: noteData.patientId || null,
                      patient_name: noteData.patientName || 'Sin paciente',
                      date: noteData.date,
                      session_number: parseInt(noteData.sessionNumber) || 1,
                      mood: noteData.mood,
                      bridge: noteData.bridge,
                      agenda: noteData.agenda,
                      beliefs: noteData.beliefs,
                      action_plan: noteData.actionPlan,
                      cie10_code: noteData.cie10Code || null,
                      cie10_description: noteData.cie10Description || null,
                      diagnostico_principal: noteData.diagnosticoPrincipal || null,
                      mental_status: noteData.mentalStatus || null,
                      content: {
                        ...noteData,
                        diagnoses: noteData.diagnoses || [],
                        cie11_code: noteData.diagnoses?.find((d: any) => d.system === 'CIE-11')?.code,
                        cie11_description: noteData.diagnoses?.find((d: any) => d.system === 'CIE-11')?.description,
                      },
                      organization_id: organization?.id,
                      template_id: selectedTemplateId
                    });
                  if (error) {
                    toast.error('Error al guardar: ' + error.message);
                  } else {
                    queryClient.invalidateQueries({ queryKey: ['session_notes'] });
                    toast.success('Nota guardada con éxito');
                    setIsCreatingNote(false);
                    setSelectedTemplateId(null);
                    setCreationMode('selector');
                    if (searchParams.get('newNote') === 'true' && selectedPatient) {
                      navigate('/patients', { state: { selectPatientId: selectedPatient } });
                    }
                  }
                }}
              />
            </div>
          </FeatureGate>
        </Layout>
      );
    }

    return (
      <Layout>
        <FeatureGate feature="core_notes">
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => {
              setIsCreatingNote(false);
              setSelectedTemplateId(null);
              setCreationMode('selector');
              setEditingHandwrittenNote(null);
              if (searchParams.get('newNote') === 'true' && selectedPatient) {
                navigate('/patients', { state: { selectPatientId: selectedPatient } });
              }
            }}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-black text-primary tracking-tight">Nueva Nota Clínica</h1>
              <p className="text-xs text-muted-foreground font-medium">Elige la modalidad que mejor se adapte a tu consulta de hoy</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Top row: 3 Primary quick options (AI Voice, Free Text, Tablet Handwritten) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Option 1: AI Voice Dictation */}
              <button 
                onClick={() => setIsDictating(true)}
                className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-primary to-emerald-600 p-6 text-left transition-all hover:shadow-xl hover:shadow-primary/20 hover:scale-[1.01] flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-6 opacity-20 transform translate-x-3 -translate-y-3 group-hover:scale-110 transition-transform duration-500">
                  <Brain className="w-24 h-24 text-white" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 bg-white/20 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3" />
                    Inteligente
                  </div>
                  <h3 className="text-lg font-black text-white tracking-tight mb-1.5">Redactar con IA</h3>
                  <p className="text-white/80 leading-relaxed text-xs">
                    Dicta o habla sobre la sesión. El sistema estructura y redacta la nota automáticamente.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-white">
                  <span>Iniciar dictado</span>
                  <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Option 2: Free Text Editor */}
              <button 
                onClick={() => setCreationMode('free_text')}
                className="relative overflow-hidden group rounded-2xl bg-card border-2 border-border p-6 text-left transition-all hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 hover:scale-[1.01] flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-6 opacity-10 text-blue-600 transform translate-x-3 -translate-y-3 group-hover:scale-110 transition-transform duration-500">
                  <FileText className="w-24 h-24" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3">
                    <FileText className="w-3 h-3" />
                    Libre & Flexible
                  </div>
                  <h3 className="text-lg font-black text-foreground tracking-tight mb-1.5">Nota de Texto Libre</h3>
                  <p className="text-muted-foreground leading-relaxed text-xs">
                    Editor abierto para escribir a tu ritmo con negritas, listas y títulos, sin casillas rígidas.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                  <span>Abrir editor libre</span>
                  <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Option 3: Handwritten Touch / Tablet */}
              <button 
                onClick={() => setCreationMode('handwritten')}
                className="relative overflow-hidden group rounded-2xl bg-card border-2 border-border p-6 text-left transition-all hover:border-violet-500 hover:shadow-xl hover:shadow-violet-500/10 hover:scale-[1.01] flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-6 opacity-10 text-violet-600 transform translate-x-3 -translate-y-3 group-hover:scale-110 transition-transform duration-500">
                  <Pen className="w-24 h-24" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3">
                    <Pen className="w-3 h-3" />
                    iPad & Tablet Touch
                  </div>
                  <h3 className="text-lg font-black text-foreground tracking-tight mb-1.5">Nota Manuscrita</h3>
                  <p className="text-muted-foreground leading-relaxed text-xs">
                    Toma apuntes o dibuja esquemas con Apple Pencil, Stylus o con el dedo sobre un lienzo táctil.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-violet-600 dark:text-violet-400">
                  <span>Abrir lienzo táctil</span>
                  <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

            </div>

            {/* Section: Structured Clinical Templates */}
            <Card className="border-border shadow-xs overflow-hidden">
              <CardHeader className="bg-muted/10 border-b border-border/50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Plantillas Clínicas Estructuradas</CardTitle>
                  <CardDescription>O redacta con metodologías específicas: TCC, SOAP, Examen Mental y más</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-6">
              {isLoadingTemplates ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
                  <p className="text-xs text-muted-foreground font-medium">Cargando plantillas...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {noteTemplates.map((template: any) => (
                    <div
                      key={template.id}
                      className="group flex flex-col p-5 rounded-2xl border border-border bg-card text-left transition-all hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                          template.is_system ? "bg-primary/5 text-primary" : "bg-violet-50 text-violet-600"
                        )}>
                          <FileText className="h-5 w-5" />
                        </div>
                        
                        <Badge variant="outline" className={cn(
                          "text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 border",
                          template.is_system ? "bg-primary/5 text-primary border-primary/20" : "bg-violet-50 text-violet-600 border-violet-200"
                        )}>
                          {template.is_system ? 'Sistema' : 'Personalizada'}
                        </Badge>
                      </div>

                      <h4 className="font-bold text-sm mb-1.5">{template.name}</h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mb-6 flex-1">
                        {template.description}
                      </p>

                      <div className="mt-auto pt-4 flex flex-row items-center gap-2 border-t border-border/40 w-full">
                        <Button 
                          variant="zen"
                          size="sm"
                          className="flex-1 h-8 text-xs font-bold shadow-sm px-2"
                          onClick={() => {
                            setSelectedTemplateId(template.id);
                            setCreationMode('structured');
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                          <span className="truncate">Redactar</span>
                        </Button>

                        {!template.is_system && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-bold text-slate-600 hover:text-violet-700 hover:bg-violet-50 border-border/50 shrink-0"
                            onClick={() => navigate('/settings?tab=plantillas')}
                          >
                            <Settings className="h-3.5 w-3.5 mr-1.5" />
                            Editar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
        </FeatureGate>
      </Layout>
    );
  }

  return (
    <Layout>
      <FeatureGate feature="core_notes">
      <div className="space-y-6">
        <div id="tour-notes-header" className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between bg-card p-6 rounded-2xl border border-border shadow-soft animate-in slide-in-from-top duration-700">
          <div className="flex items-center gap-4 w-full lg:w-auto">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-0.5">
              <h1 className="text-2xl font-black tracking-tight">Notas Clínicas</h1>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60">Historial de Reportes Estructurados</p>
            </div>
          </div>

          <div id="tour-notes-patient-select" className="w-full lg:max-w-md">
            <PatientAutocomplete
              value={selectedPatient || ''}
              onSelect={(id, name) => {
                setSelectedPatient(id);
                setSelectedPatientName(name);
                setSelectedNote(null);
              }}
              placeholder="Selecciona un paciente..."
            />
          </div>

          <div id="tour-notes-new-btn" className="flex gap-3 w-full lg:w-auto justify-end">
            <Button 
              variant="zen" 
              size="sm" 
              className="h-10 text-xs font-bold px-4 shadow-lg shadow-primary/20" 
              onClick={() => setIsCreatingNote(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Nota
            </Button>
          </div>
        </div>

        {/* ── Banner cuando un paciente específico está seleccionado ── */}
        {selectedPatient && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-primary/5 border border-primary/20 gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <User className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground">{selectedPatientName || 'Paciente seleccionado'}</span>
                  <Badge variant="outline" className="text-[10px] font-bold bg-primary/10 text-primary border-primary/20">
                    {notes.length} notas en expediente
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Viendo historial clínico de este paciente</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedPatient(null);
                setSelectedPatientName('');
                setSelectedNote(null);
              }}
              className="h-8 text-xs font-bold gap-1.5 rounded-xl hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
              Ver todas las notas (Feed General)
            </Button>
          </div>
        )}

        {/* ── Toolbar del Feed cuando vemos todas las notas ── */}
        {!selectedPatient && (
          <div className="space-y-3 bg-card p-5 rounded-2xl border border-border/70 shadow-2xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar notas por paciente, diagnóstico, fecha..."
                  className="pl-10 h-10 rounded-xl text-xs bg-background border-border/80"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filtros rápidos */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'today', label: 'Hoy' },
                  { id: 'unlinked', label: 'Sin Expediente' },
                  { id: 'free_text', label: 'Texto Libre' },
                  { id: 'handwritten', label: '✍️ Manuscritas' },
                  { id: 'structured', label: '📋 Estructuradas' },
                ].map((tab) => (
                  <Button
                    key={tab.id}
                    variant={feedFilter === tab.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFeedFilter(tab.id as any)}
                    className={cn(
                      "h-8 px-3 rounded-xl text-xs font-bold transition-all shrink-0",
                      feedFilter === tab.id
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 font-medium">
              <span>
                Feed de Notas Clínicas • {filteredNotes.length} nota(s) encontrada(s)
              </span>
              {notes.some((n: any) => !n.patient_id) && (
                <span className="text-amber-600 font-semibold flex items-center gap-1">
                  ⚠️ Hay notas sin expediente vinculado
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Grid de Notas o Estados Vacíos ── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-bold mb-1">No se encontraron notas</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-6">
                {searchQuery
                  ? `No hay notas que coincidan con "${searchQuery}". Intenta con otro término.`
                  : feedFilter !== 'all'
                  ? 'No hay notas con el filtro seleccionado actualmente.'
                  : 'Aún no has registrado notas clínicas en tu cuenta.'}
              </p>
              <Button variant="zen" size="sm" className="gap-2 rounded-xl text-xs font-bold" onClick={() => setIsCreatingNote(true)}>
                <Plus className="h-4 w-4" /> Crear Nota Nueva
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-500">
            {filteredNotes.map((note: any) => {
              const isHandwritten = note.content?.note_type === 'handwritten' || Boolean(note.content?.drawing_data_url);
              const isFreeText = note.content?.note_type === 'free_text';
              const isUnlinked = !note.patient_id;

              return (
                <div
                  key={note.id}
                  onClick={() => setSelectedNote(note.id)}
                  className="group relative cursor-pointer overflow-hidden transition-all duration-300 rounded-2xl border-2 bg-card border-border hover:border-primary/40 hover:shadow-lg hover:-translate-y-1 flex flex-col justify-between"
                >
                  <div className="p-5 space-y-3">
                    {/* Header de la tarjeta */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-foreground truncate flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{note.patient_name || 'Sin paciente asignado'}</span>
                        </p>
                        {isUnlinked && (
                          <Badge variant="outline" className="mt-1 text-[9px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-300 font-bold">
                            ⚠️ Sin Expediente
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-primary/10 text-primary shrink-0">
                        Sesión #{note.session_number}
                      </span>
                    </div>

                    {/* Fecha y Tipo */}
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground pt-1 border-t border-border/40">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 opacity-60" />
                        {formatDateSafe(note.date, "d MMM yyyy")}
                      </div>
                      <div>
                        {isHandwritten ? (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200 font-bold">
                            ✍️ Manuscrita
                          </Badge>
                        ) : isFreeText ? (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200 font-bold">
                            📝 Libre
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">
                            📋 Estructurada
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Diagnósticos CIE-11 & CIE-10 */}
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-foreground leading-snug line-clamp-1">
                        {note.content?.topic || note.agenda?.[0]?.topic || note.diagnostico_principal || 'Nota de Consulta'}
                      </p>
                      {note.cie11_code && (
                        <p className="text-[10px] font-bold text-violet-700 dark:text-violet-400 truncate">
                          CIE-11: {note.cie11_code} {note.cie11_description ? `· ${note.cie11_description}` : ''}
                        </p>
                      )}
                      {note.cie10_code && (
                        <p className="text-[10px] font-semibold text-muted-foreground truncate">
                          CIE-10: {note.cie10_code} {note.cie10_description ? `· ${note.cie10_description}` : ''}
                        </p>
                      )}
                    </div>

                    {/* Handwritten Miniatura */}
                    {isHandwritten && note.content?.drawing_data_url && (
                      <div className="pt-2 border-t border-border/40 overflow-hidden rounded-xl bg-slate-50 border border-border/30">
                        <img
                          src={note.content.drawing_data_url}
                          alt="Miniatura"
                          className="w-full h-18 object-cover object-top opacity-85 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                    )}
                  </div>

                  {/* Footer de la tarjeta con acción rápida */}
                  <div className="px-5 py-2.5 bg-muted/20 border-t border-border/40 flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-primary group-hover:underline">
                      Ver / Imprimir →
                    </span>
                    {note.mood?.rating != null && (
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3 w-3 text-primary/60" /> {note.mood.rating}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={!!selectedNoteData} onOpenChange={(open) => {
              if (!open) {
                setSelectedNote(null);
                setIsEditing(false);
                setConfirmDelete(false);
              }
            }}>
              <DialogContent className="w-[95vw] max-w-5xl sm:max-w-5xl h-[95vh] p-0 flex flex-col bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden border-border/50 shadow-2xl">
                {selectedNoteData && (
                  <>
                    <DialogHeader className="p-4 md:p-6 bg-background border-b shadow-sm z-10 flex-shrink-0">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <Badge variant="zen" className="px-3 py-1 rounded-lg shadow-sm">Sesión #{selectedNoteData.session_number}</Badge>
                            <span className="text-xs md:text-sm font-bold text-muted-foreground/60 flex items-center gap-1.5">
                              <Calendar className="h-4 w-4" />
                              {formatDateSafe(selectedNoteData.date, "EEEE, d 'de' MMMM yyyy")}
                            </span>
                          </div>
                          <DialogTitle className="text-2xl md:text-3xl font-black tracking-tight text-primary mt-2 md:mt-3">
                            {selectedPatientName}
                          </DialogTitle>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                          {!isEditing ? (
                            <>
                              {selectedNoteData.content?.drawing_data_url ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-10 px-4 rounded-xl border-violet-300 hover:bg-violet-50 text-violet-700 gap-2 transition-all font-bold"
                                  onClick={() => {
                                    setEditingHandwrittenNote(selectedNoteData);
                                    setCreationMode('handwritten');
                                    setIsCreatingNote(true);
                                    setSelectedNote(null);
                                  }}
                                >
                                  <Pen className="h-4 w-4" /> Continuar Dibujo / Editar
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-10 px-4 rounded-xl border-primary/20 hover:bg-primary/5 text-primary gap-2 transition-all font-bold"
                                  onClick={() => {
                                    setEditingText(getNoteFullDisplayHtml(selectedNoteData));
                                    setIsEditing(true);
                                    setConfirmDelete(false);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" /> Editar Modo Completo
                                </Button>
                              )}
                              <Button
                                variant="zen"
                                size="sm"
                                className="h-10 px-4 rounded-xl gap-2 font-bold shadow-sm"
                                onClick={() => handleDownloadNote(selectedNoteData, { includeDiagnosis: includeDiagnosisInExport })}
                                disabled={isExportingNote}
                              >
                                {isExportingNote ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                                Descargar Reporte
                              </Button>

                              {/* Opción de Quitar o Dejar Diagnóstico en descarga / impresión */}
                              <div className="flex items-center gap-2 bg-muted/50 border border-border/70 px-3 py-1.5 rounded-xl text-xs">
                                <Label htmlFor="toggle-export-dx" className="text-xs font-semibold cursor-pointer select-none">
                                  {includeDiagnosisInExport ? 'Dx incluido' : 'Dx omitido'}
                                </Label>
                                <Switch
                                  id="toggle-export-dx"
                                  checked={includeDiagnosisInExport}
                                  onCheckedChange={setIncludeDiagnosisInExport}
                                  title="Quitar o dejar diagnóstico en caso de necesitar imprimir para paciente o trámites"
                                />
                              </div>

                              <Button
                                variant="outline"
                                size="sm"
                                className="h-10 px-3.5 rounded-xl gap-2 font-bold shadow-xs hover:bg-muted"
                                onClick={() => handleDownloadNote(selectedNoteData, { includeDiagnosis: includeDiagnosisInExport, autoPrint: true })}
                                disabled={isExportingNote}
                                title="Imprimir nota clínica directamente"
                              >
                                <Printer className="h-4 w-4" />
                                <span className="hidden sm:inline">Imprimir</span>
                              </Button>

                              {confirmDelete ? (
                                <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 p-1.5 rounded-xl animate-in fade-in zoom-in-95">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 px-3 text-xs font-black uppercase tracking-widest"
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                  >
                                    Confirmar
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7 rounded-lg"
                                    onClick={() => setConfirmDelete(false)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-10 px-4 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive gap-2 font-bold"
                                  onClick={() => setConfirmDelete(true)}
                                >
                                  <Trash2 className="h-4 w-4" /> Eliminar
                                </Button>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button variant="zen" size="sm" className="h-10 px-6 rounded-xl gap-2 font-bold shadow-lg shadow-primary/20" onClick={handleUpdateReport}>
                                <Save className="h-4 w-4" /> Guardar Cambios
                              </Button>
                              <Button variant="ghost" size="sm" className="h-10 px-4 rounded-xl font-bold" onClick={() => setIsEditing(false)}>
                                Cancelar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                      {/* Document Sheet - "Word-like print preview" effect */}
                      <div className="max-w-4xl mx-auto bg-background rounded-sm shadow-2xl border border-border/50 min-h-[850px] p-8 sm:p-16 ring-1 ring-slate-900/5">
                        
                        {/* Quick Metadata inside document */}
                        {(!isEditing && (selectedNoteData.cie10_code || selectedNoteData.content?.diagnoses?.length || selectedNoteData.mood?.rating != null)) && (
                          <div className="flex flex-wrap gap-4 mb-10 pb-6 border-b border-border/40">
                            <div className="flex flex-wrap items-center gap-2">
                              {selectedNoteData.content?.diagnoses && selectedNoteData.content.diagnoses.length > 0 ? (
                                selectedNoteData.content.diagnoses.map((dx: any) => (
                                  <div key={dx.code} className="flex items-center gap-2 bg-muted/60 px-3 py-1.5 rounded-xl border border-border/60">
                                    <span className="text-[10px] font-black bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                                      {dx.system} {dx.code}
                                    </span>
                                    <span className="text-xs font-semibold text-foreground truncate max-w-[220px]">
                                      {dx.description}
                                    </span>
                                  </div>
                                ))
                              ) : Boolean(selectedNoteData.cie10_code) && (
                              <div className="flex items-center gap-2 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2 rounded-xl">
                                <span className="text-[10px] font-black bg-primary text-white px-2 py-0.5 rounded-full">{selectedNoteData.cie10_code}</span>
                                <span className="text-xs font-bold text-muted-foreground truncate max-w-[200px]">{selectedNoteData.cie10_description}</span>
                              </div>
                            )}
                            <Badge variant={includeDiagnosisInExport ? "outline" : "secondary"} className="text-[10px] font-bold">
                              {includeDiagnosisInExport ? '✓ Visible en reporte' : '⊘ Omitido en reporte'}
                            </Badge>
                          </div>
                          {false && (
                            <div>
                              </div>
                            )}
                            {selectedNoteData.mood?.rating != null && (
                              <div className="flex items-center gap-2 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2 rounded-xl">
                                <Activity className="h-3.5 w-3.5 text-primary" />
                                <span className="text-xs font-bold text-muted-foreground">Estado de Ánimo: {selectedNoteData.mood.rating}/100</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Report Section */}
                        {selectedNoteData.content?.drawing_data_url ? (
                          <div className="space-y-6">
                            <div className="flex items-center justify-between pb-3 border-b border-border/60">
                              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-violet-600 flex items-center gap-2">
                                <Pen className="h-4 w-4" /> Anotaciones Manuscritas (iPad / Tablet)
                              </h4>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs font-bold gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
                                  onClick={() => handleDownloadNote(selectedNoteData, { autoPrint: true })}
                                  title="Imprimir nota clínica directamente con membrete oficial"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  Imprimir Nota (NOM-004)
                                </Button>
                                <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                                  Trazo Táctil Alta Resolución
                                </Badge>
                              </div>
                            </div>

                            <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 overflow-hidden bg-white shadow-md p-2">
                              <img
                                src={selectedNoteData.content.drawing_data_url}
                                alt="Nota Manuscrita"
                                className="w-full h-auto max-h-[850px] object-contain rounded-xl select-none"
                              />
                            </div>

                            {selectedNoteData.content?.notes && (
                              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-border/50">
                                <h5 className="text-xs font-bold uppercase text-muted-foreground mb-1">
                                  Comentarios y Observaciones adicionales
                                </h5>
                                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                  {selectedNoteData.content.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60 flex items-center gap-2">
                              <Brain className="h-5 w-5" /> {selectedNoteData.content?.note_type === 'free_text' ? 'Nota Clínica Libre' : 'Reporte Clínico Estructurado'}
                            </h4>
                            
                            {isEditing ? (
                              <div className="bg-white dark:bg-slate-900 rounded-xl p-2 border-2 border-primary/20 shadow-inner focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all duration-300">
                                <MiniEditor
                                  content={editingText}
                                  onChange={(html) => setEditingText(html)}
                                  className="border-none min-h-[500px]"
                                />
                              </div>
                            ) : (
                              <div className="space-y-6">
                                <div 
                                  className="text-[15px] bg-transparent whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200 prose prose-sm max-w-none prose-headings:text-primary prose-a:text-primary prose-p:mb-4"
                                  dangerouslySetInnerHTML={{ 
                                    __html: DOMPurify.sanitize(getNoteFullDisplayHtml(selectedNoteData)) 
                                  }}
                                />

                                {/* Structured Sections */}
                                {selectedNoteData.diagnosis && (
                                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-border/50">
                                    <h5 className="text-xs font-black uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                                      🩺 Impresión Diagnóstica / CIE-10
                                    </h5>
                                    <p className="text-sm text-foreground leading-relaxed">
                                      {typeof selectedNoteData.diagnosis === 'string' ? selectedNoteData.diagnosis : JSON.stringify(selectedNoteData.diagnosis)}
                                    </p>
                                  </div>
                                )}

                                {selectedNoteData.action_plan && (
                                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-border/50">
                                    <h5 className="text-xs font-black uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                                      🎯 Plan de Acción & Tareas
                                    </h5>
                                    <p className="text-sm text-foreground leading-relaxed">
                                      {typeof selectedNoteData.action_plan === 'string' ? selectedNoteData.action_plan : JSON.stringify(selectedNoteData.action_plan)}
                                    </p>
                                  </div>
                                )}

                                {selectedNoteData.mental_exam && (
                                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-border/50">
                                    <h5 className="text-xs font-black uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                                      🧠 Examen del Estado Mental
                                    </h5>
                                    <p className="text-sm text-foreground leading-relaxed">
                                      {typeof selectedNoteData.mental_exam === 'string' ? selectedNoteData.mental_exam : JSON.stringify(selectedNoteData.mental_exam)}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Visual Signature Block (only shown in view mode) */}
                        {!isEditing && professionalProfile && (
                          <div className="pt-24 mt-24 border-t border-border/60 flex flex-col items-center animate-in fade-in duration-1000">
                            {professionalProfile.signature_data && (
                              <img 
                                src={professionalProfile.signature_data} 
                                alt="Firma" 
                                className="h-20 w-auto mb-4 grayscale hover:grayscale-0 transition-all duration-500 opacity-80"
                              />
                            )}
                            <div className="h-px w-64 bg-slate-200 dark:bg-slate-800 mb-6" />
                            <p className="text-base font-bold text-foreground">
                              {[professionalProfile.prefix, professionalProfile.full_name].filter(Boolean).join(' ')}
                            </p>
                            {professionalProfile.cedulas?.map((ced: any, i: number) => (
                              <p key={i} className="text-xs font-medium text-muted-foreground uppercase tracking-widest mt-1">
                                Céd. Prof. {ced.numero}
                              </p>
                            ))}
                            <p className="text-[10px] font-black text-primary/40 uppercase tracking-[0.3em] mt-8">
                              Psicólogo Responsable
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
      </div>
      </FeatureGate>
    </Layout>
  );
};

export default Notes;
