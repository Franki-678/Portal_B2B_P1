'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import Link from 'next/link';

/**
 * Página de registro de nuevos talleres.
 * Llama a supabase.auth.signUp con metadata { name, role, workshop_name }.
 * El trigger handle_new_user() crea el perfil y el workshop automáticamente.
 */
export default function RegistroPage() {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');

  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const { registerTaller } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { getSupabaseClient } = await import('@/lib/supabase/client');
    const supabase = getSupabaseClient();

    try {
      // 1. SignUp con metadata (AuthContext.registerTaller ya lo hace, pero vamos a asegurar metadata aquí)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim(),
            role: 'taller',
            workshop_name: name.trim(),
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No se pudo crear el usuario.');

      const userId = authData.user.id;

      // 2. Esperar 1.5 segundos
      await new Promise(r => setTimeout(r, 1500));

      // 3. Verificar si el perfil tiene workshop_id
      const { data: profile, error: profError } = await (supabase as any)
        .from('profiles')
        .select('workshop_id')
        .eq('id', userId)
        .single();

      if (profError) throw profError;

      let finalWorkshopId = (profile as any)?.workshop_id;

      // 4. Si workshop_id es NULL, crear el workshop manualmente
      if (!finalWorkshopId) {
        console.warn('[Registro] El trigger no creó el workshop. Intentando creación manual...');
        const { data: wsData, error: wsError } = await (supabase as any)
          .from('workshops')
          .insert({
            name: name.trim(),
            contact_name: name.trim(),
            email: email.trim(),
          })
          .select('id')
          .single();

        if (wsError) throw wsError;
        finalWorkshopId = (wsData as any).id;

        // 5. Actualizar el perfil con el workshop_id
        const { error: updError } = await (supabase as any)
          .from('profiles')
          .update({ workshop_id: finalWorkshopId })
          .eq('id', userId);
        
        if (updError) throw updError;
      }

      // 6. Si todo salió bien, signOut y redirigir al login con mensaje exitoso
      await supabase.auth.signOut();
      
      // Usamos window.location para asegurar que se limpie cualquier estado y pasar el param
      window.location.href = '/login?registered=true';
      
    } catch (err: any) {
      console.error('[Registro] Error crítico:', err);
      // 6. Si falla, signOut y mostrar error
      await supabase.auth.signOut().catch(() => {});
      setError(err.message || 'Hubo un error al configurar tu taller. Por favor, contactá al administrador.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-600/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-sky-600/8 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo / Branding */}
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

        {/* Card */}
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-7 shadow-2xl relative">
          {/* Línea decorativa */}
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent rounded-t-3xl" />

          <div className="mb-6">
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Crear cuenta de taller</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Completá los datos para registrar tu taller
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Nombre del taller"
              id="reg-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Chapa y Pintura Sur"
              required
              autoFocus
            />

            <Input
              label="Email"
              id="reg-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="taller@email.com"
              required
              autoComplete="email"
            />

            <Input
              label="Contraseña"
              id="reg-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              autoComplete="new-password"
            />

            <Input
              label="Confirmar contraseña"
              id="reg-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
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

            <Button type="submit" fullWidth loading={loading} size="lg">
              {loading ? 'Creando cuenta...' : 'Registrar taller'}
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
              Los accesos de vendedor son creados por el administrador
              del sistema. Si necesitás uno, contactá a tu proveedor.
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
