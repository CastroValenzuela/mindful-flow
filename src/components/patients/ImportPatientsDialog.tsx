import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  X,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Info,
  Check,
  FileText
} from 'lucide-react';
import {
  downloadPatientExcelTemplate,
  parsePatientExcelFile,
  ParsedPatientRow,
  ParseResult
} from '@/lib/excelPatientUtils';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLogger';

interface ImportPatientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  userId?: string;
  onImportCompleted: () => void;
}

export default function ImportPatientsDialog({
  open,
  onOpenChange,
  organizationId,
  userId,
  onImportCompleted
}: ImportPatientsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States: 'upload' | 'preview' | 'importing' | 'success'
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'success'>('upload');
  const [showGuide, setShowGuide] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const resetState = () => {
    setStep('upload');
    setShowGuide(false);
    setIsDragging(false);
    setIsParsing(false);
    setFileName('');
    setParseResult(null);
    setImportProgress(0);
    setImportedCount(0);
    setSkippedCount(0);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileProcess = async (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      toast.error('Por favor selecciona un archivo en formato .xlsx, .xls o .csv');
      return;
    }

    try {
      setIsParsing(true);
      setFileName(file.name);
      const result = await parsePatientExcelFile(file);

      if (result.validPatients.length === 0) {
        toast.error('No se encontraron registros válidos en el archivo. Revisa que contenga al menos la columna "Nombre".');
        return;
      }

      setParseResult(result);
      setStep('preview');
    } catch (err: any) {
      console.error('Error parsing file:', err);
      toast.error(err.message || 'Error al leer el archivo Excel.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleExecuteImport = async () => {
    if (!parseResult || parseResult.validPatients.length === 0 || !organizationId) return;

    setStep('importing');
    setImportProgress(10);

    try {
      // 1. If skipping duplicates, query existing patients in organization
      let existingPhones = new Set<string>();
      let existingEmails = new Set<string>();

      if (skipDuplicates) {
        const { data: existingData } = await supabase
          .from('patients')
          .select('phone, email')
          .eq('organization_id', organizationId)
          .is('deleted_at', null);

        if (existingData) {
          existingData.forEach(p => {
            if (p.phone) {
              const clean = p.phone.replace(/\D/g, '').slice(-10);
              if (clean) existingPhones.add(clean);
            }
            if (p.email) {
              existingEmails.add(p.email.toLowerCase().trim());
            }
          });
        }
      }

      setImportProgress(30);

      // 2. Filter & format patient payloads
      const patientsToInsert: any[] = [];
      let skipped = 0;

      for (const p of parseResult.validPatients) {
        const cleanPhone = (p.phone || '').replace(/\D/g, '').slice(-10);
        const cleanEmail = (p.email || '').toLowerCase().trim();

        if (skipDuplicates) {
          const isPhoneDup = cleanPhone && existingPhones.has(cleanPhone);
          const isEmailDup = cleanEmail && existingEmails.has(cleanEmail);

          if (isPhoneDup || isEmailDup) {
            skipped++;
            continue;
          }
        }

        // Add to existing set to avoid duplicates within the same batch file
        if (cleanPhone) existingPhones.add(cleanPhone);
        if (cleanEmail) existingEmails.add(cleanEmail);

        patientsToInsert.push({
          name: p.name.trim(),
          phone: p.phone ? p.phone.trim() : null,
          email: p.email ? p.email.trim().toLowerCase() : null,
          birth_date: p.birth_date,
          date_of_birth: p.birth_date,
          gender: p.gender,
          occupation: p.occupation,
          emergency_contact_name: p.emergency_contact_name,
          emergency_contact_phone: p.emergency_contact_phone,
          emergency_contact_relationship: p.emergency_contact_relationship,
          reason_for_consultation: p.reason_for_consultation,
          status: p.status || 'activo',
          tags: p.tags && p.tags.length > 0 ? p.tags : [],
          organization_id: organizationId,
          user_id: userId || null,
          intake_source: 'excel_import'
        });
      }

      setImportProgress(60);

      if (patientsToInsert.length === 0) {
        setSkippedCount(skipped);
        setImportedCount(0);
        setStep('success');
        return;
      }

      // 3. Batch insert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < patientsToInsert.length; i += chunkSize) {
        const chunk = patientsToInsert.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
          .from('patients')
          .insert(chunk);

        if (insertError) throw insertError;
      }

      setImportProgress(90);

      // 4. Log activity
      if (userId) {
        await logActivity({
          profile_id: userId,
          organization_id: organizationId,
          type: 'patient_created',
          title: 'Importación Masiva de Pacientes',
          description: `Se importaron ${patientsToInsert.length} pacientes desde el archivo "${fileName}".`,
        });
      }

      setImportedCount(patientsToInsert.length);
      setSkippedCount(skipped);
      setImportProgress(100);
      setStep('success');
      onImportCompleted();
    } catch (err: any) {
      console.error('Error inserting patients:', err);
      toast.error(err.message || 'Error al guardar los pacientes en la base de datos.');
      setStep('preview');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md md:max-w-xl p-0 overflow-hidden rounded-3xl border-border/60 shadow-2xl bg-white">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
        />

        {/* STEP 1: Upload & Template Download (matches reference image) */}
        {step === 'upload' && (
          <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-start gap-3.5">
              <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Users className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                  Importar pacientes
                </DialogTitle>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  Carga múltiples pacientes desde un archivo Excel de forma rápida y sencilla
                </p>
              </div>
            </div>

            {/* 3 Step Instruction Card */}
            <div className="p-5 rounded-2xl border border-border/60 bg-muted/10 space-y-4 shadow-xs">
              <div className="flex items-start gap-3.5">
                <div className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-bold text-foreground">
                    Descarga la plantilla
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Obtén el archivo con el formato y encabezados correctos
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-bold text-foreground">
                    Completa la información
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Agrega o pega los datos de tus pacientes en el archivo
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-bold text-foreground">
                    Sube el archivo
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Importa todos tus pacientes automáticamente con 1 clic
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons: Download Template & Tutorial */}
            <div className="space-y-2.5">
              <Button
                variant="outline"
                onClick={downloadPatientExcelTemplate}
                className="w-full h-11 rounded-xl bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary font-bold text-xs md:text-sm gap-2 transition-all"
              >
                <Download className="h-4 w-4" />
                <span>Descargar plantilla (.xlsx)</span>
              </Button>

              <Button
                variant="ghost"
                onClick={() => setShowGuide(!showGuide)}
                className="w-full h-10 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-700 font-semibold text-xs gap-2 transition-all border border-emerald-200/50"
              >
                <HelpCircle className="h-4 w-4" />
                <span>{showGuide ? 'Ocultar guía de formato' : 'Ver guía de formato'}</span>
              </Button>
            </div>

            {/* Format Guide Accordion Box */}
            {showGuide && (
              <div className="p-4 rounded-xl bg-muted/30 border border-border/60 text-xs space-y-2 animate-fade-in text-muted-foreground max-h-48 overflow-y-auto leading-relaxed">
                <p className="font-bold text-foreground">Columnas aceptadas en la plantilla:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Nombre Completo *</strong>: Obligatorio.</li>
                  <li><strong>Teléfono *</strong>: 10 dígitos (celular/WhatsApp).</li>
                  <li><strong>Correo Electrónico</strong>: Opcional (para portal de paciente).</li>
                  <li><strong>Fecha de Nacimiento</strong>: AAAA-MM-DD (ej. 1994-06-15).</li>
                  <li><strong>Género</strong>: Femenino, Masculino, No binario, Otro.</li>
                  <li><strong>Contacto de Emergencia</strong>: Nombre, Teléfono y Parentesco.</li>
                  <li><strong>Motivo de Consulta</strong>: Texto libre.</li>
                  <li><strong>Estado</strong>: activo, primer_contacto, inactivo.</li>
                </ul>
              </div>
            )}

            {/* Divider */}
            <div className="relative flex items-center justify-center my-2">
              <div className="border-t border-border/60 w-full" />
              <span className="bg-white px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">
                Cuando tengas tu archivo listo
              </span>
            </div>

            {/* Drag and drop upload zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-border hover:border-primary/40 bg-muted/5'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Button
                type="button"
                disabled={isParsing}
                className="w-full h-12 rounded-xl font-bold text-sm gap-2 bg-primary hover:bg-primary/95 text-white shadow-md shadow-primary/20"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Procesando archivo...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>Subir archivo</span>
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground mt-2">
                Formatos aceptados: <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong>
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: Preview & Validation */}
        {step === 'preview' && parseResult && (
          <div className="p-6 md:p-8 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground leading-tight">
                    Vista previa de importación
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {fileName}
                  </span>
                </div>
              </div>

              <Badge variant="outline" className="font-semibold text-xs border-primary/20 bg-primary/5 text-primary">
                {parseResult.validPatients.length} listos
              </Badge>
            </div>

            {/* Metrics pills */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/60 text-emerald-800">
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80">
                  Pacientes Válidos
                </span>
                <span className="text-xl font-extrabold">{parseResult.validPatients.length}</span>
              </div>
              <div className="p-3 rounded-xl border border-border/60 bg-muted/20 text-muted-foreground">
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80">
                  Filas Omitidas / Inválidas
                </span>
                <span className="text-xl font-extrabold">{parseResult.invalidRows.length}</span>
              </div>
            </div>

            {/* Option Checkbox */}
            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border/60 bg-muted/10 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="font-medium text-foreground">
                Omitir automáticamente pacientes que ya existan en la clínica (por teléfono o correo)
              </span>
            </label>

            {/* Table Preview */}
            <div className="border border-border/60 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground font-semibold sticky top-0 border-b border-border/40">
                  <tr>
                    <th className="p-2.5 pl-3">Nombre</th>
                    <th className="p-2.5">Teléfono</th>
                    <th className="p-2.5">Correo</th>
                    <th className="p-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {parseResult.validPatients.slice(0, 8).map((p, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2.5 pl-3 font-medium text-foreground">{p.name}</td>
                      <td className="p-2.5 text-muted-foreground">{p.phone || '—'}</td>
                      <td className="p-2.5 text-muted-foreground truncate max-w-[120px]">{p.email || '—'}</td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-[10px] py-0 capitalize">
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parseResult.validPatients.length > 8 && (
              <p className="text-[11px] text-muted-foreground text-center">
                Mostrando 8 de {parseResult.validPatients.length} pacientes encontrados en el archivo.
              </p>
            )}

            {/* Dialog Footer Actions */}
            <div className="flex justify-between gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep('upload')}
                className="rounded-xl gap-1.5 h-11 text-xs"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Cambiar archivo</span>
              </Button>

              <Button
                onClick={handleExecuteImport}
                className="rounded-xl font-bold h-11 text-xs gap-2 px-6 bg-primary hover:bg-primary/95 text-white shadow-sm"
              >
                <span>Confirmar e Importar</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Importing Progress */}
        {step === 'importing' && (
          <div className="p-8 text-center space-y-6 animate-fade-in">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-foreground">
                Importando pacientes...
              </h3>
              <p className="text-xs text-muted-foreground">
                Guardando registros en la base de datos de tu clínica.
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-muted/40 h-2.5 rounded-full overflow-hidden max-w-sm mx-auto">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${importProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* STEP 4: Success Result */}
        {step === 'success' && (
          <div className="p-8 text-center space-y-6 animate-fade-in">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-9 w-9 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-2xl font-black text-foreground tracking-tight">
                ¡Importación Completada!
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Los datos han sido incorporados a tu expediente clínico de Saudade.
              </p>
            </div>

            {/* Summary Card */}
            <div className="p-4 rounded-2xl border border-border/50 bg-muted/10 max-w-xs mx-auto text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">Pacientes importados:</span>
                <span className="font-bold text-emerald-600 text-sm">+{importedCount}</span>
              </div>
              {skippedCount > 0 && (
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Duplicados omitidos:</span>
                  <span className="font-semibold">{skippedCount}</span>
                </div>
              )}
            </div>

            <Button
              onClick={handleClose}
              className="w-full max-w-xs mx-auto rounded-xl font-bold h-11 text-sm bg-primary hover:bg-primary/95 text-white shadow-sm"
            >
              <span>Ver Pacientes</span>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
