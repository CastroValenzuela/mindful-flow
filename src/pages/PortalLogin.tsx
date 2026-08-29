import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Loader2, 
  ShieldCheck, 
  MessageSquare, 
  Mail, 
  ArrowRight, 
  RotateCcw, 
  Lock, 
  CheckCircle2, 
  ArrowLeft,
  Sparkles,
  KeyRound
} from 'lucide-react';

export default function PortalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const magicToken = searchParams.get('token') || searchParams.get('magic_token');

  // Channel Selection: 'whatsapp' | 'email'
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  
  // Step: 1 = Enter Contact, 2 = Enter 6-digit OTP
  const [step, setStep] = useState<1 | 2>(1);

  // Form Fields
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingMagicLink, setIsVerifyingMagicLink] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [sentTarget, setSentTarget] = useState('');

  // ── 1. AUTOMATIC MAGIC LINK VERIFICATION (1-CLIC FROM EMAIL) ───────────────
  useEffect(() => {
    if (!magicToken) return;

    const verifyToken = async () => {
      setIsVerifyingMagicLink(true);
      try {
        const { data, error } = await supabase.rpc('verify_portal_code', {
          p_magic_token: magicToken
        });

        if (error) throw error;
        if (!data || !data.success || !data.session) {
          throw new Error(data?.error || 'El enlace de acceso es inválido o ha expirado.');
        }

        // Save session
        localStorage.setItem('saudade_patient_session', JSON.stringify({
          isLoggedIn: true,
          accessToken: data.session.accessToken,
          email: data.session.email,
          phone: data.session.phone,
          name: data.session.name,
          expiresAt: data.session.expiresAt
        }));

        toast.success(`¡Bienvenido de vuelta, ${data.session.name.split(' ')[0]}!`);
        navigate('/portal');
      } catch (err: unknown) {
        const error = err as Error;
        console.error('Magic link verification error:', error);
        toast.error(error.message || 'El enlace ha caducado. Solicita un nuevo acceso.');
      } finally {
        setIsVerifyingMagicLink(false);
      }
    };

    verifyToken();
  }, [magicToken, navigate]);

  // ── 2. RESEND COOLDOWN TIMER ────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ── 3. REQUEST ACCESS CODE (STEP 1) ─────────────────────────────────────────
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const identifier = channel === 'whatsapp' ? phone : email;

    if (!identifier.trim()) {
      toast.error(channel === 'whatsapp' 
        ? 'Por favor ingresa tu número de teléfono a 10 dígitos.' 
        : 'Por favor ingresa tu correo electrónico registrado.'
      );
      return;
    }

    if (channel === 'whatsapp' && identifier.replace(/\D/g, '').length < 10) {
      toast.error('El número telefónico debe contener al menos 10 dígitos.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('request_portal_access', {
        p_identifier: identifier,
        p_channel: channel
      });

      if (error) throw error;
      if (!data || !data.success) {
        throw new Error(data?.error || 'No se pudo generar el código.');
      }

      setSentTarget(identifier);

      // Dispatch notifications via Edge Functions in background if patient exists
      if (data.dispatched && data.code) {
        if (channel === 'email' && data.target_email) {
          // Send via send-magic-link edge function
          supabase.functions.invoke('send-magic-link', {
            body: {
              email: data.target_email,
              type: 'patient_portal',
              code: data.code,
              magicToken: data.magic_token,
              patientName: data.patient_name
            }
          }).catch(err => console.warn('Email dispatch warning:', err));
        } else if (channel === 'whatsapp' && data.target_phone) {
          // Send via meta-whatsapp edge function
          const cleanPhone = data.target_phone.replace(/\D/g, '');
          const firstName = data.patient_name ? data.patient_name.split(' ')[0] : 'Paciente';
          const wpBody = `¡Hola, ${firstName}! ✨ Tu código de acceso confidencial al Portal Saudade es: *${data.code}*. Es válido por 10 minutos. 🔒`;

          supabase.functions.invoke('meta-whatsapp', {
            body: {
              action: 'send',
              phone: cleanPhone,
              body: wpBody
            }
          }).catch(err => console.warn('WhatsApp dispatch warning:', err));
        }
      }

      setStep(2);
      setResendCooldown(60); // 60s cooldown
      toast.success(channel === 'whatsapp'
        ? '¡Código enviado por WhatsApp! Revisa tus mensajes.'
        : '¡Código y enlace enviados a tu correo electrónico!'
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error requesting portal access:', error);
      toast.error(error.message || 'Ocurrió un error al enviar el código.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── 4. HANDLE OTP CODE INPUT & AUTO-SUBMIT (STEP 2) ──────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    // If pasting a full 6-digit code
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (i < 6) newOtp[i] = d;
      });
      setOtp(newOtp);
      
      const nextFocus = Math.min(digits.length, 5);
      otpInputRefs.current[nextFocus]?.focus();

      if (digits.length === 6) {
        verifyOtpCode(newOtp.join(''));
      }
      return;
    }

    // Single digit input
    const cleanDigit = value.replace(/\D/g, '');
    const newOtp = [...otp];
    newOtp[index] = cleanDigit;
    setOtp(newOtp);

    // Auto focus next input
    if (cleanDigit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto verify when all 6 digits entered
    const completeCode = newOtp.join('');
    if (completeCode.length === 6 && !newOtp.includes('')) {
      verifyOtpCode(completeCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const verifyOtpCode = async (codeToVerify: string) => {
    if (codeToVerify.length !== 6) {
      toast.error('Por favor ingresa los 6 dígitos completos.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('verify_portal_code', {
        p_identifier: sentTarget,
        p_code: codeToVerify
      });

      if (error) throw error;
      if (!data || !data.success || !data.session) {
        throw new Error(data?.error || 'Código incorrecto o expirado.');
      }

      // Save valid session in storage
      localStorage.setItem('saudade_patient_session', JSON.stringify({
        isLoggedIn: true,
        accessToken: data.session.accessToken,
        email: data.session.email,
        phone: data.session.phone,
        name: data.session.name,
        expiresAt: data.session.expiresAt
      }));

      toast.success(`¡Bienvenido al Portal, ${data.session.name.split(' ')[0]}!`);
      navigate('/portal');
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error verifying OTP:', error);
      toast.error(error.message || 'Código incorrecto. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── 5. RENDER MAGIC LINK VERIFICATION LOADER ────────────────────────────────
  if (isVerifyingMagicLink) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFCFB] p-4 font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary animate-pulse">
            <KeyRound className="h-6 w-6" />
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-primary mt-2" />
          <h3 className="font-bold text-base text-foreground">Verificando tu enlace seguro...</h3>
          <p className="text-xs text-muted-foreground">Iniciando sesión en tu portal de paciente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-muted/30 via-background to-muted/20 p-4 font-sans relative overflow-hidden">
      {/* Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <Card className="w-full max-w-md shadow-2xl border-border/70 rounded-3xl bg-card/95 backdrop-blur-xl relative z-10 overflow-hidden">
        {/* Header */}
        <CardHeader className="text-center space-y-3 pt-8 pb-4">
          <div className="mx-auto w-14 h-14 bg-gradient-to-tr from-primary to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-white font-black text-xl tracking-tighter">S.</span>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-black tracking-tight text-foreground">
              Portal del Paciente
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Accede a tus citas, ejercicios terapéuticos y expedientes confidenciales con total seguridad.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="px-6 md:px-8 pb-6">
          {/* STEP 1: CHOOSE CHANNEL & ENTER CONTACT */}
          {step === 1 ? (
            <form onSubmit={handleRequestCode} className="space-y-5">
              {/* Channel Selector Tabs */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block text-center">
                  ¿Cómo deseas recibir tu código de acceso?
                </Label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-2xl border border-border/50">
                  <button
                    type="button"
                    onClick={() => setChannel('whatsapp')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      channel === 'whatsapp'
                        ? 'bg-white text-emerald-700 shadow-xs border border-border/30'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MessageSquare className="h-4 w-4 text-emerald-600" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannel('email')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      channel === 'email'
                        ? 'bg-white text-primary shadow-xs border border-border/30'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Mail className="h-4 w-4 text-primary" />
                    <span>Correo</span>
                  </button>
                </div>
              </div>

              {/* Input Field based on channel */}
              {channel === 'whatsapp' ? (
                <div className="space-y-2 animate-fade-in">
                  <Label htmlFor="phone" className="text-xs font-bold text-foreground">
                    Número de Celular / WhatsApp
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                      🇲🇽 +52
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="10 dígitos (ej. 55 1234 5678)"
                      className="h-11 pl-16 rounded-xl bg-background border-border/70 focus-visible:ring-primary/20 text-sm font-medium"
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Te enviaremos un código de 6 dígitos por WhatsApp para entrar de inmediato.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 animate-fade-in">
                  <Label htmlFor="email" className="text-xs font-bold text-foreground">
                    Correo Electrónico Registrado
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="h-11 pl-10 rounded-xl bg-background border-border/70 focus-visible:ring-primary/20 text-sm font-medium"
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Te enviaremos un enlace de 1 clic y un código de acceso a tu buzón.
                  </p>
                </div>
              )}

              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-11 font-bold text-xs rounded-xl shadow-md bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/95 hover:to-emerald-700 text-white transition-all gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enviando código...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar Código de Acceso</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            /* STEP 2: ENTER 6-DIGIT OTP CODE */
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-1">
                <Badge variant="outline" className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200">
                  {channel === 'whatsapp' ? '📱 Código enviado por WhatsApp' : '✉️ Código enviado por Correo'}
                </Badge>
                <p className="text-xs text-muted-foreground pt-1">
                  Ingresa los 6 dígitos enviados a <strong className="text-foreground">{sentTarget}</strong>:
                </p>
              </div>

              {/* 6 Digit Input Boxes */}
              <div className="flex justify-center gap-2 md:gap-2.5">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (otpInputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={idx === 0 ? 6 : 1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-11 h-13 md:w-12 md:h-14 text-center text-xl font-black rounded-xl border-2 border-border/80 bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  onClick={() => verifyOtpCode(otp.join(''))}
                  disabled={isLoading || otp.join('').length !== 6}
                  className="w-full h-11 font-bold text-xs rounded-xl shadow-md bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/95 hover:to-emerald-700 text-white transition-all gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verificando código...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Verificar e Ingresar</span>
                    </>
                  )}
                </Button>

                {/* Resend & Switch Channel */}
                <div className="flex items-center justify-between text-xs pt-2">
                  <button
                    type="button"
                    onClick={() => { setStep(1); setOtp(['', '', '', '', '', '']); }}
                    className="text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Cambiar número / correo</span>
                  </button>

                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isLoading}
                    onClick={handleRequestCode}
                    className={`font-bold flex items-center gap-1 transition-colors ${
                      resendCooldown > 0 
                        ? 'text-muted-foreground/60 cursor-not-allowed' 
                        : 'text-primary hover:underline'
                    }`}
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="bg-muted/10 border-t border-border/40 py-3.5 px-6 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>Acceso cifrado de extremo a extremo · NOM-024-SSA3</span>
        </CardFooter>
      </Card>
    </div>
  );
}
