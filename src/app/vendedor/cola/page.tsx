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

export default function VendedorColaPage() {
  const { user } = useAuth();
  const { getAllOrders, takeOrder } = useDataStore();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [takingId, setTakingId] = useState<string | null>(null);

  const all = getAllOrders();

  // Cola = pedidos sin asignar
  const queue = useMemo(
    () =>
      all
        .filter(o => !o.assignedVendorId && o.status !== 'cerrado')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [all]
  );

  // Mis pedidos asignados (para contexto)
  const myOrders = useMemo(
    () => all.filter(o => o.assignedVendorId === user?.id && o.status !== 'cerrado'),
    [all, user]
  );

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
        subtitle={`${queue.length} pedido${queue.length !== 1 ? 's' : ''} disponible${queue.length !== 1 ? 's' : ''} · Tenés ${myOrders.length} asignado${myOrders.length !== 1 ? 's' : ''}`}
        action={
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-[11px] font-bold text-white shadow shadow-blue-500/40">
              {queue.length}
            </span>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* Encabezado explicativo */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
          <span className="font-semibold">Cola general:</span> estos pedidos no tienen vendedor asignado.
          Tomá un pedido para comenzar a gestionarlo. Solo vos (y el Admin) podrás verlo una vez tomado.
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-slate-800 bg-slate-900/30">
            <div className="text-5xl mb-4 opacity-50">🎉</div>
            <h3 className="text-base font-bold text-slate-300">Cola vacía</h3>
            <p className="text-sm text-slate-500 mt-1">No hay pedidos sin asignar en este momento.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40">
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Pedido</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest hidden sm:table-cell">Vehículo</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest hidden md:table-cell">Taller</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest hidden lg:table-cell">Ingresó</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-widest">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {queue.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => openDrawer(order)}
                    className="cursor-pointer transition-colors hover:bg-slate-800/40 group"
                  >
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs font-bold text-slate-200 group-hover:text-white transition-colors uppercase">
                        {formatVendorOrderLabel(order)}
                      </span>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {order.items[0]?.partName || 'Sin repuesto'}
                        {order.items.length > 1 && (
                          <span className="ml-1 text-slate-600">+{order.items.length - 1}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <span className="text-sm text-slate-300 font-medium">
                        {order.vehicleBrand} {order.vehicleModel}
                      </span>
                      <div className="text-[11px] text-slate-500">{order.vehicleYear}</div>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-slate-400">{order.workshop?.name ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className="text-xs text-slate-500">{formatRelativeTime(order.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm"
                        onClick={e => handleTakeDirect(e, order.id)}
                        loading={takingId === order.id}
                        className={cn(
                          'bg-blue-600 hover:bg-blue-500 text-white border-0 text-xs shadow shadow-blue-500/20',
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

        {/* Mis pedidos asignados */}
        {myOrders.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
              Mis pedidos activos ({myOrders.length})
            </h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-800/60">
                  {myOrders.map(order => (
                    <tr
                      key={order.id}
                      onClick={() => openDrawer(order)}
                      className="cursor-pointer transition-colors hover:bg-slate-800/40 group"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-slate-200 uppercase">
                          {formatVendorOrderLabel(order)}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {order.items[0]?.partName || 'Sin repuesto'}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-slate-300">{order.vehicleBrand} {order.vehicleModel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-slate-500">{formatRelativeTime(order.updatedAt)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
