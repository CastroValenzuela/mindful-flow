import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, ShieldCheck, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface DiagnosisItem {
  system: 'CIE-11' | 'CIE-10';
  code: string;
  description: string;
  group: string;
}

// ── Catálogo CIE-11 (OMS - Capítulo 06, 07 y Factores Psicosociales) ───────
export const CIE11_MENTAL_HEALTH: DiagnosisItem[] = [
  // ── 1. Trastornos del estado de ánimo (Depresivos y Bipolares) ──
  { system: 'CIE-11', code: '6A70', description: 'Trastorno depresivo de episodio único', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A70.0', description: 'Trastorno depresivo de episodio único, leve', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A70.1', description: 'Trastorno depresivo de episodio único, moderado sin síntomas psicóticos', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A70.2', description: 'Trastorno depresivo de episodio único, grave sin síntomas psicóticos', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A70.3', description: 'Trastorno depresivo de episodio único, grave con síntomas psicóticos', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A71', description: 'Trastorno depresivo recurrente', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A71.0', description: 'Trastorno depresivo recurrente, episodio actual leve', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A71.1', description: 'Trastorno depresivo recurrente, episodio actual moderado', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A71.2', description: 'Trastorno depresivo recurrente, episodio actual grave sin psicosis', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A71.3', description: 'Trastorno depresivo recurrente, episodio actual grave con psicosis', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A72', description: 'Trastorno distímico (Distimia)', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A73', description: 'Trastorno disfórico premenstrual', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A60', description: 'Trastorno bipolar de tipo I', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A61', description: 'Trastorno bipolar de tipo II', group: 'Trastornos del estado de ánimo' },
  { system: 'CIE-11', code: '6A62', description: 'Trastorno ciclotímico', group: 'Trastornos del estado de ánimo' },

  // ── 2. Trastornos de ansiedad o relacionados con el miedo ──
  { system: 'CIE-11', code: '6B00', description: 'Trastorno de ansiedad generalizada (TAG)', group: 'Trastornos de ansiedad' },
  { system: 'CIE-11', code: '6B01', description: 'Trastorno de pánico (Crisis de angustia)', group: 'Trastornos de ansiedad' },
  { system: 'CIE-11', code: '6B02', description: 'Agorafobia', group: 'Trastornos de ansiedad' },
  { system: 'CIE-11', code: '6B03', description: 'Fobia específica (animales, alturas, sangre, etc.)', group: 'Trastornos de ansiedad' },
  { system: 'CIE-11', code: '6B04', description: 'Trastorno de ansiedad social (Fobia social)', group: 'Trastornos de ansiedad' },
  { system: 'CIE-11', code: '6B05', description: 'Trastorno de ansiedad por separación', group: 'Trastornos de ansiedad' },
  { system: 'CIE-11', code: '6B06', description: 'Mutismo selectivo', group: 'Trastornos de ansiedad' },

  // ── 3. Trastornos obsesivo-compulsivos o relacionados ──
  { system: 'CIE-11', code: '6B20', description: 'Trastorno obsesivo-compulsivo (TOC)', group: 'Trastornos obsesivos' },
  { system: 'CIE-11', code: '6B21', description: 'Trastorno dismórfico corporal', group: 'Trastornos obsesivos' },
  { system: 'CIE-11', code: '6B22', description: 'Trastorno por acumulación (Acaparamiento)', group: 'Trastornos obsesivos' },
  { system: 'CIE-11', code: '6B23', description: 'Trastorno de ansiedad por la enfermedad (Hipocondría)', group: 'Trastornos obsesivos' },
  { system: 'CIE-11', code: '6B24', description: 'Tricotilomanía (Arrancamiento del cabello)', group: 'Trastornos obsesivos' },
  { system: 'CIE-11', code: '6B25', description: 'Trastorno de excoriación (Rascado compulsivo de la piel)', group: 'Trastornos obsesivos' },

  // ── 4. Trastornos específicamente asociados con el estrés ──
  { system: 'CIE-11', code: '6B40', description: 'Trastorno de estrés postraumático (TEPT)', group: 'Estrés y Trauma' },
  { system: 'CIE-11', code: '6B41', description: 'Trastorno de estrés postraumático complejo (TEPT-C)', group: 'Estrés y Trauma' },
  { system: 'CIE-11', code: '6B42', description: 'Trastorno por duelo prolongado', group: 'Estrés y Trauma' },
  { system: 'CIE-11', code: '6B43', description: 'Trastorno de adaptación', group: 'Estrés y Trauma' },
  { system: 'CIE-11', code: '6B44', description: 'Trastorno de apego reactivo', group: 'Estrés y Trauma' },

  // ── 5. Trastornos del neurodesarrollo ──
  { system: 'CIE-11', code: '6A02', description: 'Trastorno del espectro autista (TEA)', group: 'Neurodesarrollo' },
  { system: 'CIE-11', code: '6A05', description: 'Trastorno por déficit de atención con hiperactividad (TDAH)', group: 'Neurodesarrollo' },
  { system: 'CIE-11', code: '6A05.0', description: 'TDAH con inatención predominante', group: 'Neurodesarrollo' },
  { system: 'CIE-11', code: '6A05.1', description: 'TDAH con hiperactividad-impulsividad predominante', group: 'Neurodesarrollo' },
  { system: 'CIE-11', code: '6A05.2', description: 'TDAH con presentación combinada', group: 'Neurodesarrollo' },
  { system: 'CIE-11', code: '6A03', description: 'Trastornos del desarrollo del habla o del lenguaje', group: 'Neurodesarrollo' },
  { system: 'CIE-11', code: '6A04', description: 'Trastorno del desarrollo del aprendizaje (Dislexia / Discalculia)', group: 'Neurodesarrollo' },
  { system: 'CIE-11', code: '6A06.0', description: 'Síndrome de Tourette / Trastorno de tics motores o vocales crónicos', group: 'Neurodesarrollo' },

  // ── 6. Trastornos de la conducta alimentaria ──
  { system: 'CIE-11', code: '6B80', description: 'Anorexia nerviosa', group: 'Conducta alimentaria' },
  { system: 'CIE-11', code: '6B81', description: 'Bulimia nerviosa', group: 'Conducta alimentaria' },
  { system: 'CIE-11', code: '6B82', description: 'Trastorno por atracón', group: 'Conducta alimentaria' },
  { system: 'CIE-11', code: '6B83', description: 'Trastorno por evitación o restricción de la ingesta de alimentos (TERIA)', group: 'Conducta alimentaria' },

  // ── 7. Trastornos de la personalidad y rasgos relacionados ──
  { system: 'CIE-11', code: '6D10', description: 'Trastorno de la personalidad (Leve / Moderado / Grave)', group: 'Trastornos de la personalidad' },
  { system: 'CIE-11', code: '6D11.0', description: 'Patrón prominente de personalidad límite (Borderline / TLP)', group: 'Trastornos de la personalidad' },
  { system: 'CIE-11', code: '6D11.1', description: 'Patrón de afectividad negativa en la personalidad', group: 'Trastornos de la personalidad' },
  { system: 'CIE-11', code: '6D11.2', description: 'Patrón de desapego en la personalidad', group: 'Trastornos de la personalidad' },
  { system: 'CIE-11', code: '6D11.3', description: 'Patrón de desinhibición en la personalidad', group: 'Trastornos de la personalidad' },
  { system: 'CIE-11', code: '6D11.4', description: 'Patrón de disocialidad en la personalidad', group: 'Trastornos de la personalidad' },
  { system: 'CIE-11', code: '6D11.5', description: 'Patrón de anancastia en la personalidad (Obsesivo-Compulsivo)', group: 'Trastornos de la personalidad' },

  // ── 8. Esquizofrenia y trastornos psicóticos ──
  { system: 'CIE-11', code: '6A20', description: 'Esquizofrenia', group: 'Trastornos psicóticos' },
  { system: 'CIE-11', code: '6A21', description: 'Trastorno esquizoafectivo', group: 'Trastornos psicóticos' },
  { system: 'CIE-11', code: '6A24', description: 'Trastorno de ideas delirantes', group: 'Trastornos psicóticos' },

  // ── 9. Trastornos del ciclo sueño-vigilia ──
  { system: 'CIE-11', code: '7A00', description: 'Trastorno de insomnio crónico', group: 'Trastornos del sueño' },
  { system: 'CIE-11', code: '7A01', description: 'Trastorno de insomnio de corta duración', group: 'Trastornos del sueño' },
  { system: 'CIE-11', code: '7A40', description: 'Trastorno de pesadillas', group: 'Trastornos del sueño' },

  // ── 10. Trastornos del control de los impulsos y adicciones ──
  { system: 'CIE-11', code: '6C40', description: 'Trastornos por consumo perjudicial o dependencia de alcohol', group: 'Sustancias y adicciones' },
  { system: 'CIE-11', code: '6C41', description: 'Trastornos por consumo de cannabis', group: 'Sustancias y adicciones' },
  { system: 'CIE-11', code: '6C45', description: 'Trastornos por consumo de cocaína o estimulantes', group: 'Sustancias y adicciones' },
  { system: 'CIE-11', code: '6C4E', description: 'Trastorno por juego de apuestas patológico (Ludopatía)', group: 'Sustancias y adicciones' },
  { system: 'CIE-11', code: '6C51', description: 'Trastorno por uso de videojuegos', group: 'Sustancias y adicciones' },
  { system: 'CIE-11', code: '6C72', description: 'Trastorno explosivo intermitente', group: 'Control de impulsos' },

  // ── 11. Factores psicosociales y motivos de consulta (Capítulo 24 / Códigos Q) ──
  { system: 'CIE-11', code: 'QD85', description: 'Síndrome de desgaste ocupacional (Burnout)', group: 'Factores psicosociales' },
  { system: 'CIE-11', code: 'QE84', description: 'Problemas de relación con el cónyuge o la pareja', group: 'Factores psicosociales' },
  { system: 'CIE-11', code: 'QE50.0', description: 'Estrés vital agudo o crónico no especificado', group: 'Factores psicosociales' },
  { system: 'CIE-11', code: 'QE51', description: 'Dificultades derivadas de la ruptura o divorcio familiar', group: 'Factores psicosociales' },
  { system: 'CIE-11', code: 'QE70', description: 'Problemas asociados con discriminación, exclusión o acoso', group: 'Factores psicosociales' },
];

// ── Catálogo CIE-10 (NOM-024) ───
export const CIE10_MENTAL_HEALTH: DiagnosisItem[] = [
  { system: 'CIE-10', code: 'F31.3', description: 'Trastorno bipolar, episodio depresivo leve o moderado', group: 'Trastornos del humor' },
  { system: 'CIE-10', code: 'F31.4', description: 'Trastorno bipolar, episodio depresivo grave', group: 'Trastornos del humor' },
  { system: 'CIE-10', code: 'F32.0', description: 'Episodio depresivo leve', group: 'Trastornos del humor' },
  { system: 'CIE-10', code: 'F32.1', description: 'Episodio depresivo moderado', group: 'Trastornos del humor' },
  { system: 'CIE-10', code: 'F32.2', description: 'Episodio depresivo grave sin síntomas psicóticos', group: 'Trastornos del humor' },
  { system: 'CIE-10', code: 'F33.1', description: 'Trastorno depresivo recurrente, episodio moderado', group: 'Trastornos del humor' },
  { system: 'CIE-10', code: 'F34.1', description: 'Distimia', group: 'Trastornos del humor' },
  { system: 'CIE-10', code: 'F40.0', description: 'Agorafobia sin trastorno de pánico', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F40.1', description: 'Fobias sociales', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F41.0', description: 'Trastorno de pánico (ansiedad paroxística episódica)', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F41.1', description: 'Trastorno de ansiedad generalizada', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F41.2', description: 'Trastorno mixto ansioso-depresivo', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F42', description: 'Trastorno obsesivo-compulsivo (TOC)', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F43.0', description: 'Reacción al estrés agudo', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F43.1', description: 'Trastorno de estrés postraumático (TEPT)', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F43.2', description: 'Trastornos de adaptación', group: 'Trastornos de ansiedad' },
  { system: 'CIE-10', code: 'F50.0', description: 'Anorexia nerviosa', group: 'Conducta alimentaria' },
  { system: 'CIE-10', code: 'F50.2', description: 'Bulimia nerviosa', group: 'Conducta alimentaria' },
  { system: 'CIE-10', code: 'F60.3', description: 'Trastorno de personalidad emocionalmente inestable (TLP)', group: 'Trastornos de personalidad' },
  { system: 'CIE-10', code: 'F90.0', description: 'Perturbación de la actividad y atención (TDAH)', group: 'Desarrollo / Infantil' },
  { system: 'CIE-10', code: 'F84.0', description: 'Autismo infantil (TEA)', group: 'Desarrollo / Infantil' },
  { system: 'CIE-10', code: 'F51.0', description: 'Insomnio no orgánico', group: 'Trastornos del sueño' },
  { system: 'CIE-10', code: 'Z73.0', description: 'Agotamiento (burnout)', group: 'Factores psicosociales' },
  { system: 'CIE-10', code: 'Z63.4', description: 'Desaparición o muerte de un familiar (Duelo)', group: 'Factores psicosociales' },
];

export interface CIEDiagnosisSelectorProps {
  /** Diagnósticos múltiples seleccionados */
  selectedDiagnoses?: DiagnosisItem[];
  /** Callback cuando cambia la lista de diagnósticos seleccionados */
  onDiagnosesChange?: (diagnoses: DiagnosisItem[]) => void;
  /** Compatibilidad hacia atrás con selector único */
  value?: { code: string; description: string } | null;
  /** Compatibilidad hacia atrás con selector único */
  onChange?: (value: { code: string; description: string } | null) => void;
  disabled?: boolean;
  className?: string;
}

export default function CIEDiagnosisSelector({
  selectedDiagnoses,
  onDiagnosesChange,
  value,
  onChange,
  disabled,
  className
}: CIEDiagnosisSelectorProps) {
  const [activeTab, setActiveTab] = useState<'CIE-11' | 'CIE-10'>('CIE-11');
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalizar lista de diagnósticos seleccionados
  const currentDiagnoses: DiagnosisItem[] = useMemo(() => {
    if (selectedDiagnoses && selectedDiagnoses.length > 0) {
      return selectedDiagnoses;
    }
    if (value && value.code) {
      const isCie11 = value.code.startsWith('6') || value.code.startsWith('7') || value.code.startsWith('Q');
      return [{
        system: isCie11 ? 'CIE-11' : 'CIE-10',
        code: value.code,
        description: value.description,
        group: 'Diagnóstico Clínico'
      }];
    }
    return [];
  }, [selectedDiagnoses, value]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const catalog = activeTab === 'CIE-11' ? CIE11_MENTAL_HEALTH : CIE10_MENTAL_HEALTH;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return catalog.filter(item =>
      item.code.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [catalog, query]);

  const handleSelect = (item: DiagnosisItem) => {
    const alreadySelected = currentDiagnoses.some(d => d.code === item.code);
    if (!alreadySelected) {
      const updated = [...currentDiagnoses, item];
      if (onDiagnosesChange) {
        onDiagnosesChange(updated);
      }
      if (onChange) {
        onChange({ code: item.code, description: item.description });
      }
    }
    setQuery('');
    setIsOpen(false);
  };

  const handleRemove = (code: string) => {
    const updated = currentDiagnoses.filter(d => d.code !== code);
    if (onDiagnosesChange) {
      onDiagnosesChange(updated);
    }
    if (onChange) {
      if (updated.length > 0) {
        onChange({ code: updated[0].code, description: updated[0].description });
      } else {
        onChange(null);
      }
    }
  };

  return (
    <div className={cn("space-y-3 w-full", className)} ref={containerRef}>
      {/* ── Tabs selector de estándar: CIE-11 vs CIE-10 ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/50">
          <button
            type="button"
            onClick={() => { setActiveTab('CIE-11'); setIsOpen(true); }}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
              activeTab === 'CIE-11'
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            CIE-11 (OMS Actualizada)
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('CIE-10'); setIsOpen(true); }}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-lg transition-all",
              activeTab === 'CIE-10'
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            CIE-10 (NOM-024)
          </button>
        </div>

        <span className="text-[11px] text-muted-foreground hidden sm:inline">
          {activeTab === 'CIE-11' ? 'Clasificación Internacional OMS 11.ª Revisión' : 'Clasificación Internacional 10.ª Revisión'}
        </span>
      </div>

      {/* ── Buscador de Códigos y Términos ── */}
      <div className="relative w-full">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={
            activeTab === 'CIE-11'
              ? 'Buscar en CIE-11 (ej: 6B00, depresión, ansiedad, TDAH, duelo, burnout, TLP...)'
              : 'Buscar en CIE-10 (ej: F41.1, F32, depresión, ansiedad...)'
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-10 pr-9 h-11 bg-background text-sm rounded-xl border-border focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* ── Dropdown de Resultados ── */}
        {isOpen && (
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-xl animate-in fade-in zoom-in-95">
            {filtered.length > 0 ? (
              <div className="p-1 divide-y divide-border/40">
                {filtered.map((item) => {
                  const isSelected = currentDiagnoses.some(d => d.code === item.code);
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={cn(
                        "w-full text-left px-3.5 py-2.5 rounded-lg text-sm transition-colors",
                        "flex items-start justify-between gap-3",
                        isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-accent hover:text-accent-foreground text-foreground"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn(
                            "font-mono font-bold text-xs px-2 py-0.5 rounded",
                            item.system === 'CIE-11'
                              ? "bg-primary/15 text-primary"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          )}>
                            {item.system} {item.code}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {item.group}
                          </span>
                        </div>
                        <p className="text-sm font-semibold leading-snug">{item.description}</p>
                      </div>

                      <div className="shrink-0 pt-1">
                        {isSelected ? (
                          <Badge variant="outline" className="text-[10px] bg-primary/15 text-primary border-primary/30 gap-1 font-bold">
                            <Check className="h-3 w-3" /> Añadido
                          </Badge>
                        ) : (
                          <div className="h-6 w-6 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                            <Plus className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : query.length >= 1 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Sin coincidencias para "{query}"</p>
                <p className="text-xs">Prueba con palabras clave como <em>depresión</em>, <em>ansiedad</em>, <em>estrés</em>, <em>TDAH</em>, <em>sueño</em> o el código exacto.</p>
              </div>
            ) : (
              <div className="p-4 text-xs text-muted-foreground text-center">
                Escribe el nombre del diagnóstico o código para buscar en el catálogo oficial de {activeTab}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Diagnósticos seleccionados y añadidos a la nota ── */}
      {currentDiagnoses.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-bold flex items-center gap-1.5 text-foreground">
              <Check className="h-3.5 w-3.5 text-primary" />
              Diagnósticos asociados a esta nota ({currentDiagnoses.length}):
            </span>
            <span className="text-[11px]">Se anexarán en la descarga del expediente</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {currentDiagnoses.map((dx) => (
              <div
                key={dx.code}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-primary/5 border-primary/25 text-foreground text-xs shadow-xs animate-in fade-in"
              >
                <span className={cn(
                  "font-mono font-black text-[11px] px-1.5 py-0.5 rounded",
                  dx.system === 'CIE-11'
                    ? "bg-primary text-primary-foreground"
                    : "bg-amber-600 text-white"
                )}>
                  {dx.system} {dx.code}
                </span>
                <span className="font-medium text-xs truncate max-w-[280px] sm:max-w-md">
                  {dx.description}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(dx.code)}
                    className="h-5 w-5 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors ml-1"
                    title="Quitar diagnóstico"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          💡 Puedes seleccionar y añadir uno o varios diagnósticos CIE-11 o CIE-10 para asociarlos formalmente a esta nota.
        </p>
      )}
    </div>
  );
}
