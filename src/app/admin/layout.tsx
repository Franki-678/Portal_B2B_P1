'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { Sidebar, LoadingSpinner } from '@/components/ui/Layout';

const adminNav = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/pedidos', label: 'Pedidos', icon: '📋' },
  { href: '/admin/clientes', label: 'Clientes', icon: '🏭' },
  { href: '/admin/vendedores', label: 'Vendedores', icon: '🧑‍💼' },
  { href: '/admin/metricas', label: 'Métricas', icon: '📈' },
  { href: '/admin/configuracion', label: 'Configuración', icon: '⚙️' },
  { href: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
  { href: '/vendedor', label: 'Vista Vendedor', icon: '📦' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { refreshData } = useDataStore();

  useEffect(() => {
    void refreshData({ silent: true });
  }, [pathname, refreshData]);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role !== 'admin') {
        router.replace(user.role === 'vendedor' ? '/vendedor' : '/taller');
      }
    }
  }, [user, isLoading, router]);

  if (!user) {
    if (isLoading) {
      return (
        <div className="h-screen overflow-hidden bg-slate-950 flex">
          <div className="hidden md:block w-64 shrink-0 border-r border-slate-800 bg-slate-900 p-4">
            <div className="h-8 w-40 rounded bg-zinc-800/80 animate-pulse mb-6" />
            <div className="space-y-3">
              <div className="h-9 rounded bg-zinc-800/70 animate-pulse" />
              <div className="h-9 rounded bg-zinc-800/70 animate-pulse" />
              <div className="h-9 rounded bg-zinc-800/70 animate-pulse" />
            </div>
          </div>
          <div className="flex-1 p-6">
            <div className="h-10 w-1/3 rounded bg-zinc-800/70 animate-pulse mb-6" />
            <div className="grid gap-4">
              <div className="h-28 rounded-2xl bg-zinc-800/60 animate-pulse" />
              <div className="h-28 rounded-2xl bg-zinc-800/60 animate-pulse" />
              <div className="h-28 rounded-2xl bg-zinc-800/60 animate-pulse" />
            </div>
            <div className="mt-4 text-zinc-500 text-xs flex items-center gap-2">
              <LoadingSpinner /> Cargando panel admin...
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  if (user.role !== 'admin') {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar navItems={adminNav} portalLabel="Panel Admin" portalIcon="🛠️" accentColor="purple" />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden md:pl-64">
        <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
