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

function getDaysInactive(lastActiveAt: string | null | undefined): number | null {
  if (!lastActiveAt) return null;
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Banner de inactividad — solo informativo, 3 niveles de alerta */
function InactivityBanner({ days }: { days: number }) {
  if (days >= 30) {
    return (
      <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2">
        <p className="text-xs font-bold text-red-300">
          🔴 Taller inactivo. Último inicio de sesión hace {days} días.
        </p>
      </div>
    );
  }
  if (days >= 14) {
    return (
      <div className="mb-3 rounded-xl border border-orange-500/35 bg-orange-500/8 px-3 py-2">
        <p className="text-xs font-bold text-orange-300">
          🟠 Taller inactivo. Último inicio de sesión hace {days} días.
        </p>
      </div>
    );
  }
  // 7–13 días
  return (
    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2">
      <p className="text-xs font-bold text-amber-300">
        ⏰ Taller inactivo. Último inicio de sesión hace {days} días.
      </p>
    </div>
  );
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
      daysInactive: getDaysInactive(workshop.last_active_at),
      totalOrders: workshopOrders.length,
      activeOrders: workshopOrders.filter((order: Order) =>
        ['pendiente', 'en_revision', 'cotizado'].includes(order.status)
      ).length,
      approvedOrders: workshopOrders.filter((order: Order) =>
        order.status === 'aprobado' || order.status === 'aprobado_parcial'
      ).length,
      lastOrder: [...workshopOrders].sort(
        (a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0] as Order | undefined,
      allOrders: [...workshopOrders].sort(
        (a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    };
  });

  const selectedWorkshop = selectedWorkshopId
    ? workshops.find((w: any) => w.id === selectedWorkshopId) ?? null
    : null;

  const drawerOrders: Order[] = selectedWorkshop?.allOrders ?? [];
  const totalGastado = drawerOrders
    .filter((o: Order) => o.status === 'cerrado_pagado')
    .reduce((acc: number, o: Order) => acc + orderTotal(o), 0);
  const totalRechazado = drawerOrders
    .filter((o: Order) => o.status === 'rechazado')
    .reduce((acc: number, o: Order) => acc + orderTotal(o), 0);

  // Contadores de alerta para el subtitle
  const alertCount = workshops.filter((w: any) => w.daysInactive !== null && w.daysInactive >= 7).length;

  return (
    <>
      <TopBar
        title="Clientes y talleres"
        subtitle={
          alertCount > 0
            ? `${workshops.length} talleres · ${alertCount} con inactividad >7 días`
            : `${workshops.length} talleres en la operación`
        }
      />

      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {workshops.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">No hay talleres registrados.</p>
          </div>
        )}

        {workshops.map((workshop: any) => {
          const last: Order | undefined = workshop.lastOrder;
          const lastTotal = last ? orderTotal(last) : 0;
          const isSelected = selectedWorkshopId === workshop.id;
          const days = workshop.daysInactive as number | null;
          const showBanner = days !== null && days >= 7;

          return (
            <div
              key={workshop.id}
              onClick={() => setSelectedWorkshopId(workshop.id)}
              className={`group rounded-2xl border bg-zinc-900/60 p-5 cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'border-orange-500/30 bg-orange-500/5 shadow-md shadow-orange-500/5'
                  : 'border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90 hover:shadow-md hover:shadow-black/20'
              }`}
            >
              {/* Banner de inactividad — solo informativo */}
              {showBanner && <InactivityBanner days={days!} />}

              {/* Header: ícono + nombre + badge número */}
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-lg group-hover:border-zinc-700 transition-colors">
                  🏭
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-zinc-100 text-sm truncate group-hover:text-white transition-colors">
                      {workshop.name}
                    </h2>
                    {workshop.taller_number && (
                      <span className="shrink-0 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-400 uppercase">
                        #{String(workshop.taller_number).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{workshop.contact_name || 'Sin contacto'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Alta</div>
                  <div className="text-[11px] text-zinc-400 font-medium">{formatDate(workshop.created_at)}</div>
                </div>
              </div>

              {/* Info de contacto */}
              <div className="space-y-1 text-[12px] text-zinc-500 mb-4">
                {workshop.address && (
                  <p className="truncate">📍 {workshop.address}</p>
                )}
                <p className="flex items-center gap-1.5">
                  <span className="truncate">📞 {workshop.phone || 'Sin teléfono'}</span>
                  {digitsOnlyPhone(workshop.phone || '').length >= 8 && (
                    <WhatsAppLink phone={workshop.phone} message="Hola, te contacto desde administración." />
                  )}
                </p>
                {workshop.email && (
                  <p className="truncate">📧 {workshop.email}</p>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 border-t border-zinc-800/60 pt-3 mb-3">
                <Stat label="Total" value={workshop.totalOrders} />
                <Stat label="Activos" value={workshop.activeOrders} tone="text-amber-300" />
                <Stat label="Aprobados" value={workshop.approvedOrders} tone="text-emerald-300" />
              </div>

              {/* Último pedido */}
              {last ? (
                <div className="flex items-center gap-2 flex-wrap rounded-xl border border-zinc-800/60 bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-500">
                  <span className="font-mono font-bold text-orange-400/80 shrink-0">
                    #{formatVendorOrderLabel(last)}
                  </span>
                  {lastTotal > 0 && (
                    <span className="text-zinc-300 font-semibold shrink-0">{formatCurrency(lastTotal)}</span>
                  )}
                  <div className="ml-auto shrink-0">
                    <StatusBadge status={last.status} />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-800/60 px-3 py-2 text-[11px] text-zinc-600">
                  Sin pedidos registrados
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Drawer lateral */}
      {selectedWorkshop && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedWorkshopId(null)}
          />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col">
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
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-2 py-2.5 text-center">
      <div className={`text-base font-black tabular-nums ${tone}`}>{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mt-0.5">{label}</div>
    </div>
  );
}
