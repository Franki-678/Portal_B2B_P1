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
    void refreshData();
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
        <div className="flex min-h-screen items-center justify-center bg-[#0F1117]">
          <LoadingSpinner />
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
      <div className="flex min-h-screen">
        <Sidebar navItems={tallerNav} portalLabel="Portal Taller" portalIcon="🏭" accentColor="orange" />
        <div className="flex min-w-0 flex-1 flex-col overflow-auto">{children}</div>
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
