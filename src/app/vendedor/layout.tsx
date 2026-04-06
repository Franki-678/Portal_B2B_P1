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
      } else if (user.role !== 'vendedor') {
        router.replace('/taller');
      }
    }
  }, [user, isLoading, router]);

  if (!user) {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-[#0F1117] flex">
          <div className="hidden md:block w-64 border-r border-zinc-800 bg-zinc-900/40 p-4">
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

  if (user.role !== 'vendedor') {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar navItems={vendedorNav} portalLabel="Portal Vendedor" portalIcon="📦" accentColor="blue" />
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}
