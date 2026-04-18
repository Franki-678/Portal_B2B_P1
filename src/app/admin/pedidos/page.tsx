'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { OrderTableRow } from '@/components/orders/OrderCard';
import { OrderDrawer } from '@/components/orders/OrderDrawer';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Order, OrderStatus } from '@/lib/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { fetchDeletedOrders } from '@/lib/supabase/queries';
import { formatDate, formatVendorOrderLabel } from '@/lib/utils';

const STATUS_FILTERS: { value: 'todos' | OrderStatus; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'cotizado', label: 'Cotizados' },
  { value: 'aprobado', label: 'Aprobados' },
  { value: 'aprobado_parcial', label: 'Aprobado parcial' },
  { value: 'rechazado', label: 'Rechazados' },
  { value: 'cerrado', label: 'Cerrados' },
];

export default function AdminPedidosPage() {
  const { getAllOrders } = useDataStore();
  const [filter, setFilter] = useState<'todos' | OrderStatus>('todos');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Tab: 'activos' | 'eliminados'
  const [tab, setTab] = useState<'activos' | 'eliminados'>('activos');
  const [deletedOrders, setDeletedOrders] = useState<Order[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);

  const all = getAllOrders();
  const filtered = useMemo(() => {
    let rows = filter === 'todos' ? all : all.filter(order => order.status === filter);
    if (!search.trim()) return rows;

    const query = search.toLowerCase();
    return rows.filter(order =>
      order.items.some(item => item.partName.toLowerCase().includes(query)) ||
      order.vehicleBrand.toLowerCase().includes(query) ||
      order.vehicleModel.toLowerCase().includes(query) ||
      (order.workshop?.name.toLowerCase().includes(query) ?? false)
    );
  }, [all, filter, search]);

  const loadDeleted = useCallback(async () => {
    setLoadingDeleted(true);
    try {
      const sb = getSupabaseClient();
      const rows = await fetchDeletedOrders(sb);
      setDeletedOrders(rows);
    } catch {
      setDeletedOrders([]);
    } finally {
      setLoadingDeleted(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'eliminados') void loadDeleted();
  }, [tab, loadDeleted]);

  const openDrawer = (order: Order) => {
    setSelectedOrder(order);
    setDrawerOpen(true);
  };

  return (
    <>
      <TopBar title="Pedidos globales" subtitle={`${all.length} pedidos activos`} />

      <div className="space-y-6 p-6">

        {/* ── Tabs: Activos / Eliminados ── */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('activos')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              tab === 'activos'
                ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                : 'bg-zinc-900/70 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
            }`}
          >
            Activos ({all.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('eliminados')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              tab === 'eliminados'
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-zinc-900/70 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
            }`}
          >
            🗑 Eliminados
          </button>
        </div>

        {/* ── Tab: Activos ── */}
        {tab === 'activos' && (
          <>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <input
                  type="text"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar por repuesto, vehículo o taller..."
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none lg:max-w-md"
                />
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map(item => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFilter(item.value)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        filter === item.value
                          ? 'border-orange-500/20 bg-orange-500/10 text-orange-400'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon="📭"
                title="Sin pedidos para mostrar"
                description="No hay pedidos que coincidan con los filtros seleccionados."
                action={
                  <Button variant="secondary" onClick={() => { setFilter('todos'); setSearch(''); }}>
                    Limpiar filtros
                  </Button>
                }
              />
            ) : (
              <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-950/70">
                    <tr className="border-b border-zinc-800 text-left">
                      <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-zinc-500">ID</th>
                      <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-zinc-500">Pedido</th>
                      <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-zinc-500">Taller</th>
                      <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-zinc-500">Estado</th>
                      <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-zinc-500">Detalle</th>
                      <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-zinc-500">Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(order => (
                      <OrderTableRow
                        key={order.id}
                        order={order}
                        role="vendedor"
                        onClick={() => openDrawer(order)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Eliminados ── */}
        {tab === 'eliminados' && (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">Pedidos eliminados</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Eliminación lógica — los datos se conservan</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void loadDeleted()}>
                ↻ Actualizar
              </Button>
            </div>

            {loadingDeleted ? (
              <div className="p-8 text-center text-sm text-zinc-500">Cargando…</div>
            ) : deletedOrders.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-zinc-500">No hay pedidos eliminados.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/40">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500">Pedido</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500">Taller</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500">Estado</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500 hidden md:table-cell">Creado</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500">Eliminado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {deletedOrders.map(order => (
                    <tr key={order.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-bold text-red-400/80 uppercase">
                          {formatVendorOrderLabel(order)}
                        </span>
                        <div className="text-[11px] text-zinc-600 mt-0.5">
                          {order.vehicleBrand} {order.vehicleModel} {order.vehicleYear}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-sm text-zinc-400">{order.workshop?.name ?? '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <span className="text-xs text-zinc-500">{formatDate(order.createdAt)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-red-400/70 font-medium">
                          {order.deletedAt ? formatDate(order.deletedAt) : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>

      <OrderDrawer
        order={selectedOrder}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role="admin"
      />
    </>
  );
}
