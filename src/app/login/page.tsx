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

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setSuccess('Cuenta creada exitosamente. Iniciá sesión.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const result = await withTimeout(login(email.trim(), password), FORM_TIMEOUT_MS);
      if (result.success && result.role) {
        const target =
          result.role === 'admin' ? '/admin'
            : result.role === 'vendedor' ? '/vendedor'
            : '/taller';
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
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-600/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-600/8 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center text-3xl shadow-inner shadow-orange-500/10 group-hover:border-orange-500/40 transition-colors">
              ⚙️
            </div>
            <div>
              <div className="text-2xl font-extrabold text-zinc-100 tracking-tight">Portal B2B</div>
              <div className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mt-0.5">
                Iniciar sesión
              </div>
            </div>
          </Link>
        </div>

        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-7 shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent rounded-t-3xl" />

          <div className="mb-6">
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Bienvenido</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Ingresá email y contraseña</p>
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

            {error && <ErrorBanner message={error} />}
            {success && <SuccessBanner message={success} />}

            <Button type="submit" fullWidth loading={loading} size="lg" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>

          <p className="text-xs text-zinc-600 text-center mt-5">
            ¿No tenés cuenta?{' '}
            <Link href="/registro" className="text-zinc-400 hover:text-zinc-200 font-semibold">
              Registrate como taller
            </Link>
          </p>
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3"
    >
      <span className="text-base shrink-0 mt-0.5">⚠️</span>
      <span>{message}</span>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3"
    >
      <span className="text-base shrink-0 mt-0.5">✅</span>
      <span>{message}</span>
    </div>
  );
}
