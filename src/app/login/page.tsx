'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import Link from 'next/link';

type Tab = 'login' | 'registro';

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Registro state
  const [regName, setRegName]               = useState('');
  const [regEmail, setRegEmail]             = useState('');
  const [regPassword, setRegPassword]       = useState('');
  const [regConfirm, setRegConfirm]         = useState('');

  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, registerTaller } = useAuth();
  const router = useRouter();

  const switchTab = (t: Tab) => {
    setTab(t);
    setError('');
    setSuccess('');
  };

  // ──────────────────────────────────────────────────────────
  // Submit login
  // ──────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email.trim(), password);

    if (result.success) {
      router.replace(result.role === 'vendedor' ? '/vendedor' : '/taller');
    } else {
      setError(result.error ?? 'Error al iniciar sesión.');
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Submit registro
  // ──────────────────────────────────────────────────────────
  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!regName.trim()) {
      setError('El nombre del taller es obligatorio.');
      return;
    }
    if (regPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    const result = await registerTaller({
      email: regEmail.trim(),
      password: regPassword,
      name: regName.trim(),
    });

    if (result.success) {
      // Redirigir directamente al dashboard del taller
      router.replace('/taller');
    } else {
      setError(result.error ?? 'Error al registrar el taller.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-600/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-600/8 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center text-3xl shadow-inner shadow-orange-500/10 group-hover:border-orange-500/40 transition-colors">
              ⚙️
            </div>
            <div>
              <div className="text-2xl font-extrabold text-zinc-100 tracking-tight">Portal B2B</div>
              <div className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mt-0.5">
                Sistema Automotriz
              </div>
            </div>
          </Link>
        </div>

        {/* Card principal */}
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-7 shadow-2xl relative">
          {/* Línea decorativa superior */}
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent rounded-t-3xl" />

          {/* Tabs */}
          <div className="flex bg-zinc-950/60 rounded-xl p-1 mb-6 border border-zinc-800/60">
            <button
              type="button"
              onClick={() => switchTab('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                tab === 'login'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => switchTab('registro')}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                tab === 'registro'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Nuevo taller
            </button>
          </div>

          {/* ── LOGIN ── */}
          {tab === 'login' && (
            <>
              <div className="mb-6">
                <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Bienvenido</h1>
                <p className="text-sm text-zinc-500 mt-0.5">Ingresá tus credenciales para acceder</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <Input
                  label="Email"
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
                <Input
                  label="Contraseña"
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />

                {error && <ErrorBanner message={error} />}

                <Button type="submit" fullWidth loading={loading} size="lg">
                  {loading ? 'Verificando...' : 'Ingresar'}
                </Button>
              </form>
            </>
          )}

          {/* ── REGISTRO ── */}
          {tab === 'registro' && (
            <>
              <div className="mb-6">
                <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Registrar taller</h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Completá los datos para crear tu cuenta
                </p>
              </div>

              <form onSubmit={handleRegistro} className="space-y-4" noValidate>
                <Input
                  label="Nombre del taller"
                  id="reg-name"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  placeholder="Ej: Chapa y Pintura Sur"
                  required
                  autoFocus
                />
                <Input
                  label="Email"
                  id="reg-email"
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="taller@email.com"
                  required
                  autoComplete="email"
                />
                <Input
                  label="Contraseña"
                  id="reg-password"
                  type="password"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  autoComplete="new-password"
                />
                <Input
                  label="Confirmar contraseña"
                  id="reg-confirm"
                  type="password"
                  value={regConfirm}
                  onChange={e => setRegConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />

                {error && <ErrorBanner message={error} />}
                {success && <SuccessBanner message={success} />}

                <Button type="submit" fullWidth loading={loading} size="lg">
                  {loading ? 'Registrando...' : 'Crear cuenta'}
                </Button>
              </form>

              <p className="text-xs text-zinc-600 text-center mt-4 leading-relaxed">
                Al registrarte, tu taller quedará activo de inmediato.
                <br />
                Los vendedores son creados por el administrador.
              </p>
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

// ────────────────────────────────────────────────────────────
// Sub-componentes internos
// ────────────────────────────────────────────────────────────

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
