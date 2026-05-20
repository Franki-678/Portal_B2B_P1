'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { OrderTableRow } from '@/components/orders/OrderCard';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OrderStatus } from '@/lib/types';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { matchesOrderSearch, formatOrderSlug } from '@/lib/utils';

const STATUS_FILTERS: { value: 'todos' | OrderStatus; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'cotizado', label: 'Cotizados' },
  { value: 'aprobado', label: 'Aprobados' },
  { value: 'rechazado', label: 'Rechazados' },
];

export default function TallerPedidosPage() {
  const { user } = useAuth();
  const { getWorkshopOrders, deleteOrder } = useDataStore();
  const router = useRouter();
  const [filter, setFilter] = useState<'todos' | OrderStatus>('todos');
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  const all = user?.workshopId ? getWorkshopOrders(user.workshopId) : [];
  let filtered = filter === 'todos' ? all : all.filter(o => o.status === filter);
  if (search.trim()) {
    filtered = filtered.filter(o => matchesOrderSearch(o, search));
  }
  const sorted = [...filtered].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleDelete = async () => {
    if (!deletingOrderId) return;
    setDeleting(true);
    const ok = await deleteOrder(deletingOrderId);
    setDeleting(false);
    if (!ok) {
      alert('No se pudo eliminar el pedido.');
      return;
    }
    setDeletingOrderId(null);
  };

  return (
    <>
      <TopBar
        title="Mis pedidos"
        subtitle={`${all.length} pedidos en total`}
        action={
          <Button onClick={() => router.push('/taller/pedidos/nuevo')}>
            ➕ Nuevo pedido
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Buscador + Filtros */}
        <div className="space-y-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar por repuesto, vehículo o PED-0142..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500/40 focus:outline-none"
          />
        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filter === f.value
                  ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                  : 'bg-[#1A1D27] text-zinc-400 border-white/8 hover:border-white/20 hover:text-white'
              }`}
            >
              {f.label}
              {f.value !== 'todos' && (
                <span className="ml-1.5 text-zinc-500">
                  ({all.filter(o => o.status === f.value).length})
                </span>
              )}
            </button>
          ))}
        </div>
        </div>

        {/* Lista */}
        {sorted.length === 0 ? (
          <EmptyState
            icon="📭"
            title="Sin pedidos"
            description={filter === 'todos' ? 'Aún no creaste ningún pedido.' : `No hay pedidos con estado "${ORDER_STATUS_LABELS[filter as OrderStatus]}".`}
            action={
              filter === 'todos' ? (
                <Button onClick={() => router.push('/taller/pedidos/nuevo')}>
                  ➕ Crear primer pedido
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setFilter('todos')}>
                  Ver todos los pedidos
                </Button>
              )
            }
          />
        ) : (
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-900/60">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Pedido</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Repuesto / Vehículo</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Estado</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Actualizado</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Acción</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(order => (
                  <OrderTableRow
                    key={order.id}
                    order={order}
                    role="taller"
                    onClick={() => router.push(`/taller/pedidos/${formatOrderSlug(order, 'taller')}`)}
                    actions={
                      order.status === 'pendiente' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => setDeletingOrderId(order.id)}
                        >
                          🗑️
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={Boolean(deletingOrderId)}
        title="¿Eliminar este pedido?"
        description="Solo podés eliminar pedidos en estado pendiente. Esta acción no se puede deshacer."
        tone="danger"
        cancelLabel="Cancelar"
        confirmLabel="Eliminar pedido"
        onCancel={() => setDeletingOrderId(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </>
  );
}
