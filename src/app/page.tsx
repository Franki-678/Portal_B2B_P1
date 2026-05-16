'use client';

/**
 * src/app/page.tsx — Router de entrada del CRM
 *
 * No muestra UI propia. Redirige al portal correspondiente
 * según el rol del usuario autenticado, o al login si no hay sesión.
 *
 * Rutas destino:
 *   taller   → /taller
 *   vendedor → /vendedor
 *   admin    → /admin
 *   sin sesión → /login
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function RootRedirect() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    const target =
      user.role === 'taller' ? '/taller'
        : user.role === 'admin' ? '/admin'
        : '/vendedor';

    router.replace(target);
  }, [user, isLoading, router]);

  // Spinner mientras el contexto de auth se inicializa
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );
}
