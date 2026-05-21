'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate, digitsOnlyPhone, formatCurrency, quoteLineTotal, formatVendorOrderLabel } from '@/lib/utils';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import type { Order } from '@/lib/types';

function orderTotal(order: Order): number {
  const items = order.quote?.items ?? [];
  return items.reduce((acc, item) => acc + quoteLineTotal(item), 0);
}

export default function AdminClientesPage() {
  const { getAllOrders, getAllWorkshops } = useDataStore();
  const router = useRouter();
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);

  const orders = getAllOrders();
  const workshops = getAllWorkshops().map((workshop: any) => {
    const workshopOrders = orders.filter((order: Order) => order.workshopId === workshop.id);
    return {
      ...workshop,
      totalOrders: workshopOrders.length,
      activeOrders: workshopOrders.filter((order: Order) => ['pendiente', 'en_revision', 'cotizado'].includes(order.status)).length,
      approvedOrders: workshopOrders.filter((order: Order) => order.status === 'aprobado' || order.status === 'aprobado_parcial').length,
      lastOrder: [...workshopOrders].sort(
        (a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0] as Order | undefined,
      allOrders: [...workshopOrders].sort(
        (a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    };
  });

  const selectedWorkshop = selectedWorkshopId
    ? workshops.find(w => w.id === selectedWorkshopId) ?? null
    : null;

  const drawerOrders: Order[] = selectedWorkshop?.allOrders ?? [];
  const totalGastado = drawerOrders
    .filter((o: Order) => o.status === 'cerrado_pagado')
    .reduce((acc: number, o: Order) => acc + orderTotal(o), 0);
  const totalRechazado = drawerOrders
    .filter((o: Order) => o.status === 'rechazado')
    .reduce((acc: number, o: Order) => acc + orderTotal(o), 0);

  return (
    <>
      <TopBar
        title="Clientes y talleres"
        subtitle={`${workshops.length} talleres visibles en la operación`}
      />

      <div className="grid gap-5 p-6 md:grid-cols-2 xl:grid-cols-3">
        {workshops.map(workshop => {
          const last: Order | undefined = workshop.lastOrder;
          const lastTotal = last ? orderTotal(last) : 0;

          return (
            <div
              key={workshop.id}
              onClick={() => setSelectedWorkshopId(workshop.id)}
              className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm cursor-pointer hover:border-zinc-700 hover:bg-zinc-900 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-xl">
                      🏭
                    </div>
                    <div>
                      <h2 className="font-semibold text-zinc-100">{workshop.name}</h2>
                      <p className="text-xs text-zinc-500">{workshop.contact_name || 'Sin contacto'}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-zinc-400">
                    <p>📍 {workshop.address || 'Sin dirección'}</p>
                    <p className="flex items-center gap-2">
                      <span>📞 {workshop.phone || 'Sin teléfono'}</span>
                      {digitsOnlyPhone(workshop.phone || '').length >= 8 && (
                        <WhatsAppLink phone={workshop.phone} message="Hola, te contacto desde administración." />
                      )}
                    </p>
                    <p>📧 {workshop.email || 'Sin email'}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Alta</div>
                  <div className="text-xs text-zinc-300">{formatDate(workshop.created_at)}</div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-zinc-800 pt-4">
                <Stat label="Total" value={workshop.totalOrders} />
                <Stat label="Activos" value={workshop.activeOrders} tone="text-amber-300" />
                <Stat label="Aprob." value={workshop.approvedOrders} tone="text-emerald-300" />
              </div>

              {last && (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400 flex items-center gap-2 flex-wrap">
                  <span>Último pedido:</span>
                  <span className="font-mono font-bold text-zinc-200">
                    #{formatVendorOrderLabel(last)}
                  </span>
                  {lastTotal > 0 && (
                    <span className="text-zinc-300 font-medium">— {formatCurrency(lastTotal)}</span>
                  )}
                  <StatusBadge status={last.status} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Drawer lateral */}
      {selectedWorkshop && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedWorkshopId(null)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-6 py-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🏭</span>
                  <h2 className="text-base font-bold text-zinc-100">{selectedWorkshop.name}</h2>
                </div>
                <p className="text-xs text-zinc-500">{selectedWorkshop.contact_name || 'Sin contacto registrado'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWorkshopId(null)}
                className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-all"
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="flex-1 px-6 py-6 space-y-6">
              {/* Analytics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-1">Total gastado</p>
                  <p className="text-xl font-black text-emerald-300">{formatCurrency(totalGastado)}</p>
                  <p className="text-[11px] text-emerald-500/60 mt-0.5">pedidos cerrado · pagado</p>
                </div>
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/8 px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400/70 mb-1">Total rechazado</p>
                  <p className="text-xl font-black text-rose-300">{formatCurrency(totalRechazado)}</p>
                  <p className="text-[11px] text-rose-500/60 mt-0.5">pedidos rechazados</p>
                </div>
              </div>

              {/* Historial de pedidos */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">
                  Historial de pedidos ({drawerOrders.length})
                </h3>

                {drawerOrders.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">Este taller no tiene pedidos todavía.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {drawerOrders.map((order: Order) => {
                      const total = orderTotal(order);
                      return (
                        <div
                          key={order.id}
                          onClick={() => router.push(`/admin/pedidos`)}
                          className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3.5 hover:border-zinc-700 hover:bg-zinc-900 transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-orange-400/80">
                                  #{formatVendorOrderLabel(order)}
                                </span>
                                <StatusBadge status={order.status} />
                              </div>
                              <p className="text-sm text-zinc-300 font-medium truncate">
                                {order.items?.[0]?.partName || 'Sin repuestos'}
                                {(order.items?.length ?? 0) > 1 && (
                                  <span className="text-zinc-500 ml-1">(+{order.items.length - 1})</span>
                                )}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {order.vehicleBrand} {order.vehicleModel} · {formatDate(order.updatedAt)}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              {total > 0 ? (
                                <p className="text-sm font-bold text-zinc-200">{formatCurrency(total)}</p>
                              ) : (
                                <p className="text-xs text-zinc-600">—</p>
                              )}
                              <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors">Ver →</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value, tone = 'text-zinc-100' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-center">
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
    </div>
  );
}
