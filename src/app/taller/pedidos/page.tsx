'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { OrderTableRow } from '@/components/orders/OrderCard';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { Order, OrderStatus } from '@/lib/types';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { matchesOrderSearch, formatOrderSlug } from '@/lib/utils';

const STATUS_FILTERS: { value: 'todos' | OrderStatus; label: string }[] = [
  { value: 'todos',           label: 'Todos' },
  { value: 'pendiente',       label: 'Pendientes' },
  { value: 'en_revision',     label: 'En revisión' },
  { value: 'cotizado',        label: 'Cotizados' },
  { value: 'aprobado',        label: 'Aprobados' },
  { value: 'aprobado_parcial',label: 'Aprobado parcial' },
  { value: 'pagado',          label: 'Pagados' },
  { value: 'rechazado',       label: 'Rechazados' },
  { value: 'cerrado',         label: 'Cerrados' },
  { value: 'cerrado_pagado',  label: 'Cerrado · Pagado' },
  { value: 'en_conflicto',    label: 'En conflicto' },
  { value: 'cancelado',       label: 'Cancelados' },
];

export default function TallerPedidosPage() {
  const { user } = useAuth();
  const { getWorkshopOrders, deleteOrder } = useDataStore();
  const router = useRouter();
  const [filter, setFilter] = useState<'todos' | OrderStatus>('todos');
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  type SortKey = 'num' | 'part' | 'status' | 'updatedAt';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  const toggleSort = (key: SortKey) =>
    setSortConfig(prev =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );

  const all = user?.workshopId ? getWorkshopOrders(user.workshopId) : [];

  const sorted = useMemo(() => {
    let rows = filter === 'todos' ? all : all.filter(o => o.status === filter);
    if (search.trim()) rows = rows.filter(o => matchesOrderSearch(o, search));
    const arr = [...rows];
    if (sortConfig) {
      arr.sort((a: Order, b: Order) => {
        let av: string | number = '';
        let bv: string | number = '';
        switch (sortConfig.key) {
          case 'num':       av = a.workshopOrderNumber ?? 0;  bv = b.workshopOrderNumber ?? 0; break;
          case 'part':      av = a.items?.[0]?.partName ?? ''; bv = b.items?.[0]?.partName ?? ''; break;
          case 'status':    av = a.status;                     bv = b.status; break;
          case 'updatedAt': av = a.updatedAt;                  bv = b.updatedAt; break;
        }
        const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv));
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      });
    } else {
      arr.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return arr;
  }, [all, filter, search, sortConfig]);

  const sortIcon = (k: SortKey) =>
    sortConfig?.key === k
      ? <span className="ml-1 text-orange-400">{sortConfig.dir === 'asc' ? '▲' : '▼'}</span>
      : <span className="ml-1 text-zinc-700">⇅</span>;

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
                <tr className="border-b border-zinc-800/80 bg-zinc-900/60 select-none">
                  <th onClick={() => toggleSort('num')} className="px-5 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors">Pedido{sortIcon('num')}</th>
                  <th onClick={() => toggleSort('part')} className="px-5 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors">Repuesto / Vehículo{sortIcon('part')}</th>
                  <th onClick={() => toggleSort('status')} className="px-5 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors">Estado{sortIcon('status')}</th>
                  <th onClick={() => toggleSort('updatedAt')} className="px-5 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors">Actualizado{sortIcon('updatedAt')}</th>
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
