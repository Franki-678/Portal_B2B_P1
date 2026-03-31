'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/ui/Layout';
import { LoadingSpinner } from '@/components/ui/Layout';

const tallerNav = [
  { href: '/taller', label: 'Dashboard', icon: '📊' },
  { href: '/taller/pedidos', label: 'Mis pedidos', icon: '📋' },
  { href: '/taller/pedidos/nuevo', label: 'Nuevo pedido', icon: '➕' },
];

export default function TallerLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role !== 'taller') {
        router.replace('/vendedor');
      }
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== 'taller') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar navItems={tallerNav} portalLabel="Portal Taller" portalIcon="🏭" accentColor="orange" />
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}
