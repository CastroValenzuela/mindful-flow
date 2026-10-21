import React, { useState } from 'react';
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
} from 'lucide-react';
import PatientAutocomplete from '@/components/patients/PatientAutocomplete';
import CIE10Selector from '@/components/notes/CIE10Selector';
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
  onSave: (data: {
    patientId?: string;
    patientName?: string;
    date: string;
    sessionNumber: number;
    topic: string;
    text: string;
    cie10Code?: string;
    cie10Description?: string;
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
  onSave,
  onCancel,
}: FreeTextNoteFormProps) {
  const [patientId, setPatientId] = useState(initialPatientId);
  const [patientName, setPatientName] = useState(initialPatientName);
  const [sessionDate, setSessionDate] = useState(initialDate);
  const [sessionNumber, setSessionNumber] = useState(Number(initialSessionNumber) || 1);
  const [topic, setTopic] = useState(initialTopic);
  const [editorText, setEditorText] = useState(initialText);
  const [cie10, setCie10] = useState<{ code: string; description: string } | null>(
    initialCie10Code ? { code: initialCie10Code, description: initialCie10Description || '' } : null
  );
  const [showCie10, setShowCie10] = useState(false);

  const handleSave = () => {
    const cleanText = editorText.replace(/<[^>]*>/g, '').trim();
    if (!cleanText && !editorText.includes('<img')) {
      toast.error('La nota está vacía. Por favor escribe el contenido antes de guardar.');
      return;
    }

    onSave({
      patientId: patientId || undefined,
      patientName: patientName || undefined,
      date: sessionDate,
      sessionNumber: Number(sessionNumber) || 1,
      topic: topic.trim() || 'Nota de Evolución Clínica',
      text: editorText,
      cie10Code: cie10?.code,
      cie10Description: cie10?.description,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
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
              Espacio flexible sin secciones predefinidas para redactar y editar tus consultas
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

      {/* ── Metadata Row ── */}
      <Card className="border-border shadow-xs">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Paciente */}
            <div>
              <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <User className="h-3.5 w-3.5" /> Paciente
              </Label>
              {initialPatientId ? (
                <div className="h-10 px-3 rounded-lg bg-muted/30 border border-border/60 flex items-center font-bold text-sm truncate">
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

            {/* Título o Tema */}
            <div className="md:col-span-2">
              <Label className="text-xs font-bold text-muted-foreground mb-1.5 block">
                Título o Tema de la Consulta
              </Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ej: Sesión de seguimiento, entrevista inicial, etc."
                className="h-10 text-sm"
              />
            </div>

            {/* Fecha y Sesión */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Fecha
                </Label>
                <Input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div className="w-24">
                <Label className="text-xs font-bold text-muted-foreground mb-1.5 block">
                  Sesión #
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={sessionNumber}
                  onChange={(e) => setSessionNumber(Number(e.target.value) || 1)}
                  className="h-10 text-sm font-bold text-center"
                />
              </div>
            </div>
          </div>

          {/* Optional CIE-10 Diagnostic Badge & Toggle */}
          <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCie10(!showCie10)}
                className="h-8 text-xs font-semibold gap-1.5"
              >
                🩺 {cie10 ? `CIE-10: ${cie10.code}` : '+ Asociar Diagnóstico CIE-10 (Opcional)'}
              </Button>
              {cie10 && (
                <span className="text-xs text-muted-foreground truncate max-w-sm">
                  {cie10.description}
                </span>
              )}
            </div>

            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />
              Edición en texto enriquecido con guardado en tiempo real
            </span>
          </div>

          {showCie10 && (
            <div className="mt-3 p-4 bg-muted/30 rounded-xl border border-border/60 animate-in fade-in">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs">Catálogo de Diagnósticos CIE-10</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCie10(false)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <CIE10Selector
                value={cie10}
                onChange={(selected) => {
                  setCie10(selected);
                  setShowCie10(false);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Rich Text Editor Document Surface ── */}
      <Card className="border-border shadow-md overflow-hidden bg-background">
        <div className="p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-900/30 border-b border-border/60 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Cuerpo de la Nota Clínica
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            Formato: Títulos, Negritas, Viñetas, Listas
          </span>
        </div>

        <div className="p-4 sm:p-6">
          <MiniEditor
            content={editorText}
            onChange={(html) => setEditorText(html)}
            className="border-none shadow-none min-h-[450px]"
          />
        </div>
      </Card>
    </div>
  );
}
