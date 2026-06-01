'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { MetricCard } from '@/components/ui/Card';
import { TopBar } from '@/components/ui/Layout';
import { OrderTableRow } from '@/components/orders/OrderCard';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { formatOrderSlug, formatCurrency } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

interface PosMiniStats { ventasMes: number; facturadoMes: number; vendedores: { name: string; total: number }[] }

export default function VendedorDashboard() {
  const { user } = useAuth();
  const { getAllOrders, isLoadingOrders, loadError, refreshOrders } = useDataStore();
  const router = useRouter();
  const [posOpen, setPosOpen] = useState(false);
  const [posStats, setPosStats] = useState<PosMiniStats | null>(null);

  useEffect(() => {
    if (!posOpen || posStats) return;
    (async () => {
      const sb = getSupabaseClient();
      const now   = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: sales } = await sb
        .from('pos_sales')
        .select('total_amount, vendor_id, profiles(name)')
        .eq('status', 'closed')
        .gte('created_at', start);
      const rows = (sales ?? []) as any[];
      const facturadoMes = rows.reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
      const vendedorMap: Record<string, { name: string; total: number }> = {};
      rows.forEach((r: any) => {
        const vid  = r.vendor_id;
        const name = r.profiles?.name ?? 'Vendedor';
        if (!vendedorMap[vid]) vendedorMap[vid] = { name, total: 0 };
        vendedorMap[vid].total += Number(r.total_amount) || 0;
      });
      const vendedores = Object.values(vendedorMap).sort((a, b) => b.total - a.total).slice(0, 5);
      setPosStats({ ventasMes: rows.length, facturadoMes, vendedores });
    })();
  }, [posOpen, posStats]);

  const orders = getAllOrders();

  const metrics = {
    nuevos: orders.filter(o => o.status === 'pendiente').length,
    enRevision: orders.filter(o => o.status === 'en_revision').length,
    cotizados: orders.filter(o => o.status === 'cotizado').length,
    aprobados: orders.filter(o => o.status === 'aprobado' || o.status === 'aprobado_parcial').length,
    rechazados: orders.filter(o => o.status === 'rechazado').length,
    total: orders.length,
  };

  const urgent = orders.filter(o => o.status === 'pendiente').slice(0, 5);
  const recent = orders.slice(0, 8);

  return (
    <>
      <TopBar
        title={`Hola, ${user?.name}`}
        subtitle="Panel de administración · Vista general"
      />

      <div className="p-6 space-y-8">
        {isLoadingOrders && !loadError && orders.length === 0 && (
          <div className="space-y-8 animate-pulse" aria-busy="true" aria-label="Cargando pedidos">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-zinc-900/80 border border-zinc-800" />
              ))}
            </div>
            <div className="h-36 rounded-2xl bg-zinc-900/80 border border-zinc-800" />
            <div className="h-56 rounded-2xl bg-zinc-900/80 border border-zinc-800" />
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>No se pudieron cargar los datos: {loadError}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => refreshOrders()}>
              Reintentar
            </Button>
          </div>
        )}

        {!isLoadingOrders && !loadError && orders.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
            <div className="text-3xl mb-3 opacity-80">📋</div>
            <p className="text-zinc-200 font-semibold">No hay pedidos todavía</p>
            <p className="text-zinc-500 text-sm mt-2 max-w-md mx-auto">
              Cuando los talleres creen pedidos, aparecerán acá con métricas en tiempo real.
            </p>
          </div>
        )}

        {!loadError && orders.length > 0 && (
          <>
        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Total pedidos" value={metrics.total} icon="📋" color="gray" />
          <MetricCard label="Nuevos" value={metrics.nuevos} icon="🆕" color="yellow" />
          <MetricCard label="En revisión" value={metrics.enRevision} icon="🔍" color="blue" />
          <MetricCard label="Cotizados" value={metrics.cotizados} icon="💰" color="purple" />
          <MetricCard label="Aprobados" value={metrics.aprobados} icon="✅" color="green" />
          <MetricCard label="Rechazados" value={metrics.rechazados} icon="❌" color="red" />
        </div>

        {/* Pedidos urgentes */}
        {urgent.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-amber-100 flex items-center gap-2 tracking-tight">
                ⚡ Pedidos sin respuesta
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-xs shadow-inner">
                  {urgent.length}
                </span>
              </h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/vendedor/pedidos?status=pendiente')} className="text-amber-400/80 hover:text-amber-400">
                Ver todos →
              </Button>
            </div>
            <div className="space-y-3">
              {urgent.map(order => {
                const orderNum = order.workshop?.tallerNumber && order.workshopOrderNumber
                  ? `${String(order.workshop.tallerNumber).padStart(2, '0')}-PED-${String(order.workshopOrderNumber).padStart(4, '0')}`
                  : order.workshopOrderNumber 
                    ? `PED-${String(order.workshopOrderNumber).padStart(4, '0')}`
                    : order.id.slice(0, 8).toUpperCase();
                
                return (
                  <div
                    key={order.id}
                    onClick={() => router.push(`/vendedor/pedidos/${formatOrderSlug(order, 'vendedor')}`)}
                    className="flex items-center justify-between bg-zinc-950/50 rounded-xl px-5 py-3.5 border border-amber-500/20 hover:border-amber-500/40 hover:bg-zinc-900/80 cursor-pointer transition-all duration-200 shadow-sm group"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-amber-500/80">{orderNum}</span>
                        <span className="text-sm font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">
                          {order.items?.length > 1 
                            ? `${order.items[0]?.partName} (+${order.items.length - 1})`
                            : (order.items?.[0]?.partName || 'Sin repuestos')}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-500 font-medium">{order.workshop?.name}</span>
                    </div>
                    <span className="text-sm font-medium text-zinc-400 bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-800">{order.vehicleBrand} {order.vehicleModel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabla reciente */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-zinc-100 tracking-tight">Actividad reciente</h2>
            <Button variant="ghost" size="sm" onClick={() => router.push('/vendedor/pedidos')} className="text-zinc-400 hover:text-zinc-100">
              Ver todos →
            </Button>
          </div>
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-zinc-800/80 bg-zinc-950/30">
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">ID</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">Repuesto</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">Taller</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">Estado</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">Actualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recent.map(order => (
                  <OrderTableRow
                    key={order.id}
                    order={order}
                    role="vendedor"
                    onClick={() => router.push(`/vendedor/pedidos/${formatOrderSlug(order, 'vendedor')}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
          {/* ── Mini-Dashboard Mostrador ── */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setPosOpen(p => !p)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🛒</span>
                <span className="font-bold text-zinc-300 text-sm">Mostrador — Métricas del mes</span>
              </div>
              <span className="text-zinc-500 text-sm">{posOpen ? '▲' : '▼'}</span>
            </button>
            {posOpen && (
              <div className="border-t border-zinc-800/60 px-5 py-4 space-y-4">
                {!posStats ? (
                  <div className="h-16 animate-pulse rounded-xl bg-zinc-800/60" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-orange-500/20 bg-orange-500/8 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400/70 mb-1">Ventas del mes</p>
                        <p className="text-xl font-black text-orange-300">{posStats.ventasMes}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-1">Facturado</p>
                        <p className="text-xl font-black text-emerald-300">{formatCurrency(posStats.facturadoMes)}</p>
                      </div>
                    </div>
                    {posStats.vendedores.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Ranking vendedores</p>
                        <div className="space-y-1.5">
                          {posStats.vendedores.map((v, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <span className="text-sm text-zinc-300">{['🥇','🥈','🥉'][i] ?? '·'} {v.name}</span>
                              <span className="text-sm font-bold text-zinc-200">{formatCurrency(v.total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => router.push('/vendedor/mostrador')}
                      className="text-xs text-orange-400/70 hover:text-orange-300 transition-colors"
                    >
                      Ver mostrador completo →
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </>
  );
}
