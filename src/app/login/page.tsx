'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import Link from 'next/link';

const FORM_TIMEOUT_MS = 8_000;
const TIMEOUT_MSG = 'La operación tardó demasiado. Verificá tu conexión.';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('__FORM_TIMEOUT__')), ms)),
  ]);
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
      <span className="text-base shrink-0 mt-0.5">⚠️</span>
      <span>{message}</span>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-start gap-3 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
      <span className="text-base shrink-0 mt-0.5">✅</span>
      <span>{message}</span>
    </div>
  );
}

// ─── Forgot password form ─────────────────────────────────────────────────

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Ingresá tu email.'); return; }
    setLoading(true); setError('');
    // Siempre disparamos el intento (Supabase no confirma si el mail existe — seguridad).
    await resetPassword(email.trim());
    setLoading(false);
    setSent(true);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Recuperar contraseña</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Ingresá tu email y te enviamos un enlace para crear una nueva contraseña.
        </p>
      </div>

      {sent ? (
        <div className="space-y-4">
          <SuccessBanner message="Si ese correo está registrado, recibirás un enlace para crear una nueva contraseña. Revisá también tu carpeta de spam." />
          <Button variant="ghost" fullWidth onClick={onBack}>
            ← Volver al login
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Email"
            id="forgot-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com"
            required
            autoFocus
            disabled={loading}
          />
          {error && <ErrorBanner message={error} />}
          <Button type="submit" fullWidth loading={loading} size="lg" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar enlace'}
          </Button>
          <button
            type="button"
            onClick={onBack}
            className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-center mt-1"
          >
            ← Volver al login
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Main login form ──────────────────────────────────────────────────────

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const { login, mustChangePassword } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setSuccess('Cuenta creada exitosamente. Iniciá sesión.');
    }
    if (searchParams.get('updated') === 'true') {
      setSuccess('Contraseña actualizada. Iniciá sesión con tu nueva contraseña.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      const result = await withTimeout(login(email.trim(), password), FORM_TIMEOUT_MS);
      if (result.success && result.role) {
        // Si el vendedor debe cambiar contraseña, redirigir primero
        if (mustChangePassword) {
          router.replace('/cambiar-password');
          return;
        }
        const target = result.role === 'admin' ? '/admin' : result.role === 'vendedor' ? '/vendedor' : '/taller';
        router.replace(target);
        return;
      }
      setError(result.error ?? 'Error al iniciar sesión.');
    } catch (err) {
      setError(err instanceof Error && err.message === '__FORM_TIMEOUT__' ? TIMEOUT_MSG : TIMEOUT_MSG);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-orange-600/6 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] bg-sky-600/6 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-orange-500/4 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 group">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/25 to-orange-600/10 border border-orange-500/30 flex items-center justify-center text-3xl shadow-lg shadow-orange-500/10 group-hover:border-orange-500/50 transition-all duration-300 group-hover:shadow-orange-500/20">
                ⚙️
              </div>
              <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-orange-500/20 to-transparent blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-zinc-100 tracking-tight">Portal B2B</div>
              <div className="text-[11px] font-bold text-zinc-500 tracking-[0.2em] uppercase mt-0.5">
                RC Repuestos
              </div>
            </div>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/60 backdrop-blur-2xl border border-zinc-800/60 rounded-3xl p-7 shadow-2xl shadow-black/40 relative">
          {/* Top glow line */}
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent rounded-t-3xl" />
          {/* Bottom subtle line */}
          <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-zinc-700/30 to-transparent rounded-b-3xl" />

          {showForgot ? (
            <ForgotPasswordForm onBack={() => setShowForgot(false)} />
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Bienvenido de nuevo</h1>
                <p className="text-sm text-zinc-500 mt-0.5">Ingresá con tu email y contraseña</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate autoComplete="off">
                <Input
                  label="Email"
                  id="login-email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoFocus
                  disabled={loading}
                />
                <div className="space-y-1.5">
                  <Input
                    label="Contraseña"
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowForgot(true)}
                      className="text-xs text-zinc-500 hover:text-orange-400 transition-colors font-medium"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                </div>

                {error && <ErrorBanner message={error} />}
                {success && <SuccessBanner message={success} />}

                <Button type="submit" fullWidth loading={loading} size="lg" disabled={loading} className="mt-2">
                  {loading ? 'Ingresando...' : 'Ingresar al portal'}
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-zinc-800/60">
                <p className="text-xs text-zinc-600 text-center">
                  ¿Sos un taller nuevo?{' '}
                  <Link href="/registro" className="text-orange-400 hover:text-orange-300 font-semibold transition-colors">
                    Crear cuenta de Taller →
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-sm font-medium text-zinc-600 mt-6">
          <Link href="/" className="hover:text-zinc-400 transition-colors">
            ← Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">
          Cargando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
