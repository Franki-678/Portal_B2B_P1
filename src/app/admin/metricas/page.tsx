'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { MetricCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { fetchAdminMonthlyMetricsReport } from '@/lib/supabase/queries';
import { AdminMonthlyMetricsReport } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

export default function AdminMetricasPage() {
  const [report, setReport] = useState<AdminMonthlyMetricsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      setReport(await fetchAdminMonthlyMetricsReport(sb));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const maxStatusValue = useMemo(
    () => Math.max(...(report?.pedidosPorEstado.map(item => item.total) ?? [1])),
    [report]
  );

  return (
    <>
      <TopBar
        title="Métricas del mes"
        subtitle={report ? `Vista global de ${report.monthLabel}` : 'Cargando KPIs globales'}
        action={
          <Button variant="secondary" size="sm" onClick={() => void loadReport()}>
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Pedidos del mes" value={report?.totalPedidosMes ?? 0} icon="📦" color="gray" />
          <MetricCard label="Total facturado" value={formatCurrency(report?.totalFacturadoMes ?? 0)} icon="💵" color="green" />
          <MetricCard label="Ticket promedio" value={formatCurrency(report?.ticketPromedioMes ?? 0)} icon="🧾" color="purple" />
          <MetricCard label="Estados medidos" value={report?.pedidosPorEstado.length ?? 0} icon="📊" color="blue" />
        </div>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-100">Pedidos por estado</h2>
              <p className="text-sm text-slate-400">Grafico simple de barras para seguimiento mensual.</p>
            </div>
          </div>

          <div className="space-y-4">
            {(report?.pedidosPorEstado ?? []).map(item => (
              <div key={item.status} className="grid gap-2 md:grid-cols-[140px_1fr_60px] md:items-center">
                <div className="text-sm font-medium text-slate-300">{item.label}</div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-950">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500"
                    style={{ width: `${Math.max((item.total / maxStatusValue) * 100, item.total > 0 ? 6 : 0)}%` }}
                  />
                </div>
                <div className="text-right text-sm font-semibold text-slate-200">{item.total}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-base font-bold text-slate-100">Por vendedor</h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/70">
                  <tr className="border-b border-slate-800 text-left">
                    <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-500">Vendedor</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-500 text-right">Atendidos</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-500 text-right">Cotizados</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-500 text-right">Aprobados</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-500 text-right">Facturado</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.vendedores ?? []).map(vendor => (
                    <tr key={vendor.vendorId} className="border-b border-slate-800/70">
                      <td className="px-4 py-3 font-medium text-slate-100">{vendor.vendorName}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{vendor.pedidosAtendidos}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{vendor.pedidosCotizados}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{vendor.pedidosAprobados}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-300">
                        {formatCurrency(vendor.totalFacturado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <TopItem title="Marca mas pedida" value={report?.topMarca ?? 'Sin datos'} />
            <TopItem title="Modelo mas pedido" value={report?.topModelo ?? 'Sin datos'} />
            <TopItem title="Producto mas solicitado" value={report?.topProducto ?? 'Sin datos'} />
          </div>
        </section>
      </div>
    </>
  );
}

function TopItem({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-3 text-xl font-bold tracking-tight text-slate-100">{value}</div>
    </div>
  );
}
