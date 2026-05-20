'use client';

/**
 * /reset-password — Supabase redirige aquí tras el link de recuperación de contraseña.
 * La URL llega con #access_token=... y type=recovery en el hash.
 * Supabase JS detecta automáticamente el evento PASSWORD_RECOVERY via onAuthStateChange.
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import Link from 'next/link';

function ResetPasswordForm() {
  const { updatePassword } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'No se pudo actualizar la contraseña.');
      return;
    }
    setDone(true);
    setTimeout(() => router.replace('/login?updated=true'), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-orange-600/6 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] bg-sky-600/6 rounded-full blur-[140px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 group">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/25 to-orange-600/10 border border-orange-500/30 flex items-center justify-center text-3xl shadow-lg shadow-orange-500/10 group-hover:border-orange-500/50 transition-all">
              🔐
            </div>
            <div>
              <div className="text-2xl font-extrabold text-zinc-100 tracking-tight">Portal B2B</div>
              <div className="text-[11px] font-bold text-zinc-500 tracking-[0.2em] uppercase mt-0.5">RC Repuestos</div>
            </div>
          </Link>
        </div>

        <div className="bg-zinc-900/60 backdrop-blur-2xl border border-zinc-800/60 rounded-3xl p-7 shadow-2xl shadow-black/40 relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent rounded-t-3xl" />

          {done ? (
            <div className="text-center space-y-4">
              <div className="text-5xl mb-2">✅</div>
              <h2 className="text-lg font-bold text-zinc-100">¡Contraseña actualizada!</h2>
              <p className="text-sm text-zinc-400">Redirigiendo al login…</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Nueva contraseña</h1>
                <p className="text-sm text-zinc-500 mt-0.5">Elegí una contraseña segura para tu cuenta.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="relative">
                  <Input
                    label="Nueva contraseña"
                    id="new-password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    autoFocus
                    disabled={loading}
                    hint="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-[34px] text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
                  >
                    {showPass ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <Input
                  label="Confirmar contraseña"
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />

                {/* Indicador de fortaleza */}
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          password.length < 8 ? 'w-1/4 bg-red-500' :
                          password.length < 12 ? 'w-2/4 bg-amber-500' :
                          'w-full bg-emerald-500'
                        }`}
                      />
                    </div>
                    <p className={`text-[11px] font-medium ${
                      password.length < 8 ? 'text-red-400' :
                      password.length < 12 ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>
                      {password.length < 8 ? 'Muy corta' : password.length < 12 ? 'Aceptable' : 'Contraseña fuerte'}
                    </p>
                  </div>
                )}

                {error && (
                  <div role="alert" className="flex items-start gap-3 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                    <span className="shrink-0">⚠️</span><span>{error}</span>
                  </div>
                )}

                <Button type="submit" fullWidth loading={loading} size="lg" disabled={loading}>
                  {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">Cargando…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
