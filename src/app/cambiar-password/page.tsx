'use client';

/**
 * /cambiar-password — Fuerza al vendedor a cambiar su contraseña temporal
 * en el primer inicio de sesión. Sólo accesible si mustChangePassword === true.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';

export default function CambiarPasswordPage() {
  const { user, mustChangePassword, updatePassword, logout } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Si el usuario ya cambió la contraseña o no está en ese flujo, redirigir
  useEffect(() => {
    if (!user) return;
    if (!mustChangePassword) {
      const target = user.role === 'admin' ? '/admin' : user.role === 'vendedor' ? '/vendedor' : '/taller';
      router.replace(target);
    }
  }, [user, mustChangePassword, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
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
    setTimeout(() => {
      const target = user?.role === 'admin' ? '/admin' : user?.role === 'vendedor' ? '/vendedor' : '/taller';
      router.replace(target);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-orange-600/6 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] bg-amber-600/4 rounded-full blur-[140px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/25 to-orange-600/10 border border-amber-500/30 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/10 mx-auto">
            🔑
          </div>
          <div className="mt-3">
            <div className="text-xl font-extrabold text-zinc-100 tracking-tight">Cambio de contraseña requerido</div>
            <div className="text-xs font-medium text-amber-400/80 mt-1 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 inline-block">
              Primer inicio de sesión
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 backdrop-blur-2xl border border-zinc-800/60 rounded-3xl p-7 shadow-2xl shadow-black/40 relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent rounded-t-3xl" />

          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="text-5xl">✅</div>
              <h2 className="text-lg font-bold text-zinc-100">¡Contraseña actualizada!</h2>
              <p className="text-sm text-zinc-400">Redirigiendo a tu portal…</p>
            </div>
          ) : (
            <>
              <div className="mb-5 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <p className="text-xs font-medium text-amber-300 leading-relaxed">
                  👋 Hola <span className="font-bold">{user?.name ?? 'Vendedor'}</span>. Por seguridad, el administrador te asignó una contraseña temporal. Creá una contraseña propia antes de continuar.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <Input
                  label="Nueva contraseña"
                  id="cp-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  autoFocus
                  disabled={loading}
                  rightElement={
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPass(v => !v)}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded focus:outline-none"
                      aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPass ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  }
                />

                <Input
                  label="Confirmar contraseña"
                  id="cp-confirm"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />

                {/* Fortaleza */}
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${
                        password.length < 8 ? 'w-1/4 bg-red-500' :
                        password.length < 12 ? 'w-2/4 bg-amber-500' : 'w-full bg-emerald-500'
                      }`} />
                    </div>
                    <p className={`text-[11px] font-medium ${
                      password.length < 8 ? 'text-red-400' :
                      password.length < 12 ? 'text-amber-400' : 'text-emerald-400'
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
                  {loading ? 'Guardando...' : 'Guardar y continuar'}
                </Button>
              </form>

              <button
                type="button"
                onClick={() => void logout()}
                className="w-full mt-4 text-xs text-zinc-600 hover:text-zinc-400 transition-colors text-center"
              >
                Cerrar sesión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
