'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { OrderTableRow } from '@/components/orders/OrderCard';
import { Button } from '@/components/ui/Button';
import { OrderStatus } from '@/lib/types';

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
  const router = useRouter();
  const { getAllOrders } = useDataStore();
  const [filter, setFilter] = useState<'todos' | OrderStatus>('todos');
  const [search, setSearch] = useState('');

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

  return (
    <>
      <TopBar title="Pedidos globales" subtitle={`${all.length} pedidos visibles para el admin`} />

      <div className="space-y-6 p-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por repuesto, vehiculo o taller..."
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-700 focus:outline-none lg:max-w-md"
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    filter === item.value
                      ? 'border-violet-500/30 bg-violet-500/15 text-violet-200'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
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
          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70">
            <table className="w-full text-sm">
              <thead className="bg-slate-950/70">
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-slate-500">ID</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-slate-500">Pedido</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-slate-500">Taller</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-slate-500">Estado</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-slate-500">Detalle</th>
                  <th className="px-5 py-4 text-xs uppercase tracking-[0.18em] text-slate-500">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <OrderTableRow
                    key={order.id}
                    order={order}
                    role="vendedor"
                    onClick={() => router.push(`/vendedor/pedidos/${order.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
