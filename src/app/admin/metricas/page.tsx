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
// Colores por estado
// ============================================================

const STATUS_COLORS: Record<string, string> = {
  pendiente:        '#71717a',
  en_revision:      '#60a5fa',
  cotizado:         '#fbbf24',
  aprobado:         '#34d399',
  aprobado_parcial: '#2dd4bf',
  rechazado:        '#f87171',
  cerrado:          '#a78bfa',
  cerrado_pagado:   '#fb923c',
  en_conflicto:     '#ef4444',
};

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

        {/* ── KPI Cards ── */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-32 rounded-3xl border border-zinc-800 bg-zinc-900/70 animate-pulse" />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid gap-4 md:grid-cols-3">
            <KPICard label="Total Facturado" value={formatCurrency(kpis.totalFacturado)} icon="💵"
              note="Pedidos cerrados en el período" color="emerald" />
            <KPICard label="Ticket Promedio" value={formatCurrency(kpis.ticketPromedio)} icon="🎯"
              note="Por pedido completado" color="sky" />
            <KPICard label="Pedidos Completados" value={kpis.totalCompletados} icon="✅"
              note="Cerrados o cobrados" color="orange" />
          </div>
        ) : null}

        {/* ── Ranking de vendedores ── */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h2 className="text-base font-bold tracking-tight text-zinc-100">🏆 Ranking de vendedores</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Por monto facturado en el período seleccionado</p>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-xl bg-zinc-800 animate-pulse" />)}
            </div>
          ) : vendorRanking.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-zinc-500">Sin datos para el período seleccionado.</p>
              <p className="text-xs text-zinc-600 mt-1">Los datos aparecen cuando existen pedidos cerrados.</p>
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
                    <td className="px-4 py-3"><RankBadge pos={i} /></td>
                    <td className="px-4 py-3 font-semibold text-zinc-100">{v.vendorName}</td>
                    <td className="px-4 py-3 text-right font-bold text-zinc-300">{v.pedidosCerrados}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatCurrency(v.montoFacturado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Distribución de pedidos + Top repuestos ── */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Donut chart — distribución por estado */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
            <h2 className="text-base font-bold tracking-tight text-zinc-100 mb-1">
              📊 Distribución por estado
            </h2>
            <p className="text-xs text-zinc-500 mb-5">Todos los pedidos del sistema</p>
            {loading ? (
              <div className="h-48 rounded-2xl bg-zinc-800 animate-pulse" />
            ) : report ? (
              <DonutChart data={report.pedidosPorEstado} />
            ) : null}
          </div>

          {/* Top 10 repuestos solicitados */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
            <h2 className="text-base font-bold tracking-tight text-zinc-100 mb-1">
              🔧 Top repuestos solicitados
            </h2>
            <p className="text-xs text-zinc-500 mb-4">Por cantidad de veces pedidos</p>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="h-7 rounded-lg bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : report?.topRepuestos && report.topRepuestos.length > 0 ? (
              <TopRepuestosTable items={report.topRepuestos} />
            ) : (
              <p className="text-sm text-zinc-500 py-8 text-center">Sin datos aún.</p>
            )}
          </div>

        </div>

      </div>
    </>
  );
}

// ============================================================
// DonutChart — SVG puro, sin librerías externas
// ============================================================

function DonutChart({
  data,
}: {
  data: Array<{ status: string; label: string; total: number }>;
}) {
  const filtered = data.filter(d => d.total > 0);
  const total = filtered.reduce((s, d) => s + d.total, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-zinc-500 py-8 text-center">Sin pedidos registrados.</p>
    );
  }

  const R = 60;
  const C = 2 * Math.PI * R; // ≈ 376.99

  // Build slices with dasharray + offset
  let cumulative = 0;
  const slices = filtered.map(d => {
    const arc = (d.total / total) * C;
    const dashOffset = C - cumulative;
    cumulative += arc;
    return { ...d, arc, dashOffset };
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* SVG donut */}
      <div className="flex-shrink-0 flex justify-center">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {/* Background track */}
          <circle cx="80" cy="80" r={R} fill="none" stroke="#27272a" strokeWidth="28" />
          {/* Slices */}
          <g transform="rotate(-90 80 80)">
            {slices.map(s => (
              <circle
                key={s.status}
                cx="80"
                cy="80"
                r={R}
                fill="none"
                stroke={STATUS_COLORS[s.status] ?? '#71717a'}
                strokeWidth="28"
                strokeDasharray={`${s.arc} ${C - s.arc}`}
                strokeDashoffset={s.dashOffset}
                strokeLinecap="butt"
              />
            ))}
          </g>
          {/* Center label */}
          <text x="80" y="75" textAnchor="middle" className="fill-zinc-100" fontSize="22" fontWeight="700" fill="#f4f4f5">
            {total}
          </text>
          <text x="80" y="93" textAnchor="middle" fontSize="10" fill="#71717a">
            pedidos
          </text>
        </svg>
      </div>

      {/* Legend */}
      <ul className="flex-1 space-y-1.5 min-w-0">
        {filtered.map(d => {
          const pct = Math.round((d.total / total) * 100);
          return (
            <li key={d.status} className="flex items-center gap-2 text-xs">
              <span
                className="flex-shrink-0 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[d.status] ?? '#71717a' }}
              />
              <span className="text-zinc-400 truncate flex-1">{d.label}</span>
              <span className="font-semibold text-zinc-200 tabular-nums">{d.total}</span>
              <span className="text-zinc-600 tabular-nums w-8 text-right">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// Top Repuestos Table — barras horizontales
// ============================================================

function TopRepuestosTable({
  items,
}: {
  items: Array<{ partName: string; count: number }>;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = Math.round((item.count / max) * 100);
        return (
          <div key={item.partName} className="group">
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-zinc-300 truncate max-w-[75%]">
                <span className="text-zinc-600 mr-1.5 tabular-nums">{i + 1}.</span>
                {item.partName}
              </span>
              <span className="text-zinc-400 font-semibold tabular-nums ml-2 flex-shrink-0">
                ×{item.count}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Componentes auxiliares
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
