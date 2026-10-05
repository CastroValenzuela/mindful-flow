import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  PenTool, 
  RotateCcw, 
  Eraser, 
  CheckCircle2, 
  Upload, 
  Download, 
  Trash2, 
  Maximize2, 
  Type, 
  Sparkles, 
  Check, 
  ShieldCheck, 
  Info,
  Smartphone,
  Undo2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

interface ProfessionalSignaturePadProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  userName?: string;
  className?: string;
}

const INK_COLORS = [
  { id: 'navy', label: 'Azul Notarial', value: '#0f2b5c' },
  { id: 'black', label: 'Negro Formal', value: '#111827' },
  { id: 'blue', label: 'Azul Zafiro', value: '#1d4ed8' },
];

const STROKE_WIDTHS = [
  { id: 'fine', label: 'Fino', value: 1.8 },
  { id: 'medium', label: 'Estándar', value: 2.8 },
  { id: 'bold', label: 'Grueso', value: 4.0 },
];

const SCRIPT_FONTS = [
  { 
    id: 'dancing', 
    name: 'Estilo Notarial', 
    fontFamily: "'Dancing Script', cursive",
    description: 'Trazo fluido, ideal para documentos legales y médicos'
  },
  { 
    id: 'caveat', 
    name: 'Caligrafía Médica', 
    fontFamily: "'Caveat', cursive",
    description: 'Estilo manuscrito ágil y profesional'
  },
  { 
    id: 'greatvibes', 
    name: 'Rúbrica Elegante', 
    fontFamily: "'Great Vibes', cursive",
    description: 'Caligrafía clásica formal con florituras sutiles'
  },
  { 
    id: 'playwrite', 
    name: 'Manuscrito Formal', 
    fontFamily: "'Playwrite US Modern', cursive",
    description: 'Tipografía cursiva sobria y legible'
  },
];

export default function ProfessionalSignaturePad({
  value,
  onChange,
  userName = '',
  className,
}: ProfessionalSignaturePadProps) {
  const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [isEditing, setIsEditing] = useState(!value);

  // Drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStroke = useRef<Point[]>([]);
  const isDrawing = useRef(false);
  const [selectedColor, setSelectedColor] = useState(INK_COLORS[0].value);
  const [selectedWidth, setSelectedWidth] = useState(STROKE_WIDTHS[1].value);

  // Fullscreen / Modal mode
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  // Typed mode state
  const [typedName, setTypedName] = useState(userName || '');
  const [selectedFont, setSelectedFont] = useState(SCRIPT_FONTS[0].id);

  // Upload state
  const [autoRemoveBg, setAutoRemoveBg] = useState(true);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  // Sync isEditing with value
  useEffect(() => {
    if (!value) {
      setIsEditing(true);
    }
  }, [value]);

  useEffect(() => {
    if (userName && !typedName) {
      setTypedName(userName);
    }
  }, [userName, typedName]);

  // Redraw strokes on a given canvas
  const redrawCanvas = useCallback((
    canvas: HTMLCanvasElement | null, 
    strokeList: Stroke[], 
    previewStroke?: { points: Point[]; color: string; width: number }
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Check if dimensions match
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    // Reset context
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const allStrokes = previewStroke ? [...strokeList, previewStroke] : strokeList;

    allStrokes.forEach((stroke) => {
      const pts = stroke.points;
      if (pts.length === 0) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.color;
        ctx.fill();
        return;
      }

      ctx.moveTo(pts[0].x, pts[0].y);

      if (pts.length === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
      } else {
        // Smooth Quadratic Bezier curve through midpoints
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2;
          const yc = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      }

      ctx.stroke();
    });
  }, []);

  // Update canvas on strokes change
  useEffect(() => {
    if (activeTab === 'draw') {
      redrawCanvas(canvasRef.current, strokes);
      if (isFullscreenOpen) {
        redrawCanvas(modalCanvasRef.current, strokes);
      }
    }
  }, [strokes, activeTab, isFullscreenOpen, redrawCanvas]);

  // Window resize observer to keep resolution crisp
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) redrawCanvas(canvasRef.current, strokes);
      if (modalCanvasRef.current) redrawCanvas(modalCanvasRef.current, strokes);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [strokes, redrawCanvas]);

  // BULLETPROOF TOUCH SCROLL PREVENTION:
  // Modern browsers ignore e.preventDefault() in passive React synthetic touch events.
  // We register non-passive native event listeners directly on canvas refs to lock gestures.
  const bindTouchLock = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return () => {};

    const preventTouch = (e: TouchEvent) => {
      // Strictly prevent browser scrolling while drawing inside signature canvas
      e.preventDefault();
      e.stopPropagation();
    };

    canvas.addEventListener('touchstart', preventTouch, { passive: false });
    canvas.addEventListener('touchmove', preventTouch, { passive: false });
    canvas.addEventListener('touchend', preventTouch, { passive: false });
    canvas.addEventListener('touchcancel', preventTouch, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', preventTouch);
      canvas.removeEventListener('touchmove', preventTouch);
      canvas.removeEventListener('touchend', preventTouch);
      canvas.removeEventListener('touchcancel', preventTouch);
    };
  }, []);

  useEffect(() => {
    const cleanupInline = bindTouchLock(canvasRef.current);
    const cleanupModal = bindTouchLock(modalCanvasRef.current);
    return () => {
      cleanupInline();
      cleanupModal();
    };
  }, [activeTab, isFullscreenOpen, bindTouchLock]);

  // Pointer position helper
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Drawing event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>, isModal = false) => {
    const canvas = isModal ? modalCanvasRef.current : canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignored if unsupported
    }

    isDrawing.current = true;
    const pt = getCanvasPoint(e, canvas);
    currentStroke.current = [pt];

    redrawCanvas(canvas, strokes, {
      points: [pt],
      color: selectedColor,
      width: selectedWidth,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>, isModal = false) => {
    if (!isDrawing.current) return;
    const canvas = isModal ? modalCanvasRef.current : canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    e.stopPropagation();

    const pt = getCanvasPoint(e, canvas);
    currentStroke.current.push(pt);

    redrawCanvas(canvas, strokes, {
      points: currentStroke.current,
      color: selectedColor,
      width: selectedWidth,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>, isModal = false) => {
    if (!isDrawing.current) return;
    const canvas = isModal ? modalCanvasRef.current : canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    e.stopPropagation();

    isDrawing.current = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }

    if (currentStroke.current.length > 0) {
      const newStroke: Stroke = {
        points: [...currentStroke.current],
        color: selectedColor,
        width: selectedWidth,
      };
      setStrokes((prev) => [...prev, newStroke]);
    }
    currentStroke.current = [];
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
  };

  // AUTO-TRIM & CROP:
  // Crops empty margin around ink strokes to produce perfectly centered, professional signature files.
  const trimCanvas = (canvas: HTMLCanvasElement): string | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return null;

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let found = false;

    // Scan for non-transparent pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 20) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!found) return null;

    // Add 24px padding around cropped bounds
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const pad = Math.round(20 * dpr);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad);
    maxY = Math.min(height, maxY + pad);

    const cropW = maxX - minX;
    const cropH = maxY - minY;

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = cropW;
    trimmedCanvas.height = cropH;
    const trimCtx = trimmedCanvas.getContext('2d');
    if (!trimCtx) return canvas.toDataURL('image/png');

    trimCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return trimmedCanvas.toDataURL('image/png');
  };

  // Confirm Drawn Signature
  const handleConfirmDraw = () => {
    const canvas = isFullscreenOpen ? modalCanvasRef.current : canvasRef.current;
    if (!canvas || strokes.length === 0) {
      toast.error('Por favor realiza tu firma antes de confirmar');
      return;
    }

    const trimmedDataUrl = trimCanvas(canvas);
    if (!trimmedDataUrl) {
      toast.error('No se detectó ningún trazo en el lienzo');
      return;
    }

    onChange(trimmedDataUrl);
    setIsEditing(false);
    setIsFullscreenOpen(false);
    toast.success('Firma capturada correctamente. Recuerda guardar los cambios en tu perfil.');
  };

  // Confirm Typed Signature
  const handleConfirmTyped = (fontFamily: string) => {
    if (!typedName.trim()) {
      toast.error('Ingresa tu nombre para generar la firma');
      return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1200;
    tempCanvas.height = 400;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.font = `64px ${fontFamily}`;
    ctx.fillStyle = selectedColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName.trim(), tempCanvas.width / 2, tempCanvas.height / 2);

    const trimmed = trimCanvas(tempCanvas);
    if (!trimmed) {
      toast.error('Error al generar la firma tipográfica');
      return;
    }

    onChange(trimmed);
    setIsEditing(false);
    toast.success('Firma tipográfica generada. Recuerda guardar los cambios en tu perfil.');
  };

  // Image Upload handler with smart transparency
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato no válido. Usa PNG, JPG o WEBP.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);

        if (autoRemoveBg) {
          // Remove white/light paper background
          const imgData = ctx.getImageData(0, 0, c.width, c.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            // Luminance check
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum > 215) {
              d[i + 3] = 0; // Transparent
            } else if (lum > 180) {
              // Smooth gradient anti-aliasing
              d[i + 3] = Math.round(((215 - lum) / 35) * d[i + 3]);
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const trimmed = trimCanvas(c) || c.toDataURL('image/png');
        setUploadedPreview(trimmed);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmUpload = () => {
    if (!uploadedPreview) {
      toast.error('Sube una imagen primero');
      return;
    }
    onChange(uploadedPreview);
    setIsEditing(false);
    toast.success('Firma cargada con éxito. Recuerda guardar los cambios en tu perfil.');
  };

  // Download signature image
  const handleDownload = () => {
    if (!value) return;
    const a = document.createElement('a');
    a.href = value;
    a.download = `firma-profesional-${Date.now()}.png`;
    a.click();
    toast.success('Firma descargada');
  };

  // VIEW MODE: Saved Signature Display
  if (!isEditing && value) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="relative rounded-2xl border-2 border-primary/20 bg-gradient-to-b from-card to-muted/20 p-6 overflow-hidden shadow-soft group">
          {/* Subtle security watermark */}
          <div className="absolute right-4 top-4 opacity-5 pointer-events-none select-none text-[80px] font-black text-foreground">
            NOM
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  Firma Profesional Registrada
                  <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Activa
                  </span>
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Esta firma se estampa con validez en recetas médicas, notas de evolución y consentimientos.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9"
                onClick={handleDownload}
                title="Descargar copia transparente en PNG"
              >
                <Download className="h-3.5 w-3.5" /> Descargar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9 hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                onClick={() => {
                  setIsEditing(true);
                  setStrokes([]);
                }}
              >
                <PenTool className="h-3.5 w-3.5" /> Cambiar firma
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (window.confirm('¿Deseas eliminar la firma registrada?')) {
                    onChange(null);
                    setIsEditing(true);
                    setStrokes([]);
                    toast.info('Firma eliminada');
                  }
                }}
                title="Eliminar firma"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Signature visual representation */}
          <div className="mt-5 pt-5 border-t border-border/40 flex flex-col items-center justify-center bg-white/70 dark:bg-black/30 rounded-xl p-4 border border-border/30">
            <img 
              src={value} 
              alt="Firma Profesional Registrada" 
              className="max-h-[110px] w-auto object-contain select-none transition-transform hover:scale-105 duration-300" 
            />
            <div className="w-48 h-0.5 bg-border/60 mt-3 rounded-full" />
            <p className="text-[10px] text-muted-foreground/80 mt-1 uppercase tracking-widest font-mono">
              Rúbrica Digital Autorizada
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border/30">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Conforme a NOM-024-SSA3-2012 y NOM-151 (Constancia de Conservación).
            </span>
          </div>
        </div>
      </div>
    );
  }

  // EDIT MODE: Top-tier Signature Creation Suite
  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-soft">
        <Tabs 
          value={activeTab} 
          onValueChange={(val) => setActiveTab(val as 'draw' | 'type' | 'upload')} 
          className="w-full"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <TabsList className="grid grid-cols-3 w-full sm:w-auto h-10 p-1 bg-muted/60 rounded-xl">
              <TabsTrigger value="draw" className="gap-2 text-xs font-semibold rounded-lg data-[state=active]:shadow-sm">
                <PenTool className="h-3.5 w-3.5" /> Dibujar
              </TabsTrigger>
              <TabsTrigger value="type" className="gap-2 text-xs font-semibold rounded-lg data-[state=active]:shadow-sm">
                <Type className="h-3.5 w-3.5" /> Escribir
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-2 text-xs font-semibold rounded-lg data-[state=active]:shadow-sm">
                <Upload className="h-3.5 w-3.5" /> Subir archivo
              </TabsTrigger>
            </TabsList>

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground self-end sm:self-auto"
                onClick={() => setIsEditing(false)}
              >
                Cancelar edición
              </Button>
            )}
          </div>

          {/* TAB 1: DRAW (Smooth, zero-scroll touch canvas) */}
          <TabsContent value="draw" className="space-y-4 mt-0 focus-visible:outline-none">
            {/* Toolbar: Color, Width, Fullscreen */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-muted/40 p-2.5 rounded-xl border border-border/40 text-xs">
              {/* Color selector */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tinta:</span>
                <div className="flex items-center gap-1.5">
                  {INK_COLORS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setSelectedColor(color.value)}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-all flex items-center justify-center",
                        selectedColor === color.value 
                          ? "border-primary scale-110 shadow-sm" 
                          : "border-transparent opacity-70 hover:opacity-100"
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    >
                      {selectedColor === color.value && <Check className="h-3 w-3 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stroke width selector */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Grosor:</span>
                <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/50">
                  {STROKE_WIDTHS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setSelectedWidth(w.value)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[11px] font-medium transition-all",
                        selectedWidth === w.value 
                          ? "bg-primary text-white shadow-xs" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expand / Fullscreen button for mobile/tablet */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-7 px-2.5 rounded-lg ml-auto border-border/60 hover:bg-muted"
                onClick={() => setIsFullscreenOpen(true)}
              >
                <Maximize2 className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Ampliar</span> Pantalla completa
              </Button>
            </div>

            {/* Canvas Surface with baseline guide */}
            <div 
              className={cn(
                "relative rounded-2xl border-2 border-dashed border-primary/30 bg-white transition-all overflow-hidden",
                "cursor-crosshair select-none touch-none", // touch-none is critical!
                "shadow-inner hover:border-primary/60"
              )}
              style={{
                touchAction: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: '180px',
                  display: 'block',
                  touchAction: 'none',
                }}
                className="touch-none select-none"
                onPointerDown={(e) => handlePointerDown(e, false)}
                onPointerMove={(e) => handlePointerMove(e, false)}
                onPointerUp={(e) => handlePointerUp(e, false)}
                onPointerCancel={(e) => handlePointerUp(e, false)}
              />

              {/* Baseline guide with 'X' and dotted line (Pure CSS, not drawn on canvas) */}
              <div className="absolute inset-x-8 bottom-10 pointer-events-none flex items-center gap-2 opacity-60">
                <span className="text-muted-foreground/60 font-bold text-sm select-none">✕</span>
                <div className="flex-1 border-b-2 border-dotted border-muted-foreground/30" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 select-none">
                  Firme sobre la línea
                </span>
              </div>

              {/* Empty state hint */}
              {strokes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-muted-foreground/40">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Smartphone className="h-4 w-4" />
                    <span>Dibuja tu firma con el dedo, lápiz táctil o mouse</span>
                  </div>
                  <p className="text-[10px] mt-0.5 opacity-70">
                    Área protegida contra desplazamiento involuntario
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1 sm:flex-initial"
                  disabled={strokes.length === 0}
                  onClick={handleUndo}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Deshacer trazo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1 sm:flex-initial text-muted-foreground hover:text-destructive"
                  disabled={strokes.length === 0}
                  onClick={handleClear}
                >
                  <Eraser className="h-3.5 w-3.5" /> Borrar todo
                </Button>
              </div>

              <Button
                type="button"
                variant="zen"
                size="sm"
                className="gap-2 text-xs font-semibold w-full sm:w-auto px-5"
                disabled={strokes.length === 0}
                onClick={handleConfirmDraw}
              >
                <CheckCircle2 className="h-4 w-4" /> Confirmar y Guardar Firma
              </Button>
            </div>
          </TabsContent>

          {/* TAB 2: TYPE (Calligraphic font generator) */}
          <TabsContent value="type" className="space-y-4 mt-0 focus-visible:outline-none">
            <div className="space-y-2">
              <Label htmlFor="sig-type-name" className="text-xs font-semibold">
                Nombre o texto de la firma:
              </Label>
              <div className="flex gap-2">
                <Input
                  id="sig-type-name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Ej. Dra. Sofía Mendoza"
                  className="text-sm h-10"
                />
                {/* Color picker for typed */}
                <div className="flex items-center gap-1 bg-muted/40 px-2 rounded-xl border border-border/50 shrink-0">
                  {INK_COLORS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setSelectedColor(color.value)}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-all flex items-center justify-center",
                        selectedColor === color.value 
                          ? "border-primary scale-110 shadow-sm" 
                          : "border-transparent opacity-70 hover:opacity-100"
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    >
                      {selectedColor === color.value && <Check className="h-3 w-3 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {SCRIPT_FONTS.map((font) => (
                <div
                  key={font.id}
                  onClick={() => setSelectedFont(font.id)}
                  className={cn(
                    "relative p-4 rounded-xl border-2 transition-all cursor-pointer bg-white group flex flex-col justify-between min-h-[120px]",
                    selectedFont === font.id
                      ? "border-primary shadow-soft bg-primary/5"
                      : "border-border/60 hover:border-primary/40 hover:bg-muted/10"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {font.name}
                    </span>
                    {selectedFont === font.id && (
                      <span className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>

                  <div className="py-2 text-center overflow-hidden">
                    <p 
                      style={{ 
                        fontFamily: font.fontFamily, 
                        color: selectedColor,
                        fontSize: '32px',
                        lineHeight: '1.2'
                      }}
                      className="truncate px-2 select-none"
                    >
                      {typedName.trim() || 'Tu Firma Profesional'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                    <span className="truncate">{font.description}</span>
                    <Button
                      type="button"
                      variant="zen"
                      size="sm"
                      className="h-6 text-[10px] px-2.5 ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFont(font.id);
                        handleConfirmTyped(font.fontFamily);
                      }}
                    >
                      Elegir esta
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TAB 3: UPLOAD IMAGE (Scanned signature or stamp) */}
          <TabsContent value="upload" className="space-y-4 mt-0 focus-visible:outline-none">
            <div className="border-2 border-dashed border-border/80 hover:border-primary/50 transition-colors rounded-2xl p-6 text-center bg-muted/20">
              <input
                type="file"
                id="sig-file-upload"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleFileUpload}
              />
              <label 
                htmlFor="sig-file-upload" 
                className="flex flex-col items-center justify-center cursor-pointer gap-2"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-1">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Selecciona una imagen de tu firma o rúbrica
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Formatos PNG, JPG o WEBP (máx. 2MB). Puedes tomarle una foto clara con tu celular a una hoja blanca firmada.
                </p>
                <Button type="button" variant="outline" size="sm" className="mt-2 pointer-events-none">
                  Explorar archivo
                </Button>
              </label>
            </div>

            <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border border-border/40 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">Eliminar fondo blanco automáticamente</p>
                  <p className="text-[11px] text-muted-foreground">
                    Convierte el papel en transparente para estampar la firma limpiamente en recetas y PDF.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoRemoveBg}
                onChange={(e) => setAutoRemoveBg(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            {uploadedPreview && (
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Vista previa de la firma cargada:
                </p>
                <div className="p-4 rounded-xl border border-border bg-white flex items-center justify-center">
                  <img 
                    src={uploadedPreview} 
                    alt="Vista previa firma" 
                    className="max-h-[120px] w-auto object-contain" 
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setUploadedPreview(null)}
                  >
                    Descartar
                  </Button>
                  <Button
                    type="button"
                    variant="zen"
                    size="sm"
                    className="gap-2"
                    onClick={handleConfirmUpload}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Usar esta firma
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* FULLSCREEN / MODAL CANVAS DIALOG (Ideal for tablets & smartphones) */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="max-w-4xl w-[95vw] p-4 sm:p-6 bg-card border-border rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <PenTool className="h-4 w-4 text-primary" />
              Lienzo Ampliado de Firma Digital
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Gira tu dispositivo si lo deseas para un trazo más amplio y cómodo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Modal Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-2.5 rounded-xl border border-border/40 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tinta:</span>
                <div className="flex items-center gap-1.5">
                  {INK_COLORS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setSelectedColor(color.value)}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-all flex items-center justify-center",
                        selectedColor === color.value 
                          ? "border-primary scale-110 shadow-sm" 
                          : "border-transparent opacity-70 hover:opacity-100"
                      )}
                      style={{ backgroundColor: color.value }}
                    >
                      {selectedColor === color.value && <Check className="h-3 w-3 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Grosor:</span>
                <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/50">
                  {STROKE_WIDTHS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setSelectedWidth(w.value)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[11px] font-medium transition-all",
                        selectedWidth === w.value 
                          ? "bg-primary text-white shadow-xs" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Canvas */}
            <div 
              className="relative rounded-2xl border-2 border-dashed border-primary/30 bg-white overflow-hidden shadow-inner touch-none select-none"
              style={{
                touchAction: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              <canvas
                ref={modalCanvasRef}
                style={{
                  width: '100%',
                  height: '320px',
                  display: 'block',
                  touchAction: 'none',
                }}
                className="touch-none select-none cursor-crosshair"
                onPointerDown={(e) => handlePointerDown(e, true)}
                onPointerMove={(e) => handlePointerMove(e, true)}
                onPointerUp={(e) => handlePointerUp(e, true)}
                onPointerCancel={(e) => handlePointerUp(e, true)}
              />

              <div className="absolute inset-x-12 bottom-12 pointer-events-none flex items-center gap-2 opacity-60">
                <span className="text-muted-foreground/60 font-bold text-base select-none">✕</span>
                <div className="flex-1 border-b-2 border-dotted border-muted-foreground/30" />
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground/50 select-none">
                  Firme sobre la línea
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={strokes.length === 0}
                  onClick={handleUndo}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Deshacer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                  disabled={strokes.length === 0}
                  onClick={handleClear}
                >
                  <Eraser className="h-3.5 w-3.5" /> Borrar
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullscreenOpen(false)}
                >
                  Cerrar
                </Button>
                <Button
                  type="button"
                  variant="zen"
                  size="sm"
                  className="gap-1.5 text-xs font-semibold"
                  disabled={strokes.length === 0}
                  onClick={handleConfirmDraw}
                >
                  <CheckCircle2 className="h-4 w-4" /> Aplicar firma
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
