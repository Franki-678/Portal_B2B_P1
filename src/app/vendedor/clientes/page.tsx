'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import {
  formatDate,
  digitsOnlyPhone,
  formatCurrency,
  quoteLineTotal,
  formatVendorOrderLabel,
  formatOrderSlug,
} from '@/lib/utils';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import type { Order } from '@/lib/types';

function orderTotal(order: Order): number {
  const items = order.quote?.items ?? [];
  return items.reduce((acc, item) => acc + quoteLineTotal(item), 0);
}

export default function VendedorClientesPage() {
  const { getAllOrders, getAllWorkshops, loadError, refreshOrders, isLoadingWorkshops, isLoadingOrders } =
    useDataStore();
  const router = useRouter();
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);

  const orders = getAllOrders();
  const workshopsRaw = getAllWorkshops();

  const workshops = workshopsRaw.map((ws: any) => {
    const wsOrders = orders.filter((o: Order) => o.workshopId === ws.id);
    const sorted = [...wsOrders].sort(
      (a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return {
      id: ws.id,
      name: ws.name,
      contact_name: ws.contact_name && ws.contact_name !== ws.name ? ws.contact_name : '',
      address: ws.address || '',
      phone: ws.phone || '',
      email: ws.email || '',
      created_at: ws.created_at,
      taller_number: ws.taller_number ?? null,
      totalOrders: wsOrders.length,
      activeOrders: wsOrders.filter((o: Order) =>
        ['pendiente', 'en_revision', 'cotizado'].includes(o.status)
      ).length,
      approvedOrders: wsOrders.filter((o: Order) =>
        o.status === 'aprobado' || o.status === 'aprobado_parcial'
      ).length,
      lastOrder: sorted[0] as Order | undefined,
      allOrders: sorted,
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

  const isLoading = (isLoadingWorkshops || isLoadingOrders) && !loadError && workshopsRaw.length === 0;

  return (
    <>
      <TopBar
        title="Clientes / Talleres"
        subtitle={`${workshops.length} talleres registrados`}
      />

      <div className="p-6 space-y-4">
        {/* Loading skeleton */}
        {isLoading && (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse"
            aria-busy="true"
            aria-label="Cargando talleres"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-52 rounded-2xl bg-zinc-900/80 border border-zinc-800/60" />
            ))}
          </div>
        )}

        {/* Error */}
        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>No se pudieron cargar los talleres: {loadError}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => refreshOrders()}>
              Reintentar
            </Button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !loadError && workshops.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-4 text-2xl">
              🏭
            </div>
            <h3 className="text-base font-bold text-zinc-200 mb-1">No hay talleres registrados</h3>
            <p className="text-sm text-zinc-500 max-w-sm">Aún no hay clientes vinculados a este portal.</p>
          </div>
        )}

        {/* Grid de tarjetas */}
        {!loadError && workshops.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workshops.map(ws => {
              const last: Order | undefined = ws.lastOrder;
              const lastTotal = last ? orderTotal(last) : 0;
              const isSelected = selectedWorkshopId === ws.id;

              return (
                <div
                  key={ws.id}
                  onClick={() => setSelectedWorkshopId(ws.id)}
                  className={`group rounded-2xl border bg-zinc-900/60 p-5 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-orange-500/30 bg-orange-500/5 shadow-md shadow-orange-500/5'
                      : 'border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90 hover:shadow-md hover:shadow-black/20'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-lg group-hover:border-zinc-700 transition-colors">
                      🏭
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-zinc-100 text-sm truncate group-hover:text-white transition-colors">
                          {ws.name}
                        </h3>
                        {ws.taller_number && (
                          <span className="shrink-0 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-400 uppercase">
                            #{String(ws.taller_number).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{ws.contact_name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Alta</div>
                      <div className="text-[11px] text-zinc-400 font-medium">{formatDate(ws.created_at)}</div>
                    </div>
                  </div>

                  {/* Contacto */}
                  <div className="space-y-1 text-[12px] text-zinc-500 mb-4">
                    {ws.address && <p className="truncate">📍 {ws.address}</p>}
                    <p className="flex items-center gap-1.5">
                      <span className="truncate">📞 {ws.phone || 'Sin teléfono'}</span>
                      {digitsOnlyPhone(ws.phone).length >= 8 && (
                        <WhatsAppLink
                          phone={ws.phone}
                          message="Hola, te contacto desde el portal B2B."
                        />
                      )}
                    </p>
                    {ws.email && <p className="truncate">📧 {ws.email}</p>}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 border-t border-zinc-800/60 pt-3 mb-3">
                    <Stat label="Total" value={ws.totalOrders} />
                    <Stat label="Activos" value={ws.activeOrders} tone="text-amber-300" />
                    <Stat label="Aprobados" value={ws.approvedOrders} tone="text-emerald-300" />
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
        )}
      </div>

      {/* ── Drawer lateral ── */}
      {selectedWorkshop && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
            onClick={() => setSelectedWorkshopId(null)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-zinc-950 border-l border-zinc-800/80 shadow-2xl flex flex-col">
            {/* Header sticky */}
            <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 px-6 py-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-lg">🏭</span>
                  <h2 className="text-base font-bold text-zinc-100">{selectedWorkshop.name}</h2>
                  {selectedWorkshop.taller_number && (
                    <span className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-400">
                      #{String(selectedWorkshop.taller_number).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">{selectedWorkshop.contact_name}</p>
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
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-1">
                    Total gastado
                  </p>
                  <p className="text-xl font-black text-emerald-300">{formatCurrency(totalGastado)}</p>
                  <p className="text-[11px] text-emerald-500/60 mt-0.5">pedidos cerrado · pagado</p>
                </div>
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/8 px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400/70 mb-1">
                    Total rechazado
                  </p>
                  <p className="text-xl font-black text-rose-300">{formatCurrency(totalRechazado)}</p>
                  <p className="text-[11px] text-rose-500/60 mt-0.5">pedidos rechazados</p>
                </div>
              </div>

              {/* Historial */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Historial de pedidos
                  </h3>
                  <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
                    {drawerOrders.length}
                  </span>
                </div>

                {drawerOrders.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">Este taller no tiene pedidos todavía.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {drawerOrders.map((order: Order) => {
                      const total = orderTotal(order);
                      const slug = formatOrderSlug(order, 'vendedor');
                      return (
                        <div
                          key={order.id}
                          onClick={e => {
                            e.stopPropagation();
                            router.push(`/vendedor/pedidos/${slug}`);
                          }}
                          className="group rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3 hover:border-zinc-700 hover:bg-zinc-900 transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-orange-400/80 shrink-0">
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
                              <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors">
                                Ver →
                              </span>
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
