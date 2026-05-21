'use client';

import { useDataStore } from '@/contexts/DataStoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { OrderTableRow } from '@/components/orders/OrderCard';
import { useSearchParams } from 'next/navigation';
import { useState, useMemo, Suspense } from 'react';
import { Order, OrderStatus } from '@/lib/types';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/Button';
import { matchesOrderSearch, formatOrderSlug } from '@/lib/utils';
import { useRouter } from 'next/navigation';

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

function PedidosContent() {
  const { getAllOrders } = useDataStore();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialStatus = (searchParams.get('status') as OrderStatus | null) || 'todos';
  const [filter, setFilter] = useState<'todos' | OrderStatus>(initialStatus as 'todos' | OrderStatus);
  const [search, setSearch] = useState('');
  type SortKey = 'num' | 'part' | 'workshop' | 'status' | 'updatedAt';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  const toggleSort = (key: SortKey) =>
    setSortConfig(prev =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );

  const all = getAllOrders().filter(o => o.assignedVendorId === user?.id || (user?.role === 'admin'));

  const sorted = useMemo(() => {
    let rows = filter === 'todos' ? all : all.filter(o => o.status === filter);
    if (search.trim()) rows = rows.filter(o => matchesOrderSearch(o, search));
    const arr = [...rows];
    if (sortConfig) {
      arr.sort((a: Order, b: Order) => {
        let av: string | number = '';
        let bv: string | number = '';
        switch (sortConfig.key) {
          case 'num':      av = a.workshopOrderNumber ?? 0;   bv = b.workshopOrderNumber ?? 0; break;
          case 'part':     av = a.items?.[0]?.partName ?? ''; bv = b.items?.[0]?.partName ?? ''; break;
          case 'workshop': av = a.workshop?.name ?? '';        bv = b.workshop?.name ?? ''; break;
          case 'status':   av = a.status;                      bv = b.status; break;
          case 'updatedAt':av = a.updatedAt;                   bv = b.updatedAt; break;
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
            placeholder="🔍 Buscar por repuesto, vehículo, taller o PED-0142..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full max-w-lg rounded-xl border border-zinc-700/60 bg-zinc-900/80 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/40 focus:outline-none transition-colors"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  filter === f.value
                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-zinc-600">
                  ({f.value === 'todos' ? all.length : all.filter(o => o.status === f.value).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {sorted.length === 0 ? (
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
          <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/50 shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-zinc-950/60">
                <tr className="text-left border-b border-zinc-800/80 select-none">
                  <th onClick={() => toggleSort('num')} className="px-5 py-3.5 text-xs font-bold text-zinc-500 uppercase tracking-[0.18em] cursor-pointer hover:text-zinc-300 transition-colors">ID{sortIcon('num')}</th>
                  <th onClick={() => toggleSort('part')} className="px-5 py-3.5 text-xs font-bold text-zinc-500 uppercase tracking-[0.18em] cursor-pointer hover:text-zinc-300 transition-colors">Repuesto / Vehículo{sortIcon('part')}</th>
                  <th onClick={() => toggleSort('workshop')} className="px-5 py-3.5 text-xs font-bold text-zinc-500 uppercase tracking-[0.18em] cursor-pointer hover:text-zinc-300 transition-colors">Taller{sortIcon('workshop')}</th>
                  <th onClick={() => toggleSort('status')} className="px-5 py-3.5 text-xs font-bold text-zinc-500 uppercase tracking-[0.18em] cursor-pointer hover:text-zinc-300 transition-colors">Estado{sortIcon('status')}</th>
                  <th onClick={() => toggleSort('updatedAt')} className="px-5 py-3.5 text-xs font-bold text-zinc-500 uppercase tracking-[0.18em] cursor-pointer hover:text-zinc-300 transition-colors">Actualizado{sortIcon('updatedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(order => (
                  <OrderTableRow
                    key={order.id}
                    order={order}
                    role="vendedor"
                    onClick={() => router.push(`/vendedor/pedidos/${formatOrderSlug(order, 'vendedor')}`)}
                  />
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
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
