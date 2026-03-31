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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center text-4xl shadow-inner shadow-orange-500/10">
              ⚙️
            </div>
            <div>
              <div className="text-2xl font-extrabold text-zinc-100 tracking-tight">Portal B2B</div>
              <div className="text-sm font-medium text-zinc-500 tracking-wide mt-1">SISTEMA AUTOMOTRIZ</div>
            </div>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-8 shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-rose-500 opacity-20 rounded-t-3xl" />
          <h2 className="text-lg font-bold text-zinc-100 mb-1 tracking-tight">Iniciar sesión</h2>
          <p className="text-sm font-medium text-zinc-500 mb-8">Ingresá tus credenciales de acceso</p>

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
              <div className="flex items-center gap-3 text-sm font-medium text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                <span>⚠️</span> {error}
              </div>
            )}

            <Button type="submit" fullWidth loading={loading} size="lg">
              {loading ? 'Verificando...' : 'Ingresar'}
            </Button>
          </form>

          {/* Quick access */}
          <div className="mt-8 pt-6 border-t border-zinc-800/80">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4 text-center">Modo Demo</p>
            <div className="space-y-3">
              {DEMO_USERS.map((u, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => fillDemo(idx)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800/80 hover:border-orange-500/30 hover:bg-zinc-800/50 transition-all duration-200 text-left group"
                >
                  <span className="text-sm font-semibold text-zinc-300 flex items-center gap-3 tracking-tight">
                    <span className="text-lg grayscale group-hover:grayscale-0 transition-opacity opacity-50 group-hover:opacity-100">{u.role === 'taller' ? '🏭' : '📦'}</span> 
                    {u.name}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${u.role === 'vendedor' ? 'bg-sky-500/10 text-sky-400' : 'bg-orange-500/10 text-orange-400'}`}>
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-sm font-medium text-zinc-600 mt-8">
          <Link href="/" className="hover:text-zinc-400 transition-colors">← Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}
