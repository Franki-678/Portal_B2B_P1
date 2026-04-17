'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { Sidebar } from '@/components/ui/Layout';
import { LoadingSpinner } from '@/components/ui/Layout';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { buildWhatsAppUrl } from '@/lib/utils';

const tallerNav = [
  { href: '/taller', label: 'Dashboard', icon: '📊' },
  { href: '/taller/pedidos', label: 'Mis pedidos', icon: '📋' },
  { href: '/taller/pedidos/nuevo', label: 'Nuevo pedido', icon: '➕' },
  { href: '/taller/configuracion', label: 'Configuración', icon: '⚙️' },
];

export default function TallerLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { refreshData } = useDataStore();
  const [vendorWa, setVendorWa] = useState<string | null>(null);

  useEffect(() => {
    void refreshData({ silent: true });
  }, [pathname, refreshData]);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role !== 'taller') {
        router.replace('/vendedor');
      }
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !user || user.role !== 'taller') return;
    const sb = getSupabaseClient();
    void sb
      .from('profiles')
      .select('phone')
      .eq('role', 'vendedor')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        const row = data as { phone?: string | null };
        const d = String(row.phone ?? '').replace(/\D/g, '');
        if (d.length >= 8) setVendorWa(d);
      });
  }, [user?.id, user?.role, isLoading]);

  if (!user) {
    if (isLoading) {
      return (
        <div className="flex h-screen overflow-hidden bg-zinc-950">
          <div className="hidden md:block w-64 shrink-0 border-r border-zinc-800 bg-zinc-900 p-4">
            <div className="h-8 w-36 rounded bg-zinc-800/80 animate-pulse mb-6" />
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

  if (user.role !== 'taller') {
    return null;
  }

  const waHref = vendorWa ? buildWhatsAppUrl(vendorWa) : null;

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <Sidebar navItems={tallerNav} portalLabel="Portal Taller" portalIcon="🏭" accentColor="orange" />
        {/* Área de contenido: ocupa el resto del viewport, scrollea internamente */}
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden md:pl-64">
          <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-2xl text-white shadow-lg shadow-black/40 transition-transform hover:scale-105"
          aria-label="WhatsApp al vendedor"
        >
          <span aria-hidden>💬</span>
        </a>
      )}
    </>
  );
}
