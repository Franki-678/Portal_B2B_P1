'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  fetchAdminKPIs,
  fetchVendorRanking,
  fetchWorkshopRanking,
  fetchConflictCount,
} from '@/lib/supabase/queries';
import { AdminKPIResult, VendorRankEntry, WorkshopRankEntry } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

// ============================================================
// Rango de fechas
// ============================================================

type DateRange = 'mes_actual' | 'mes_anterior' | '3_meses' | 'historico';

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  mes_actual:   'Mes actual',
  mes_anterior: 'Mes anterior',
  '3_meses':    'Últimos 3 meses',
  historico:    'Histórico',
};

function getDateRange(range: DateRange): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();

  switch (range) {
    case 'mes_actual': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      return { start, end };
    }
    case 'mes_anterior': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
      return { start, end: endPrev };
    }
    case '3_meses': {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
      return { start, end };
    }
    case 'historico':
    default:
      return { start: '2020-01-01T00:00:00.000Z', end };
  }
}

// ============================================================
// Quick links
// ============================================================

const quickLinks = [
  { href: '/admin/pedidos',       title: 'Pedidos',      description: 'Seguimiento global de pedidos y estados.', icon: '📋' },
  { href: '/admin/vendedores',    title: 'Vendedores',   description: 'Gestión de vendedores, KPIs y asignación.', icon: '👤' },
  { href: '/admin/clientes',      title: 'Clientes',     description: 'Listado completo de talleres y actividad.', icon: '🏭' },
  { href: '/admin/metricas',      title: 'Métricas',     description: 'KPIs del mes, top productos y barras.', icon: '📈' },
  { href: '/admin/usuarios',      title: 'Usuarios',     description: 'Roles, talleres asignados y directorio.', icon: '👥' },
  { href: '/admin/configuracion', title: 'Configuración',description: 'Resumen técnico y SQL operativo de Supabase.', icon: '⚙️' },
];

// ============================================================
// Dashboard principal
// ============================================================

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>('mes_actual');
  const [kpis, setKpis] = useState<AdminKPIResult | null>(null);
  const [vendorRanking, setVendorRanking] = useState<VendorRankEntry[]>([]);
  const [workshopRanking, setWorkshopRanking] = useState<WorkshopRankEntry[]>([]);
  const [conflictCount, setConflictCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (range: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const { start, end } = getDateRange(range);
      const [kpisData, vendorsData, workshopsData, conflicts] = await Promise.all([
        fetchAdminKPIs(sb, start, end),
        fetchVendorRanking(sb, start, end),
        fetchWorkshopRanking(sb, start, end),
        fetchConflictCount(sb),
      ]);
      setKpis(kpisData);
      setVendorRanking(vendorsData);
      setWorkshopRanking(workshopsData);
      setConflictCount(conflicts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el panel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(dateRange);
  }, [loadData, dateRange]);

  return (
    <>
      <TopBar
        title={`Panel Admin · ${user?.name ?? 'Administrador'}`}
        subtitle="Dashboard de rendimiento y facturación."
        action={
          <Button variant="secondary" size="sm" onClick={() => void loadData(dateRange)}>
            ↺ Actualizar
          </Button>
        }
      />

      <div className="space-y-6 p-6">

        {/* ── Filtros de rango de fechas ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {(Object.entries(DATE_RANGE_LABELS) as [DateRange, string][]).map(([range, label]) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                dateRange === range
                  ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                  : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Banner de conflictos activos ── */}
        {conflictCount > 0 && (
          <Link href="/admin/pedidos" className="block">
            <div className="flex items-center gap-4 rounded-2xl border border-red-500/40 bg-red-600/10 px-5 py-4 text-red-200 hover:bg-red-500/15 transition-colors">
              <span className="text-2xl shrink-0">⚠️</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-red-300">
                  {conflictCount} pedido{conflictCount !== 1 ? 's' : ''} en conflicto
                </p>
                <p className="text-sm text-red-400/70 mt-0.5">
                  Hay reclamos activos que requieren tu atención. Hacé clic para ver todos los pedidos.
                </p>
              </div>
              <span className="shrink-0 text-red-400 font-bold text-lg">→</span>
            </div>
          </Link>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {/* ── KPI Cards ── */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-36 rounded-3xl border border-slate-800 bg-slate-900/70 animate-pulse" />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid gap-4 md:grid-cols-3">
            <KPICard
              label="Total Facturado"
              value={formatCurrency(kpis.totalFacturado)}
              icon="💵"
              note="Solo pedidos con pago confirmado"
              color="emerald"
            />
            <KPICard
              label="Ticket Promedio"
              value={formatCurrency(kpis.ticketPromedio)}
              icon="🎯"
              note="Por pedido completado y pagado"
              color="sky"
            />
            <KPICard
              label="Pedidos Completados"
              value={kpis.totalCompletados}
              icon="✅"
              note="Con pago confirmado por admin"
              color="violet"
            />
          </div>
        ) : null}

        {/* ── Rankings ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Vendedores */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <h2 className="text-base font-bold tracking-tight text-slate-100">🏆 Top Vendedores</h2>
              <p className="text-xs text-slate-500 mt-0.5">Por monto facturado en pedidos pagados</p>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-xl bg-slate-800 animate-pulse" />)}
              </div>
            ) : vendorRanking.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-slate-500">Sin datos para el período seleccionado.</p>
                <p className="text-xs text-slate-600 mt-1">Los datos aparecen cuando Admin confirma pagos.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Vendedor</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Cerrados</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Facturado</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorRanking.map((v, i) => (
                    <tr key={v.vendorId} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <RankBadge pos={i} />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-100">{v.vendorName}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-300">{v.pedidosCerrados}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatCurrency(v.montoFacturado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Top Talleres */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <h2 className="text-base font-bold tracking-tight text-slate-100">🏭 Top Talleres</h2>
              <p className="text-xs text-slate-500 mt-0.5">Por volumen de compra en pedidos pagados</p>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-xl bg-slate-800 animate-pulse" />)}
              </div>
            ) : workshopRanking.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-slate-500">Sin datos para el período seleccionado.</p>
                <p className="text-xs text-slate-600 mt-1">Los datos aparecen cuando Admin confirma pagos.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Taller</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Pedidos</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Comprado</th>
                  </tr>
                </thead>
                <tbody>
                  {workshopRanking.map((w, i) => (
                    <tr key={w.workshopId} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <RankBadge pos={i} />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-100">{w.workshopName}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-300">{w.totalPedidos}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-400">{formatCurrency(w.montoComprado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Quick Links ── */}
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
      </div>
    </>
  );
}

// ============================================================
// Componentes internos
// ============================================================

function KPICard({
  label,
  value,
  icon,
  note,
  color,
}: {
  label: string;
  value: string | number;
  icon: string;
  note: string;
  color: 'emerald' | 'sky' | 'violet';
}) {
  const border = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    sky:     'border-sky-500/20     bg-sky-500/5',
    violet:  'border-violet-500/20  bg-violet-500/5',
  }[color];

  const iconBg = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20',
    sky:     'bg-sky-500/10     border-sky-500/20',
    violet:  'bg-violet-500/10  border-violet-500/20',
  }[color];

  const textColor = {
    emerald: 'text-emerald-400',
    sky:     'text-sky-400',
    violet:  'text-violet-400',
  }[color];

  return (
    <div className={`rounded-3xl border p-6 ${border}`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border text-lg ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className={`text-3xl font-black tracking-tight ${textColor}`}>{value}</p>
      <p className="mt-1.5 text-xs font-medium text-slate-500">{note}</p>
    </div>
  );
}

function RankBadge({ pos }: { pos: number }) {
  const cls =
    pos === 0 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
    pos === 1 ? 'bg-slate-500/20 text-slate-300 border-slate-500/30' :
    pos === 2 ? 'bg-orange-700/20 text-orange-500 border-orange-700/30' :
                'bg-slate-800 text-slate-500 border-slate-700/30';

  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold border ${cls}`}>
      {pos + 1}
    </span>
  );
}
