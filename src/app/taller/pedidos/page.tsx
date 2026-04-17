'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { OrderCard } from '@/components/orders/OrderCard';
import { OrderDrawer } from '@/components/orders/OrderDrawer';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Order, OrderStatus } from '@/lib/types';
import { ORDER_STATUS_LABELS } from '@/lib/constants';

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
  const [drawerOrder, setDrawerOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const all = user?.workshopId ? getWorkshopOrders(user.workshopId) : [];
  const filtered = filter === 'todos' ? all : all.filter(o => o.status === filter);
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
        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filter === f.value
                  ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                  : 'bg-[#1A1D27] text-slate-400 border-white/8 hover:border-white/20 hover:text-white'
              }`}
            >
              {f.label}
              {f.value !== 'todos' && (
                <span className="ml-1.5 text-slate-500">
                  ({all.filter(o => o.status === f.value).length})
                </span>
              )}
            </button>
          ))}
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
          <div className="grid md:grid-cols-2 gap-4">
            {sorted.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                role="taller"
                onClick={() => {
                  setDrawerOrder(order);
                  setDrawerOpen(true);
                }}
                footerActions={
                  order.status === 'pendiente' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={(e) => { e.stopPropagation(); setDeletingOrderId(order.id); }}
                    >
                      🗑️ Eliminar pedido
                    </Button>
                  ) : undefined
                }
              />
            ))}
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
      <OrderDrawer
        order={drawerOrder}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role="taller"
      />
    </>
  );
}
