'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar, LoadingSpinner } from '@/components/ui/Layout';

const vendedorNav = [
  { href: '/vendedor', label: 'Dashboard', icon: '📊' },
  { href: '/vendedor/pedidos', label: 'Pedidos', icon: '📋' },
  { href: '/vendedor/clientes', label: 'Clientes', icon: '🏭' },
];

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role !== 'vendedor') {
        router.replace('/taller');
      }
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== 'vendedor') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
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
