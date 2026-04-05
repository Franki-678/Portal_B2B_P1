'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/FormFields';
import Link from 'next/link';

const FORM_TIMEOUT_MS = 8_000;
const TIMEOUT_MSG = 'La operación tardó demasiado. Verificá tu conexión.';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('__FORM_TIMEOUT__')), ms)),
  ]);
}

export default function RegistroPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const { registerTaller } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('El nombre del taller es obligatorio.');
      return;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 8) {
      setError('El teléfono es obligatorio (solo números, mínimo 8 dígitos).');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const result = await withTimeout(
        registerTaller({
          email: email.trim(),
          password,
          name: name.trim(),
          phone: phoneDigits,
          address: address.trim() || undefined,
        }),
        FORM_TIMEOUT_MS
      );

      if (!result.success) {
        setError(result.error ?? 'No se pudo completar el registro.');
        setLoading(false);
        return;
      }

      setSuccess('Cuenta creada exitosamente. Iniciá sesión.');
      setTimeout(() => {
        router.push('/login?registered=true');
      }, 1200);
    } catch {
      setError(TIMEOUT_MSG);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-600/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-sky-600/8 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center text-3xl shadow-inner shadow-orange-500/10 group-hover:border-orange-500/40 transition-colors">
              🏭
            </div>
            <div>
              <div className="text-2xl font-extrabold text-zinc-100 tracking-tight">Portal B2B</div>
              <div className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mt-0.5">
                Registro de Taller
              </div>
            </div>
          </Link>
        </div>

        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-7 shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent rounded-t-3xl" />

          <div className="mb-6">
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Crear cuenta de taller</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Completá los datos para registrar tu taller</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate autoComplete="off">
            <Input
              label="Nombre del taller"
              id="reg-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Chapa y Pintura Sur"
              required
              autoFocus
              disabled={loading}
            />

            <Input
              label="Email"
              id="reg-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="taller@email.com"
              required
              disabled={loading}
            />

            <Input
              label="Teléfono"
              id="reg-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/[^\d+\s()-]/g, ''))}
              placeholder="Ej: 1123456789"
              required
              disabled={loading}
              hint="Solo números, mínimo 8 dígitos"
            />

            <Textarea
              label="Dirección (opcional)"
              id="reg-address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Calle, localidad..."
              rows={2}
              disabled={loading}
            />

            <Input
              label="Contraseña"
              id="reg-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              disabled={loading}
            />

            <Input
              label="Confirmar contraseña"
              id="reg-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />

            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3"
              >
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div
                role="status"
                className="flex items-start gap-3 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3"
              >
                <span className="shrink-0 mt-0.5">✅</span>
                <span>{success}</span>
              </div>
            )}

            <Button type="submit" fullWidth loading={loading} size="lg" disabled={loading}>
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </Button>
          </form>

          <p className="text-xs text-zinc-600 text-center mt-5 leading-relaxed">
            ¿Ya tenés cuenta?{' '}
            <Link href="/login" className="text-zinc-400 hover:text-zinc-200 font-semibold transition-colors">
              Iniciá sesión
            </Link>
          </p>

          <div className="mt-4 pt-4 border-t border-zinc-800/60">
            <p className="text-[11px] text-zinc-600 text-center leading-relaxed">
              Los accesos de vendedor son creados por el administrador del sistema.
            </p>
          </div>
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
