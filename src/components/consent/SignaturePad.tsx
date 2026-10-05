import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Point {
    x: number;
    y: number;
}

interface Stroke {
    points: Point[];
}

interface SignaturePadProps {
    onSign: (dataUrl: string) => void;
    onClear?: () => void;
    disabled?: boolean;
    height?: number;
    className?: string;
}

const SignaturePad = ({ onSign, onClear, disabled, height = 180, className }: SignaturePadProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const currentStroke = useRef<Point[]>([]);
    const isDrawing = useRef(false);

    // Auto-trim canvas to remove empty margins
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

        const dpr = Math.max(window.devicePixelRatio || 1, 2);
        const pad = Math.round(16 * dpr);
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(width, maxX + pad);
        maxY = Math.min(height, maxY + pad);

        const cropW = maxX - minX;
        const cropH = maxY - minY;

        const trimmed = document.createElement('canvas');
        trimmed.width = cropW;
        trimmed.height = cropH;
        const tCtx = trimmed.getContext('2d');
        if (!tCtx) return canvas.toDataURL('image/png');

        tCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        return trimmed.toDataURL('image/png');
    };

    // Redraw all strokes cleanly using Bezier curves and DPR
    const redrawCanvas = useCallback((canvas: HTMLCanvasElement | null, strokeList: Stroke[], preview?: Point[]) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.max(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr);

        const all = preview ? [...strokeList, { points: preview }] : strokeList;

        all.forEach((stroke) => {
            const pts = stroke.points;
            if (pts.length === 0) return;

            ctx.beginPath();
            ctx.strokeStyle = '#0f2b5c'; // Classic notarial navy
            ctx.lineWidth = 2.6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (pts.length === 1) {
                ctx.arc(pts[0].x, pts[0].y, 1.3, 0, Math.PI * 2);
                ctx.fillStyle = '#0f2b5c';
                ctx.fill();
                return;
            }

            ctx.moveTo(pts[0].x, pts[0].y);

            if (pts.length === 2) {
                ctx.lineTo(pts[1].x, pts[1].y);
            } else {
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

    useEffect(() => {
        redrawCanvas(canvasRef.current, strokes);
    }, [strokes, redrawCanvas]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current) redrawCanvas(canvasRef.current, strokes);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [strokes, redrawCanvas]);

    // STRICT TOUCH SCROLL PREVENTION (Non-passive listener)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const preventTouch = (e: TouchEvent) => {
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

    const getPoint = (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        e.preventDefault();
        e.stopPropagation();

        try {
            canvas.setPointerCapture(e.pointerId);
        } catch {}

        isDrawing.current = true;
        const pt = getPoint(e, canvas);
        currentStroke.current = [pt];
        redrawCanvas(canvas, strokes, [pt]);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current || disabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        e.preventDefault();
        e.stopPropagation();

        const pt = getPoint(e, canvas);
        currentStroke.current.push(pt);
        redrawCanvas(canvas, strokes, currentStroke.current);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current || disabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        e.preventDefault();
        e.stopPropagation();
        isDrawing.current = false;

        try {
            canvas.releasePointerCapture(e.pointerId);
        } catch {}

        if (currentStroke.current.length > 0) {
            const nextStrokes = [...strokes, { points: [...currentStroke.current] }];
            setStrokes(nextStrokes);
            currentStroke.current = [];

            // Auto-export trimmed signature
            setTimeout(() => {
                if (canvasRef.current) {
                    const trimmed = trimCanvas(canvasRef.current) || canvasRef.current.toDataURL('image/png');
                    onSign(trimmed);
                }
            }, 30);
        }
    };

    const handleUndo = () => {
        if (disabled) return;
        const next = strokes.slice(0, -1);
        setStrokes(next);
        if (next.length === 0) {
            onClear?.();
        } else {
            setTimeout(() => {
                if (canvasRef.current) {
                    const trimmed = trimCanvas(canvasRef.current) || canvasRef.current.toDataURL('image/png');
                    onSign(trimmed);
                }
            }, 30);
        }
    };

    const handleClear = () => {
        if (disabled) return;
        setStrokes([]);
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        onClear?.();
    };

    return (
        <div className={cn("space-y-3", className)}>
            <div 
                className={cn(
                    "relative rounded-xl border-2 border-dashed transition-colors overflow-hidden select-none touch-none",
                    disabled 
                        ? "opacity-60 bg-muted/30 border-border cursor-not-allowed" 
                        : "border-primary/30 bg-white hover:border-primary/60 cursor-crosshair shadow-inner"
                )}
                style={{ touchAction: 'none' }}
            >
                <canvas
                    ref={canvasRef}
                    style={{ 
                        width: '100%', 
                        height: `${height}px`, 
                        display: 'block', 
                        touchAction: 'none' 
                    }}
                    className="touch-none select-none"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                />

                {/* Baseline Guide */}
                <div className="absolute inset-x-8 bottom-8 pointer-events-none flex items-center gap-2 opacity-60">
                    <span className="text-muted-foreground/60 font-bold text-sm select-none">✕</span>
                    <div className="flex-1 border-b-2 border-dotted border-muted-foreground/30" />
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 select-none">
                        Firme sobre la línea
                    </span>
                </div>

                {strokes.length === 0 && !disabled && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                        <p className="text-xs text-muted-foreground/60 font-medium">
                            Dibuja tu firma aquí con el dedo, lápiz táctil o ratón
                        </p>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground/70">
                    {strokes.length > 0 ? 'Firma registrada con éxito' : 'Trazo protegido contra desplazamiento'}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8 text-xs rounded-lg border-border/60"
                        onClick={handleUndo}
                        disabled={disabled || strokes.length === 0}
                    >
                        <Undo2 className="h-3.5 w-3.5" />
                        Deshacer
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8 text-xs rounded-lg border-border/60 text-muted-foreground hover:text-destructive"
                        onClick={handleClear}
                        disabled={disabled || strokes.length === 0}
                    >
                        <Eraser className="h-3.5 w-3.5" />
                        Limpiar
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default SignaturePad;
