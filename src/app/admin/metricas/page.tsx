'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  fetchAdminKPIs,
  fetchVendorRanking,
  fetchAdminMonthlyMetricsReport,
} from '@/lib/supabase/queries';
import { AdminKPIResult, VendorRankEntry, AdminMonthlyMetricsReport } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

// ============================================================
// Rango de fechas (mismo que admin/page.tsx)
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
// Página principal
// ============================================================

export default function AdminMetricasPage() {
  const [dateRange, setDateRange] = useState<DateRange>('mes_actual');
  const [kpis, setKpis] = useState<AdminKPIResult | null>(null);
  const [vendorRanking, setVendorRanking] = useState<VendorRankEntry[]>([]);
  const [report, setReport] = useState<AdminMonthlyMetricsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (range: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const { start, end } = getDateRange(range);
      const [kpisData, vendorsData, reportData] = await Promise.all([
        fetchAdminKPIs(sb, start, end),
        fetchVendorRanking(sb, start, end),
        fetchAdminMonthlyMetricsReport(sb),
      ]);
      setKpis(kpisData);
      setVendorRanking(vendorsData);
      setReport(reportData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(dateRange); }, [loadData, dateRange]);

  return (
    <>
      <TopBar
        title="Métricas"
        subtitle="KPIs de facturación y rendimiento por vendedor."
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
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  : 'bg-zinc-900/70 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {/* ── KPI Cards (fecha filtrada) ── */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-32 rounded-3xl border border-zinc-800 bg-zinc-900/70 animate-pulse" />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid gap-4 md:grid-cols-3">
            <KPICard label="Total Facturado" value={formatCurrency(kpis.totalFacturado)} icon="💵"
              note="Solo pedidos con pago confirmado" color="emerald" />
            <KPICard label="Ticket Promedio" value={formatCurrency(kpis.ticketPromedio)} icon="🎯"
              note="Por pedido completado y pagado" color="sky" />
            <KPICard label="Pedidos Completados" value={kpis.totalCompletados} icon="✅"
              note="Con pago confirmado por admin" color="orange" />
          </div>
        ) : null}

        {/* ── Tabla de vendedores (por ranking de facturación en el período) ── */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h2 className="text-base font-bold tracking-tight text-zinc-100">🏆 Ranking de vendedores</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Por monto facturado en pedidos pagados en el período seleccionado</p>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-xl bg-zinc-800 animate-pulse" />)}
            </div>
          ) : vendorRanking.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-zinc-500">Sin datos para el período seleccionado.</p>
              <p className="text-xs text-zinc-600 mt-1">Los datos aparecen cuando Admin confirma pagos.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Vendedor</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Cerrados</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Facturado</th>
                </tr>
              </thead>
              <tbody>
                {vendorRanking.map((v, i) => (
                  <tr key={v.vendorId} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <RankBadge pos={i} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-100">{v.vendorName}</td>
                    <td className="px-4 py-3 text-right font-bold text-zinc-300">{v.pedidosCerrados}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatCurrency(v.montoFacturado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── KPIs de producto (placeholders para dataset futuro) ── */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Tendencias de producto</h2>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
              Requiere dataset cargado
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <TopItem
              title="Marca más pedida"
              value={report?.topMarca ?? '—'}
              icon="🚗"
              placeholder={!report?.topMarca || report.topMarca === 'Sin datos'}
            />
            <TopItem
              title="Modelo más pedido"
              value={report?.topModelo ?? '—'}
              icon="📋"
              placeholder={!report?.topModelo || report.topModelo === 'Sin datos'}
            />
            <TopItem
              title="Categoría de producto"
              value="Próximamente"
              icon="🔧"
              placeholder
            />
          </div>
        </div>

      </div>
    </>
  );
}

// ============================================================
// Componentes
// ============================================================

function KPICard({
  label, value, icon, note, color,
}: {
  label: string; value: string | number; icon: string; note: string;
  color: 'emerald' | 'sky' | 'orange';
}) {
  const border = { emerald: 'border-emerald-500/20 bg-emerald-500/5', sky: 'border-sky-500/20 bg-sky-500/5', orange: 'border-orange-500/20 bg-orange-500/5' }[color];
  const iconBg = { emerald: 'bg-emerald-500/10 border-emerald-500/20', sky: 'bg-sky-500/10 border-sky-500/20', orange: 'bg-orange-500/10 border-orange-500/20' }[color];
  const textColor = { emerald: 'text-emerald-400', sky: 'text-sky-400', orange: 'text-orange-400' }[color];
  return (
    <div className={`rounded-3xl border p-6 ${border}`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border text-lg ${iconBg}`}>{icon}</div>
      </div>
      <p className={`text-3xl font-black tracking-tight ${textColor}`}>{value}</p>
      <p className="mt-1.5 text-xs font-medium text-zinc-500">{note}</p>
    </div>
  );
}

function TopItem({ title, value, icon, placeholder }: { title: string; value: string; icon: string; placeholder?: boolean }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{title}</p>
      </div>
      <p className={`text-xl font-bold tracking-tight ${placeholder ? 'text-zinc-600 italic' : 'text-zinc-100'}`}>
        {value}
      </p>
    </div>
  );
}

function RankBadge({ pos }: { pos: number }) {
  const cls =
    pos === 0 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
    pos === 1 ? 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' :
    pos === 2 ? 'bg-orange-700/20 text-orange-500 border-orange-700/30' :
                'bg-zinc-800 text-zinc-500 border-zinc-700/30';
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold border ${cls}`}>
      {pos + 1}
    </span>
  );
}
