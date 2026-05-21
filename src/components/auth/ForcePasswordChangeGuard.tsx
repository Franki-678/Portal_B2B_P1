'use client';

/**
 * ForcePasswordChangeGuard
 *
 * Componente de efecto puro (no renderiza UI). Se monta dentro de AuthProvider
 * y redirige a /cambiar-password cuando el usuario autenticado tiene
 * must_change_password === true, sin importar cómo llegó a la ruta actual
 * (login directo, F5, enlace externo, etc.).
 *
 * Rutas exentas: las páginas que no requieren sesión activa o que forman parte
 * del propio flujo de cambio.
 */

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const EXEMPT_PATHS = [
  '/',
  '/login',
  '/registro',
  '/cambiar-password',
  '/reset-password',
];

export function ForcePasswordChangeGuard() {
  const { user, mustChangePassword, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (EXEMPT_PATHS.includes(pathname)) return;
    if (mustChangePassword) {
      router.replace('/cambiar-password');
    }
  }, [user, mustChangePassword, isLoading, pathname, router]);

  return null;
}
