'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar } from '@/components/ui/Layout';
import { MetricCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { fetchAdminDashboardMetrics } from '@/lib/supabase/queries';
import { AdminDashboardMetrics } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

const quickLinks = [
  {
    href: '/admin/pedidos',
    title: 'Pedidos',
    description: 'Seguimiento global de pedidos y estados.',
    icon: '📋',
  },
  {
    href: '/admin/clientes',
    title: 'Clientes',
    description: 'Listado completo de talleres y actividad.',
    icon: '🏭',
  },
  {
    href: '/admin/metricas',
    title: 'Métricas',
    description: 'KPIs del mes, top productos y barras.',
    icon: '📈',
  },
  {
    href: '/admin/configuracion',
    title: 'Configuración',
    description: 'Resumen técnico y SQL operativo de Supabase.',
    icon: '⚙️',
  },
  {
    href: '/admin/usuarios',
    title: 'Usuarios',
    description: 'Roles, talleres asignados y directorio.',
    icon: '👥',
  },
];

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      setMetrics(await fetchAdminDashboardMetrics(sb));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el panel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  return (
    <>
      <TopBar
        title={`Panel Admin · ${user?.name ?? 'Administrador'}`}
        subtitle="Acceso rápido a pedidos, clientes, métricas, configuración y usuarios."
        action={
          <Button variant="secondary" size="sm" onClick={() => void loadMetrics()}>
            Actualizar
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {loading && !metrics ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-3xl border border-slate-800 bg-slate-900/70 animate-pulse" />
            ))}
          </div>
        ) : metrics ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Pedidos totales" value={metrics.totalPedidos} icon="📦" color="gray" />
            <MetricCard label="Monto aprobado" value={formatCurrency(metrics.montoAprobado)} icon="💵" color="green" />
            <MetricCard label="Talleres" value={metrics.totalTalleres} icon="🏭" color="orange" />
            <MetricCard label="Usuarios comerciales" value={metrics.totalVendedores} icon="👥" color="purple" />
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-sm transition hover:border-slate-700 hover:bg-slate-900"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 text-2xl">
                {link.icon}
              </div>
              <h2 className="text-lg font-bold tracking-tight text-slate-100">{link.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{link.description}</p>
            </Link>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-base font-bold tracking-tight text-slate-100">Resumen operativo</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryItem label="Pendientes" value={metrics?.pendientes ?? 0} tone="amber" />
            <SummaryItem label="En revisión" value={metrics?.enRevision ?? 0} tone="blue" />
            <SummaryItem label="Cotizados" value={metrics?.cotizados ?? 0} tone="violet" />
            <SummaryItem
              label="Aprobados"
              value={(metrics?.aprobados ?? 0) + (metrics?.aprobadosParcial ?? 0)}
              tone="emerald"
            />
          </div>
        </section>
      </div>
    </>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'blue' | 'violet' | 'emerald';
}) {
  const toneClass = {
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    blue: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    violet: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
