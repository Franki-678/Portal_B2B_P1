'use client';

import { useState, useMemo } from 'react';
import { useDataStore } from '@/contexts/DataStoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar } from '@/components/ui/Layout';
import { OrderDrawer } from '@/components/orders/OrderDrawer';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Order } from '@/lib/types';
import { formatRelativeTime, formatVendorOrderLabel, cn } from '@/lib/utils';

const TERMINAL_STATUSES = ['cerrado', 'cerrado_pagado', 'rechazado'];

export default function VendedorColaPage() {
  const { user } = useAuth();
  const { getAllOrders, takeOrder } = useDataStore();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [takingId, setTakingId] = useState<string | null>(null);

  const all = getAllOrders();

  // Cola visible: todos los pedidos activos (no terminados), ordenados por fecha desc
  const activeOrders = useMemo(
    () =>
      all
        .filter(o => !TERMINAL_STATUSES.includes(o.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [all]
  );

  // Dividir en libre (sin asignar) y en proceso (asignados)
  const freeOrders = useMemo(() => activeOrders.filter(o => !o.assignedVendorId), [activeOrders]);
  const inProgressOrders = useMemo(() => activeOrders.filter(o => !!o.assignedVendorId), [activeOrders]);
  const myOrders = useMemo(() => inProgressOrders.filter(o => o.assignedVendorId === user?.id), [inProgressOrders, user]);

  const openDrawer = (order: Order) => {
    setSelectedOrder(order);
    setDrawerOpen(true);
  };

  const handleTakeDirect = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    setTakingId(orderId);
    await takeOrder(orderId);
    setTakingId(null);
  };

  return (
    <>
      <TopBar
        title="Cola general"
        subtitle={`${freeOrders.length} disponible${freeOrders.length !== 1 ? 's' : ''} · ${myOrders.length} tomado${myOrders.length !== 1 ? 's' : ''} por vos · ${inProgressOrders.length - myOrders.length} en proceso por otros`}
        action={
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold text-white shadow shadow-orange-500/40">
            {freeOrders.length}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Pedidos disponibles (sin asignar) ── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Disponibles para tomar ({freeOrders.length})
            </h2>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          {freeOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-zinc-800 bg-zinc-900/30">
              <div className="text-4xl mb-3 opacity-50">🎉</div>
              <p className="text-sm font-bold text-zinc-300">Cola vacía</p>
              <p className="text-xs text-zinc-500 mt-1">No hay pedidos sin asignar en este momento.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/40">
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest">Pedido</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden sm:table-cell">Vehículo</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden md:table-cell">Taller</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden lg:table-cell">Ingresó</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-widest">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {freeOrders.map(order => (
                    <tr
                      key={order.id}
                      onClick={() => openDrawer(order)}
                      className="cursor-pointer transition-colors hover:bg-zinc-800/40 group"
                    >
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-bold text-zinc-200 group-hover:text-white transition-colors uppercase">
                          {formatVendorOrderLabel(order)}
                        </span>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          {order.items[0]?.partName || 'Sin repuesto'}
                          {order.items.length > 1 && (
                            <span className="ml-1 text-zinc-600">+{order.items.length - 1}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className="text-sm text-zinc-300 font-medium">{order.vehicleBrand} {order.vehicleModel}</span>
                        <div className="text-[11px] text-zinc-500">{order.vehicleYear}</div>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-sm text-zinc-400">{order.workshop?.name ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-zinc-500">{formatRelativeTime(order.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm"
                          onClick={e => handleTakeDirect(e, order.id)}
                          loading={takingId === order.id}
                          className={cn(
                            'bg-orange-600 hover:bg-orange-500 text-white border-0 text-xs shadow shadow-orange-500/20',
                            takingId === order.id && 'opacity-70'
                          )}
                        >
                          🙋 Tomar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Pedidos en proceso (ya asignados) ── */}
        {inProgressOrders.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                En proceso ({inProgressOrders.length})
              </h2>
              <span className="h-px flex-1 bg-zinc-800" />
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/40">
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest">Pedido</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden sm:table-cell">Vehículo</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest">Vendedor</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-widest hidden lg:table-cell">Actualizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {inProgressOrders.map(order => {
                    const isMine = order.assignedVendorId === user?.id;
                    return (
                      <tr
                        key={order.id}
                        onClick={() => openDrawer(order)}
                        className={cn(
                          'cursor-pointer transition-colors group',
                          isMine ? 'bg-orange-500/5 hover:bg-orange-500/10' : 'hover:bg-zinc-800/40'
                        )}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-zinc-200 uppercase">
                            {formatVendorOrderLabel(order)}
                          </span>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            {order.items[0]?.partName || 'Sin repuesto'}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-sm text-zinc-300">{order.vehicleBrand} {order.vehicleModel}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3">
                          {isMine ? (
                            <span className="text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded">
                              Yo
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">{order.assignedVendorName ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-zinc-500">{formatRelativeTime(order.updatedAt)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <OrderDrawer
        order={selectedOrder}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role="vendedor"
        onTook={() => setDrawerOpen(false)}
      />
    </>
  );
}
