'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import { DEMO_USERS } from '@/lib/constants';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      // Redirect based on role (will auto-redirect via layout)
      const user = DEMO_USERS.find(u => u.email === email.toLowerCase());
      router.replace(user?.role === 'vendedor' ? '/vendedor' : '/taller');
    } else {
      setError(result.error || 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  const fillDemo = (userIdx: number) => {
    setEmail(DEMO_USERS[userIdx].email);
    setPassword(DEMO_USERS[userIdx].password);
    setError('');
  };

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-orange-600/6 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-600/6 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-3xl">
              🔧
            </div>
            <div>
              <div className="text-xl font-bold text-white">Portal B2B</div>
              <div className="text-xs text-slate-500">Autopartes · Chapa & Pintura</div>
            </div>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-base font-semibold text-white mb-1">Iniciar sesión</h2>
          <p className="text-xs text-slate-500 mb-6">Ingresá tus credenciales para acceder al portal</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoComplete="email"
            />

            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                <span>⚠️</span> {error}
              </div>
            )}

            <Button type="submit" fullWidth loading={loading} size="lg">
              {loading ? 'Verificando...' : 'Ingresar'}
            </Button>
          </form>

          {/* Quick access */}
          <div className="mt-6 pt-5 border-t border-white/8">
            <p className="text-xs text-slate-500 mb-3 text-center">Acceso rápido demo:</p>
            <div className="space-y-2">
              {DEMO_USERS.map((u, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => fillDemo(idx)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#0f1117] border border-white/5 hover:border-orange-500/25 hover:bg-white/3 transition-all text-left group"
                >
                  <span className="text-xs text-slate-300">
                    {u.role === 'taller' ? '🏭' : '📦'} {u.name}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'vendedor' ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400'}`}>
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          <Link href="/" className="hover:text-slate-400 transition-colors">← Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}
