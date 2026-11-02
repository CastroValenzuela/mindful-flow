import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  FileText,
  Save,
  X,
  Calendar,
  User,
  Sparkles,
  Activity,
  Plus,
} from 'lucide-react';
import PatientAutocomplete from '@/components/patients/PatientAutocomplete';
import CIEDiagnosisSelector, { DiagnosisItem } from '@/components/notes/CIEDiagnosisSelector';
import MiniEditor from '@/components/ui/MiniEditor';
import { toast } from 'sonner';

interface FreeTextNoteFormProps {
  initialPatientId?: string;
  initialPatientName?: string;
  initialDate?: string;
  initialSessionNumber?: number | string;
  initialTopic?: string;
  initialText?: string;
  initialCie10Code?: string;
  initialCie10Description?: string;
  initialDiagnoses?: DiagnosisItem[];
  onSave: (data: {
    patientId?: string;
    patientName?: string;
    date: string;
    sessionNumber: number;
    topic: string;
    text: string;
    cie10Code?: string;
    cie10Description?: string;
    diagnoses?: DiagnosisItem[];
  }) => void;
  onCancel: () => void;
}

export default function FreeTextNoteForm({
  initialPatientId = '',
  initialPatientName = '',
  initialDate = new Date().toISOString().split('T')[0],
  initialSessionNumber = 1,
  initialTopic = 'Nota de Evolución Clínica',
  initialText = '',
  initialCie10Code,
  initialCie10Description,
  initialDiagnoses = [],
  onSave,
  onCancel,
}: FreeTextNoteFormProps) {
  const [patientId, setPatientId] = useState(initialPatientId);
  const [patientName, setPatientName] = useState(initialPatientName);
  const [sessionDate, setSessionDate] = useState(initialDate);
  const [sessionNumber, setSessionNumber] = useState(Number(initialSessionNumber) || 1);
  const [topic, setTopic] = useState(initialTopic);
  const [editorText, setEditorText] = useState(initialText);

  // Diagnósticos seleccionados (CIE-11 / CIE-10)
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>(() => {
    if (initialDiagnoses && initialDiagnoses.length > 0) return initialDiagnoses;
    if (initialCie10Code) {
      const isCie11 = initialCie10Code.startsWith('6') || initialCie10Code.startsWith('7') || initialCie10Code.startsWith('Q');
      return [{
        system: isCie11 ? 'CIE-11' : 'CIE-10',
        code: initialCie10Code,
        description: initialCie10Description || '',
        group: 'Diagnóstico Clínico'
      }];
    }
    return [];
  });

  const [showDxSelector, setShowDxSelector] = useState(diagnoses.length > 0);

  const handleSave = () => {
    const cleanText = editorText.replace(/<[^>]*>/g, '').trim();
    if (!cleanText && !editorText.includes('<img')) {
      toast.error('La nota está vacía. Por favor escribe el contenido antes de guardar.');
      return;
    }

    const primaryDx = diagnoses[0];

    onSave({
      patientId: patientId || undefined,
      patientName: patientName || undefined,
      date: sessionDate,
      sessionNumber: Number(sessionNumber) || 1,
      topic: topic.trim() || 'Nota de Evolución Clínica',
      text: editorText,
      cie10Code: primaryDx?.code,
      cie10Description: primaryDx?.description,
      diagnoses,
    });
  };

  return (
    <div className="w-full space-y-6 animate-fade-in pb-16">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Nota de Texto Libre
              </h2>
              <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                Redacción Abierta
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Espacio flexible de pantalla completa para redactar y editar tus consultas sin restricciones
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-10 px-4 text-xs font-semibold"
          >
            <X className="h-4 w-4 mr-1.5" />
            Cancelar
          </Button>

          <Button
            type="button"
            variant="zen"
            size="sm"
            onClick={handleSave}
            className="h-10 px-5 gap-2 text-xs font-bold shadow-md shadow-primary/20"
          >
            <Save className="h-4 w-4" />
            Guardar Nota
          </Button>
        </div>
      </div>

      {/* ── Metadata Row (Abarca la pantalla limpiamente) ── */}
      <Card className="border-border shadow-xs w-full">
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
            {/* Paciente (4 cols) */}
            <div className="lg:col-span-4 space-y-1.5">
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
                  placeholder="Buscar paciente..."
                />
              )}
            </div>

            {/* Título o Tema (5 cols) */}
            <div className="lg:col-span-5 space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground block">
                Título o Asunto de la Consulta
              </Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ej: Sesión de seguimiento, entrevista inicial, reestructuración..."
                className="h-11 text-sm rounded-xl"
              />
            </div>

            {/* Fecha (2 cols) */}
            <div className="lg:col-span-2 space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Fecha
              </Label>
              <Input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="h-11 text-sm rounded-xl"
              />
            </div>

            {/* Sesión # (1 col) */}
            <div className="lg:col-span-1 space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground block text-center">
                Sesión #
              </Label>
              <Input
                type="number"
                min="1"
                value={sessionNumber}
                onChange={(e) => setSessionNumber(Number(e.target.value) || 1)}
                className="h-11 text-sm font-bold text-center rounded-xl"
              />
            </div>
          </div>

          {/* ── Diagnóstico CIE-11 / CIE-10 (Sección integrada) ── */}
          <div className="pt-4 border-t border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={showDxSelector ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setShowDxSelector(!showDxSelector)}
                  className="h-9 text-xs font-bold gap-1.5 rounded-xl"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {diagnoses.length > 0
                    ? `Diagnósticos Asociados (${diagnoses.length})`
                    : 'Añadir Diagnóstico CIE-11 / CIE-10'}
                </Button>
                {diagnoses.length > 0 && !showDxSelector && (
                  <span className="text-xs text-muted-foreground">
                    {diagnoses.map(d => `${d.system} ${d.code}`).join(', ')}
                  </span>
                )}
              </div>

              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                Los diagnósticos seleccionados se anexan automáticamente al descargar la nota
              </span>
            </div>

            {showDxSelector && (
              <div className="p-4 sm:p-5 bg-muted/20 rounded-2xl border border-border/70 animate-in fade-in">
                <CIEDiagnosisSelector
                  selectedDiagnoses={diagnoses}
                  onDiagnosesChange={setDiagnoses}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Rich Text Editor Document Surface (Abarca toda la pantalla) ── */}
      <Card className="border-border shadow-md overflow-hidden bg-background w-full">
        <div className="p-4 sm:p-5 bg-muted/20 border-b border-border/60 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-primary/80 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Cuerpo de la Nota Clínica
          </span>
          <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
            Formato enriquecido: Encabezados, Negritas, Listas, Viñetas y Citas
          </span>
        </div>

        <div className="p-4 sm:p-8">
          <MiniEditor
            content={editorText}
            onChange={(html) => setEditorText(html)}
            className="border-none shadow-none min-h-[500px] w-full text-base leading-relaxed"
          />
        </div>
      </Card>
    </div>
  );
}
