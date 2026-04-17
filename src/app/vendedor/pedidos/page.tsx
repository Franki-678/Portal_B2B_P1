'use client';

import { useDataStore } from '@/contexts/DataStoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { OrderTableRow } from '@/components/orders/OrderCard';
import { OrderDrawer } from '@/components/orders/OrderDrawer';
import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { Order, OrderStatus } from '@/lib/types';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/Button';

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

function PedidosContent() {
  const { getAllOrders } = useDataStore();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get('status') as OrderStatus | null) || 'todos';
  const [filter, setFilter] = useState<'todos' | OrderStatus>(initialStatus as 'todos' | OrderStatus);
  const [search, setSearch] = useState('');
  const [drawerOrder, setDrawerOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // "Mis pedidos" = asignados a mí (no la cola general)
  const all = getAllOrders().filter(o => o.assignedVendorId === user?.id || (user?.role === 'admin'));
  let filtered = filter === 'todos' ? all : all.filter(o => o.status === filter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(o =>
      o.items.some(i => i.partName.toLowerCase().includes(q)) ||
      o.vehicleBrand.toLowerCase().includes(q) ||
      o.vehicleModel.toLowerCase().includes(q) ||
      (o.workshop?.name.toLowerCase().includes(q) ?? false)
    );
  }

  return (
    <>
      <TopBar
        title="Todos los pedidos"
        subtitle={`${all.length} pedidos en el sistema`}
      />
      <div className="p-6 space-y-6">
        {/* Search + Filters */}
        <div className="space-y-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar por repuesto, vehículo, taller..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#1A1D27] px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500/40 focus:outline-none"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  filter === f.value
                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                    : 'bg-[#1A1D27] text-zinc-400 border-white/8 hover:text-white hover:border-white/20'
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-zinc-500">
                  ({f.value === 'todos' ? all.length : all.filter(o => o.status === f.value).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState
            icon="📭"
            title="Sin pedidos"
            description="No hay pedidos que coincidan con los filtros seleccionados."
            action={
              <Button variant="secondary" onClick={() => { setFilter('todos'); setSearch(''); }}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <div className="bg-[#1A1D27] border border-white/8 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/8">
                  <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">ID</th>
                  <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Repuesto / Vehículo</th>
                  <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Taller</th>
                  <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Calidad</th>
                  <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <OrderTableRow
                    key={order.id}
                    order={order}
                    role="vendedor"
                    onClick={() => {
                      setDrawerOrder(order);
                      setDrawerOpen(true);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <OrderDrawer
        order={drawerOrder}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role="vendedor"
      />
    </>
  );
}

export default function VendedorPedidosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-400">Cargando...</div>}>
      <PedidosContent />
    </Suspense>
  );
}
