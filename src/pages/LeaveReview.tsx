import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Star, ShieldCheck, UserCheck, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface RequestInfo {
  valid: boolean;
  error?: string;
  patient_name?: string;
  patient_full_name?: string;
  therapist_name?: string;
  therapist_avatar?: string | null;
}

export default function LeaveReview() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  
  // Identity preference: 'custom' (name or alias chosen by patient) or 'anonymous' (100% anonymous)
  const [identityMode, setIdentityMode] = useState<'custom' | 'anonymous'>('custom');
  const [displayName, setDisplayName] = useState('');
  
  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Enlace inválido. No se encontró el token de seguridad.');
      setLoadingInfo(false);
      return;
    }

    const loadRequestInfo = async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc('get_review_request_info', { p_token: token });
        if (rpcErr) throw rpcErr;

        if (!data?.valid) {
          setError(data?.error || 'El enlace de feedback ha expirado o ya fue utilizado.');
        } else {
          setRequestInfo(data);
          // Sugerir nombre inicial amigable (primer nombre o nombre completo)
          const suggested = data.patient_name || data.patient_full_name || '';
          setDisplayName(suggested);
        }
      } catch (err: any) {
        console.error('Error al verificar token:', err);
        setError('No se pudo verificar el enlace de feedback. Es posible que haya expirado.');
      } finally {
        setLoadingInfo(false);
      }
    };

    loadRequestInfo();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) return;
    if (rating === 0) {
      toast.error('Por favor selecciona una calificación de 1 a 5 estrellas.');
      return;
    }

    const isAnon = identityMode === 'anonymous';
    const finalDisplayName = isAnon ? null : displayName.trim();

    if (!isAnon && !finalDisplayName) {
      toast.error('Por favor escribe el nombre que te gustaría mostrar o selecciona la opción "100% Anónimo".');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('submit_review', {
        p_token: token,
        p_rating: rating,
        p_comment: comment.trim() || null,
        p_anonymous: isAnon,
        p_display_name: finalDisplayName,
      });

      if (rpcError) {
        throw rpcError;
      }

      setIsSuccess(true);
      toast.success('¡Muchas gracias por tu retroalimentación!');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocurrió un error al enviar tu reseña. Es posible que el enlace haya expirado o ya se haya utilizado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-slate-500 font-medium">Verificando tu enlace de sesión...</p>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-400">
          <div className="h-2.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-primary" />
          <CardHeader className="text-center pt-8 pb-4">
            <div className="mx-auto w-18 h-18 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-4 shadow-inner ring-8 ring-emerald-50 dark:ring-emerald-900/20">
              <Sparkles className="w-9 h-9" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              ¡Gracias por tu opinión!
            </CardTitle>
            <CardDescription className="text-sm mt-2 text-slate-600 dark:text-slate-400 leading-relaxed px-4">
              Tu experiencia compartida es sumamente valiosa para{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {requestInfo?.therapist_name || 'tu especialista'}
              </strong>{' '}
              y ayuda a más personas en su camino de bienestar.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pb-8 pt-2">
            <div className="p-4 bg-muted/40 rounded-2xl border text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Reseña registrada {identityMode === 'anonymous' ? 'de forma 100% Anónima' : `con el nombre: "${displayName.trim()}"`}
              </p>
              <p>Ya puedes cerrar esta ventana con total tranquilidad.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col items-center py-10 px-4 sm:px-6">
      <div className="w-full max-w-lg space-y-6">
        
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            Feedback Clínico Confidencial
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            ¿Cómo ha sido tu experiencia?
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {requestInfo?.patient_name ? `Hola ${requestInfo.patient_name}, tu ` : 'Tu '}
            opinión sobre tus sesiones con{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              Psic. {requestInfo?.therapist_name || 'tu especialista'}
            </strong>{' '}
            nos ayuda a ofrecerte siempre el mejor acompañamiento.
          </p>
        </div>

        <Card className="shadow-xl border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
          <div className="h-2 bg-gradient-to-r from-primary via-violet-500 to-indigo-500" />
          
          <CardContent className="p-6 sm:p-8 space-y-7">
            {error && (
              <div className="p-4 bg-destructive/10 text-destructive rounded-2xl text-sm font-medium border border-destructive/20 animate-in fade-in">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-7">
              {/* Star Rating */}
              <div className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-muted/20 border border-border/50">
                <Label className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Calificación General *
                </Label>
                
                <div className="flex gap-2" onMouseLeave={() => setHoverRating(0)}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      disabled={isSubmitting || !token}
                      className={`p-1.5 transition-all duration-150 transform hover:scale-115 focus:outline-none ${
                        (hoverRating || rating) >= star
                          ? 'text-amber-400 scale-105'
                          : 'text-slate-200 dark:text-slate-700'
                      }`}
                      onMouseEnter={() => setHoverRating(star)}
                      onClick={() => setRating(star)}
                    >
                      <Star
                        className={`w-9 h-9 transition-colors ${(hoverRating || rating) >= star ? 'fill-current' : ''}`}
                        strokeWidth={1.5}
                      />
                    </button>
                  ))}
                </div>

                <div className="h-6 flex items-center justify-center">
                  {rating > 0 ? (
                    <span className="text-xs font-bold uppercase tracking-wider px-3 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-in fade-in">
                      {rating === 1 && '⭐ Pobre'}
                      {rating === 2 && '⭐⭐ Regular'}
                      {rating === 3 && '⭐⭐⭐ Buena'}
                      {rating === 4 && '⭐⭐⭐⭐ Muy Buena'}
                      {rating === 5 && '⭐⭐⭐⭐⭐ Excelente'}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Toca una estrella para calificar</span>
                  )}
                </div>
              </div>

              {/* Comment Field */}
              <div className="space-y-2">
                <Label htmlFor="comment" className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Comentario o Testimonio <span className="text-xs text-muted-foreground font-normal">(Opcional)</span>
                </Label>
                <Textarea
                  id="comment"
                  placeholder="¿Cómo te has sentido en el proceso? ¿Qué herramientas o aspectos de las sesiones te han ayudado más?"
                  className="min-h-[110px] rounded-2xl resize-none border-border/70 focus:ring-primary/20 text-sm p-3.5"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={isSubmitting || !token}
                />
              </div>

              {/* Privacy / Identity Selector */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    ¿Cómo deseas que aparezca tu reseña?
                  </Label>
                  <span className="text-[11px] text-muted-foreground font-medium">Tú eliges tu privacidad</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option: Custom name */}
                  <button
                    type="button"
                    onClick={() => setIdentityMode('custom')}
                    className={`flex flex-col text-left p-3.5 rounded-2xl border-2 transition-all ${
                      identityMode === 'custom'
                        ? 'border-primary bg-primary/5 shadow-xs'
                        : 'border-border/60 bg-card hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white mb-1">
                      <UserCheck className={`w-4 h-4 ${identityMode === 'custom' ? 'text-primary' : 'text-muted-foreground'}`} />
                      Con mi nombre o alias
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Usa tu nombre, iniciales o el seudónimo que tú decidas.
                    </p>
                  </button>

                  {/* Option: 100% Anonymous */}
                  <button
                    type="button"
                    onClick={() => setIdentityMode('anonymous')}
                    className={`flex flex-col text-left p-3.5 rounded-2xl border-2 transition-all ${
                      identityMode === 'anonymous'
                        ? 'border-primary bg-primary/5 shadow-xs'
                        : 'border-border/60 bg-card hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white mb-1">
                      <EyeOff className={`w-4 h-4 ${identityMode === 'anonymous' ? 'text-primary' : 'text-muted-foreground'}`} />
                      100% Anónimo
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Se mostrará como "Paciente Verificado" sin datos personales.
                    </p>
                  </button>
                </div>

                {/* Input for custom name when selected */}
                {identityMode === 'custom' && (
                  <div className="pt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <Label htmlFor="custom_name" className="text-xs font-semibold text-muted-foreground">
                      Nombre o seudónimo a mostrar:
                    </Label>
                    <Input
                      id="custom_name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ej. Ana G., Carlos M., o el nombre que prefieras"
                      maxLength={50}
                      className="rounded-xl h-11 border-border/70 focus:ring-primary/20"
                      disabled={isSubmitting || !token}
                    />
                  </div>
                )}

                {/* Live Preview Badge */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Vista previa pública:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    {identityMode === 'anonymous' ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                        Paciente Verificado
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-primary" />
                        {displayName.trim() || 'Paciente'}
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                variant="default"
                className="w-full h-12 rounded-xl text-base font-bold shadow-md shadow-primary/20 gap-2" 
                disabled={isSubmitting || !token || rating === 0}
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                ) : (
                  'Enviar mi Reseña'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security Note */}
        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Enlace exclusivo de un solo uso emitido por MindfulFlow / Saudade.
        </p>

      </div>
    </div>
  );
}
