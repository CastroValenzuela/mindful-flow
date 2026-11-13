import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Pen,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Save,
  X,
  Maximize2,
  Minimize2,
  Grid,
  AlignJustify,
  Square,
  Sparkles,
  Calendar,
  User,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PatientAutocomplete from '@/components/patients/PatientAutocomplete';
import CIE10Selector from '@/components/notes/CIE10Selector';
import { toast } from 'sonner';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  size: number;
  points: Point[];
}

export type PaperType = 'ruled' | 'grid' | 'plain';

interface HandwrittenNoteCanvasProps {
  initialStrokes?: Stroke[];
  initialPaperType?: PaperType;
  initialTopic?: string;
  initialPatientId?: string;
  initialPatientName?: string;
  initialDate?: string;
  initialSessionNumber?: number | string;
  onSave: (data: {
    drawingDataUrl: string;
    strokes: Stroke[];
    paperType: PaperType;
    topic: string;
    notes?: string;
    patientId?: string;
    patientName?: string;
    date: string;
    sessionNumber: number;
    cie10Code?: string;
    cie10Description?: string;
  }) => void;
  onCancel: () => void;
}

const COLORS = [
  { value: '#0f172a', name: 'Negro Clínico', bg: 'bg-slate-900' },
  { value: '#1e40af', name: 'Azul Marino', bg: 'bg-blue-800' },
  { value: '#dc2626', name: 'Rojo Alerta', bg: 'bg-red-600' },
  { value: '#059669', name: 'Verde Terapéutico', bg: 'bg-emerald-600' },
  { value: '#7c3aed', name: 'Púrpura', bg: 'bg-violet-600' },
  { value: '#eab308', name: 'Resaltador Amarillo', bg: 'bg-yellow-500' },
];

const STROKE_SIZES = [
  { label: 'Fino', value: 2 },
  { label: 'Medio', value: 4 },
  { label: 'Grueso', value: 7 },
];

export default function HandwrittenNoteCanvas({
  initialStrokes = [],
  initialPaperType = 'ruled',
  initialTopic = '',
  initialPatientId = '',
  initialPatientName = '',
  initialDate = new Date().toISOString().split('T')[0],
  initialSessionNumber = 1,
  onSave,
  onCancel,
}: HandwrittenNoteCanvasProps) {
  // Canvas refs
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Note Metadata states
  const [patientId, setPatientId] = useState(initialPatientId);
  const [patientName, setPatientName] = useState(initialPatientName);
  const [sessionDate, setSessionDate] = useState(initialDate);
  const [sessionNumber, setSessionNumber] = useState(Number(initialSessionNumber) || 1);
  const [topic, setTopic] = useState(initialTopic || 'Anotaciones de Sesión (Manuscrita)');
  const [additionalText, setAdditionalText] = useState('');
  const [cie10, setCie10] = useState<{ code: string; description: string } | null>(null);
  const [showCie10, setShowCie10] = useState(false);

  // Drawing tools state
  const [currentTool, setCurrentTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [currentColor, setCurrentColor] = useState('#0f172a');
  const [currentSize, setCurrentSize] = useState(2.8);
  const [paperType, setPaperType] = useState<PaperType>(initialPaperType);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Stroke stacks for Undo / Redo
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const isDrawing = useRef(false);
  const currentPoints = useRef<Point[]>([]);

  // ── Render Background Paper Pattern ─────────────────────────────────────────
  const renderBackground = useCallback(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = sheetContainerRef.current;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || container?.clientWidth || 0;
    const h = rect.height || container?.clientHeight || 0;

    if (w === 0 || h === 0) return;

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Fondo blanco suave papel
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (paperType === 'ruled') {
      // Líneas horizontales de cuaderno clínico
      const lineSpacing = 32;
      const topMargin = 40;

      ctx.beginPath();
      ctx.strokeStyle = '#cbd5e1'; // Gris nítido visible (Slate-300)
      ctx.lineWidth = 1;

      for (let y = topMargin; y < h; y += lineSpacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Margen vertical izquierdo rojo clásico (estilo cuaderno)
      ctx.beginPath();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.2;
      ctx.moveTo(48, 0);
      ctx.lineTo(48, h);
      ctx.stroke();
    } else if (paperType === 'grid') {
      // Cuadrícula clínica nítida (estilo libreta cuadriculada)
      const gridSize = 28;
      ctx.beginPath();
      ctx.strokeStyle = '#cbd5e1'; // Gris nítido visible (Slate-300)
      ctx.lineWidth = 1;

      for (let x = 0; x < w; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Líneas guía principales cada 4 celdas
      ctx.beginPath();
      ctx.strokeStyle = '#94a3b8'; // Slate-400
      ctx.lineWidth = 1.2;
      for (let x = 0; x < w; x += gridSize * 4) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += gridSize * 4) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }
  }, [paperType]);

  // ── Redraw Strokes on Drawing Canvas ────────────────────────────────────────
  const renderStrokes = useCallback(
    (strokeList: Stroke[], previewPoints?: Point[]) => {
      const canvas = drawCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const container = sheetContainerRef.current;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || container?.clientWidth || 0;
      const h = rect.height || container?.clientHeight || 0;

      if (w === 0 || h === 0) return;

      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const allStrokes = previewPoints && previewPoints.length > 0
        ? [
            ...strokeList,
            {
              tool: currentTool,
              color: currentColor,
              size: currentTool === 'highlighter' ? 24 : currentSize,
              points: previewPoints,
            },
          ]
        : strokeList;

      allStrokes.forEach((stroke) => {
        const pts = stroke.points;
        if (!pts || pts.length === 0) return;

        ctx.save();

        if (stroke.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = stroke.size * 5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        } else if (stroke.tool === 'highlighter') {
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = stroke.color === '#0f172a' ? '#facc15' : stroke.color;
          ctx.lineWidth = stroke.size;
          ctx.lineCap = 'square';
          ctx.lineJoin = 'round';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1.0;
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.size;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }

        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
          ctx.fillStyle = stroke.color;
          ctx.fill();
          ctx.restore();
          return;
        }

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);

        if (pts.length === 2) {
          ctx.lineTo(pts[1].x, pts[1].y);
        } else {
          // Curva suave Bezier para sensación de lápiz fluido en iPad
          for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        }

        ctx.stroke();
        ctx.restore();
      });
    },
    [currentColor, currentSize, currentTool]
  );

  // Synchronize strokes ref
  const strokesRef = useRef<Stroke[]>(strokes);
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // Paper type change handler
  useEffect(() => {
    renderBackground();
  }, [paperType, renderBackground]);

  // Unified Resize & Observer Handler (handles Fullscreen/Minimize, Window Resize, Tablet Rotation)
  useEffect(() => {
    const container = sheetContainerRef.current;
    if (!container) return;

    const updateAndRedraw = () => {
      renderBackground();
      renderStrokes(strokesRef.current);
    };

    updateAndRedraw();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateAndRedraw();
      });
      ro.observe(container);
    }

    window.addEventListener('resize', updateAndRedraw);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateAndRedraw);
    };
  }, [renderBackground, renderStrokes]);

  // Redraw when toggling isFullscreen to guarantee instantaneous refresh in both modes
  useEffect(() => {
    const t1 = setTimeout(() => {
      renderBackground();
      renderStrokes(strokesRef.current);
    }, 30);
    const t2 = setTimeout(() => {
      renderBackground();
      renderStrokes(strokesRef.current);
    }, 150);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isFullscreen, renderBackground, renderStrokes]);

  // Strict non-passive touch prevention (Palm Rejection for iPad / Tablets)
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    const preventTouchScroll = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    canvas.addEventListener('touchstart', preventTouchScroll, { passive: false });
    canvas.addEventListener('touchmove', preventTouchScroll, { passive: false });
    canvas.addEventListener('touchend', preventTouchScroll, { passive: false });
    canvas.addEventListener('touchcancel', preventTouchScroll, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', preventTouchScroll);
      canvas.removeEventListener('touchmove', preventTouchScroll);
      canvas.removeEventListener('touchend', preventTouchScroll);
      canvas.removeEventListener('touchcancel', preventTouchScroll);
    };
  }, []);

  // ── Pointer Event Handlers ──────────────────────────────────────────────────
  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

    isDrawing.current = true;
    const pt = getPoint(e);
    currentPoints.current = [pt];
    renderStrokes(strokesRef.current, [pt]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    e.stopPropagation();

    const pt = getPoint(e);
    currentPoints.current.push(pt);
    renderStrokes(strokesRef.current, currentPoints.current);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    e.stopPropagation();
    isDrawing.current = false;

    const canvas = drawCanvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (currentPoints.current.length > 0) {
      const newStroke: Stroke = {
        tool: currentTool,
        color: currentColor,
        size: currentTool === 'highlighter' ? 24 : currentSize,
        points: [...currentPoints.current],
      };

      setStrokes((prev) => [...prev, newStroke]);
      setRedoStack([]); // Limpiar stack de rehacer
      currentPoints.current = [];
    }
  };

  // Undo / Redo
  const handleUndo = () => {
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    setRedoStack((prev) => [last, ...prev]);
    const next = strokes.slice(0, -1);
    setStrokes(next);
    renderStrokes(next);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextStroke = redoStack[0];
    setRedoStack((prev) => prev.slice(1));
    const nextStrokes = [...strokes, nextStroke];
    setStrokes(nextStrokes);
    renderStrokes(nextStrokes);
  };

  const handleClear = () => {
    if (strokes.length === 0) return;
    if (window.confirm('¿Deseas borrar todos los trazos de este lienzo?')) {
      setStrokes([]);
      setRedoStack([]);
      renderStrokes([]);
    }
  };

  // ── Export Combined PNG (Paper Background + Strokes) ────────────────────────
  const generateExportDataUrl = (): string => {
    const bg = bgCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!bg || !draw) return '';

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = bg.width;
    exportCanvas.height = bg.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return '';

    // Dibujar fondo
    ctx.drawImage(bg, 0, 0);
    // Dibujar trazos
    ctx.drawImage(draw, 0, 0);

    return exportCanvas.toDataURL('image/png', 0.95);
  };

  const handleSave = () => {
    if (strokes.length === 0) {
      toast.error('El lienzo está vacío. Dibuja o anota algo antes de guardar.');
      return;
    }

    const dataUrl = generateExportDataUrl();
    if (!dataUrl) {
      toast.error('Error al generar la imagen de la nota.');
      return;
    }

    onSave({
      drawingDataUrl: dataUrl,
      strokes,
      paperType,
      topic: topic.trim() || 'Anotaciones de Sesión (Manuscrita)',
      notes: additionalText.trim(),
      patientId: patientId || undefined,
      patientName: patientName || undefined,
      date: sessionDate,
      sessionNumber: Number(sessionNumber) || 1,
      cie10Code: cie10?.code,
      cie10Description: cie10?.description,
    });
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-slate-50 dark:bg-slate-900 border border-border overflow-hidden shadow-sm',
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none w-screen h-screen'
          : 'relative w-full h-[calc(100vh-140px)] min-h-[680px] max-h-[950px] rounded-2xl'
      )}
    >
      {/* ── Top Header Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-background border-b border-border z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center font-bold">
            <Pen className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                Nota Manuscrita para iPad & Tablet
              </h2>
              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                Touch / Pencil
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Anota libremente con Apple Pencil, Stylus o con el dedo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa (Modo Tableta)'}
            className="h-9 px-3 gap-1.5 text-xs font-semibold"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Minimizar' : 'Pantalla Completa'}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-9 px-3 text-xs font-semibold"
          >
            <X className="h-4 w-4 mr-1.5" />
            Cancelar
          </Button>

          <Button
            type="button"
            variant="zen"
            size="sm"
            onClick={handleSave}
            className="h-9 px-4 gap-1.5 text-xs font-bold shadow-md shadow-primary/20"
          >
            <Save className="h-4 w-4" />
            Guardar Nota
          </Button>
        </div>
      </div>

      {/* ── Context & Metadata Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-muted/20 border-b border-border/60 text-xs shrink-0">
        {/* Paciente */}
        <div>
          <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
            <User className="h-3 w-3" /> Paciente
          </Label>
          {initialPatientId ? (
            <div className="h-8 px-2.5 rounded-lg bg-card border border-border/60 flex items-center font-bold text-xs truncate">
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
          <Label className="text-[11px] font-bold text-muted-foreground mb-1 block">
            Título / Motivo de la Nota
          </Label>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ej: Anotaciones de sesión, genograma, esquema cognitivo..."
            className="h-8 text-xs bg-card"
          />
        </div>

        {/* Fecha y Sesión */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-[11px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Fecha
            </Label>
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="h-8 text-xs bg-card"
            />
          </div>
          <div className="w-20">
            <Label className="text-[11px] font-bold text-muted-foreground mb-1 block">
              Sesión #
            </Label>
            <Input
              type="number"
              min="1"
              value={sessionNumber}
              onChange={(e) => setSessionNumber(Number(e.target.value) || 1)}
              className="h-8 text-xs bg-card text-center font-bold"
            />
          </div>
        </div>
      </div>

      {/* ── Interactive Drawing Toolbar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-card border-b border-border shadow-xs shrink-0 select-none">
        {/* Tool Selector */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentTool('pen')}
            className={cn(
              'h-8 px-2.5 gap-1.5 text-xs font-bold rounded-lg transition-all',
              currentTool === 'pen' && 'bg-background shadow-xs text-primary'
            )}
            title="Bolígrafo de tinta clínica"
          >
            <Pen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pluma</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentTool('highlighter')}
            className={cn(
              'h-8 px-2.5 gap-1.5 text-xs font-bold rounded-lg transition-all',
              currentTool === 'highlighter' && 'bg-background shadow-xs text-amber-600'
            )}
            title="Marcador / Resaltador translúcido"
          >
            <Highlighter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Resaltador</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentTool('eraser')}
            className={cn(
              'h-8 px-2.5 gap-1.5 text-xs font-bold rounded-lg transition-all',
              currentTool === 'eraser' && 'bg-background shadow-xs text-rose-600'
            )}
            title="Borrador de trazos"
          >
            <Eraser className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Borrador</span>
          </Button>
        </div>

        {/* Thickness */}
        {currentTool !== 'highlighter' && currentTool !== 'eraser' && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1 hidden md:inline">
              Grosor:
            </span>
            {STROKE_SIZES.map((sz) => (
              <button
                key={sz.value}
                type="button"
                onClick={() => setCurrentSize(sz.value)}
                className={cn(
                  'h-7 px-2 rounded-md text-xs font-bold transition-all border',
                  currentSize === sz.value
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted/40'
                )}
              >
                {sz.label}
              </button>
            ))}
          </div>
        )}

        {/* Color Palette */}
        {currentTool !== 'eraser' && (
          <div className="flex items-center gap-1.5">
            {COLORS.map((col) => (
              <button
                key={col.value}
                type="button"
                onClick={() => setCurrentColor(col.value)}
                title={col.name}
                className={cn(
                  'h-6 w-6 rounded-full transition-transform border border-black/10 flex items-center justify-center',
                  col.bg,
                  currentColor === col.value ? 'scale-125 ring-2 ring-primary ring-offset-2' : 'hover:scale-110'
                )}
              />
            ))}
          </div>
        )}

        {/* Paper Style Selector */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
          <button
            type="button"
            onClick={() => setPaperType('ruled')}
            title="Papel Rayado con renglones"
            className={cn(
              'h-7 px-2.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all',
              paperType === 'ruled'
                ? 'bg-primary text-primary-foreground shadow-xs font-black'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <AlignJustify className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Renglones</span>
          </button>
          <button
            type="button"
            onClick={() => setPaperType('grid')}
            title="Papel Cuadriculado"
            className={cn(
              'h-7 px-2.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all',
              paperType === 'grid'
                ? 'bg-primary text-primary-foreground shadow-xs font-black'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Grid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cuadrícula</span>
          </button>
          <button
            type="button"
            onClick={() => setPaperType('plain')}
            title="Papel Blanco Liso"
            className={cn(
              'h-7 px-2.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all',
              paperType === 'plain'
                ? 'bg-primary text-primary-foreground shadow-xs font-black'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Square className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Liso</span>
          </button>
        </div>

        {/* Undo / Redo / Clear Actions */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={strokes.length === 0}
            className="h-8 w-8 p-0"
            title="Deshacer trazo (Undo)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="h-8 w-8 p-0"
            title="Rehacer trazo (Redo)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={strokes.length === 0}
            className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
            title="Limpiar todo el lienzo"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Limpiar</span>
          </Button>
        </div>
      </div>

      {/* ── Main Canvas Viewport (Touch Protected) ───────────────────────── */}
      <div
        className="relative flex-1 w-full min-h-[460px] bg-slate-200/50 dark:bg-slate-950 p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center select-none"
        style={{ touchAction: 'none' }}
      >
        {/* Sheet Surface Container */}
        <div
          ref={sheetContainerRef}
          className={cn(
            'relative w-full h-full min-h-[440px] flex-1 bg-white rounded-xl shadow-lg border border-slate-300 dark:border-slate-800 overflow-hidden cursor-crosshair select-none',
            isFullscreen ? 'max-w-none max-h-none' : 'max-w-5xl'
          )}
          style={{ touchAction: 'none' }}
        >
          {/* Layer 1: Background canvas (Lines / Grid) */}
          <canvas
            ref={bgCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none select-none z-0"
            style={{ display: 'block', touchAction: 'none', width: '100%', height: '100%' }}
          />

          {/* Layer 2: Drawing canvas (Strokes & Pointer Events) */}
          <canvas
            ref={drawCanvasRef}
            className="absolute inset-0 w-full h-full select-none z-10"
            style={{ display: 'block', touchAction: 'none', width: '100%', height: '100%' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

          {/* Watermark / Empty state hint */}
          {strokes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none opacity-40">
              <Pen className="h-10 w-10 text-primary mb-2 animate-bounce" />
              <p className="text-sm font-bold text-slate-700">
                Lienzo listo para escribir o dibujar
              </p>
              <p className="text-xs text-slate-500">
                Usa tu Apple Pencil, lápiz táctil o dedo directamente sobre la pantalla
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Complementary Notes & Diagnostics (Collapsible) ────────── */}
      <div className="p-3 bg-background border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowCie10(!showCie10)}
            className="h-8 text-xs font-semibold gap-1.5"
          >
            🩺 {cie10 ? `${cie10.code}` : '+ Diagnóstico CIE-10 (Opcional)'}
          </Button>

          <Input
            value={additionalText}
            onChange={(e) => setAdditionalText(e.target.value)}
            placeholder="Comentarios de texto o resumen breve adicional (opcional)..."
            className="h-8 text-xs flex-1 sm:w-96"
          />
        </div>

        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>{strokes.length} trazos registrados · Alta resolución</span>
        </div>
      </div>

      {/* CIE-10 Selector Dialog / Drawer */}
      {showCie10 && (
        <div className="p-4 bg-muted/40 border-t border-border animate-in fade-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-xs">Asignar Código CIE-10</span>
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
    </div>
  );
}
