'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { Sidebar, LoadingSpinner } from '@/components/ui/Layout';

const vendedorNav = [
  { href: '/vendedor', label: 'Dashboard', icon: '📊' },
  { href: '/vendedor/pedidos', label: 'Pedidos', icon: '📋' },
  { href: '/vendedor/clientes', label: 'Clientes', icon: '🏭' },
  { href: '/vendedor/configuracion', label: 'Configuración', icon: '⚙️' },
];

const adminExtraNav = [{ href: '/admin', label: 'Panel Admin', icon: '🛠️' }];

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
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
      } else if (user.role === 'taller') {
        router.replace('/taller');
      }
      // vendedor y admin pueden usar este layout (admin opera como vendedor).
    }
  }, [user, isLoading, router]);

  if (!user) {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-slate-950 flex">
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
              <LoadingSpinner /> Cargando portal...
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  if (user.role !== 'vendedor' && user.role !== 'admin') {
    return null;
  }

  const navItems = user.role === 'admin' ? [...vendedorNav, ...adminExtraNav] : vendedorNav;
  const portalLabel = user.role === 'admin' ? 'Vista Vendedor (Admin)' : 'Portal Vendedor';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Sidebar navItems={navItems} portalLabel={portalLabel} portalIcon="📦" accentColor="blue" />
      <div className="min-h-screen min-w-0 md:pl-64">
        <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
