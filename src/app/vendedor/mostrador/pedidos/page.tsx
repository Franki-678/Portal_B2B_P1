'use client';

import { useState, useEffect, useCallback } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/FormFields';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { listOrders, getOrderWithItems, updateOrder, type PosOrder } from '@/lib/erp/mostrador';

const STATUS_LABELS: Record<string, string> = { open: 'Abierta', closed: 'Cerrada', cancelled: 'Cancelada' };
const STATUS_COLORS: Record<string, string> = {
  open:      'bg-amber-500/10 border-amber-500/20 text-amber-300',
  closed:    'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  cancelled: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400',
};

export default function MostradorPedidosPage() {
  const { user } = useAuth();

  const [orders,   setOrders]   = useState<PosOrder[]>([]);
  const [count,    setCount]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<PosOrder | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // Filtros — default: hoy
  const today = () => new Date().toISOString().slice(0, 10);
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterVendor,  setFilterVendor]  = useState('');
  const [filterFrom,    setFilterFrom]    = useState(today);
  const [filterTo,      setFilterTo]      = useState(today);
  const [searchText,    setSearchText]    = useState('');
  const [noDateFilter,  setNoDateFilter]  = useState(false);  // historial completo
  const [page,          setPage]          = useState(0);
  const PER_PAGE = 25;

  // Cuando el usuario busca por texto → auto-deshabilitar fechas
  const handleSearchText = (val: string) => {
    setSearchText(val);
    if (val.trim().length > 0 && !noDateFilter) setNoDateFilter(true);
    if (val.trim().length === 0 && noDateFilter) {
      setNoDateFilter(false);
      setFilterFrom(today());
      setFilterTo(today());
    }
    setPage(0);
  };

  const effectiveDateFrom = noDateFilter ? undefined : (filterFrom || undefined);
  const effectiveDateTo   = noDateFilter ? undefined : (filterTo ? filterTo + 'T23:59:59Z' : undefined);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const { data, count: c } = await listOrders(sb, {
      status:   filterStatus || undefined,
      vendorId: (filterVendor && user?.role !== 'admin') ? user?.id : (filterVendor || undefined),
      dateFrom: effectiveDateFrom,
      dateTo:   effectiveDateTo,
      page,
      perPage:  PER_PAGE,
    });
    setOrders(data);
    setCount(c);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterVendor, filterFrom, filterTo, noDateFilter, page, user]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (o: PosOrder) => {
    setSelected(null);
    setEditMode(false);
    setLoadingDetail(true);
    const sb = getSupabaseClient();
    const detail = await getOrderWithItems(sb, o.id);
    setSelected(detail);
    setLoadingDetail(false);
  };

  const handleSaveEdit = async () => {
    if (!selected || !user) return;
    setSaving(true);
    const sb = getSupabaseClient();
    await updateOrder(sb, selected.id, { notes: editNotes }, user.id);
    setSelected({ ...selected, notes: editNotes });
    setSaving(false);
    setEditMode(false);
    await load();
  };

  const totalPages = Math.ceil(count / PER_PAGE);
  const facturadoTotal = orders.reduce((s, o) => s + o.total_amount, 0);

  // Filtrado client-side por búsqueda libre
  const filtered = searchText.trim()
    ? orders.filter(o =>
        o.client?.full_name.toLowerCase().includes(searchText.toLowerCase()) ||
        (o.vehicle_details?.brand ?? '').toLowerCase().includes(searchText.toLowerCase()) ||
        (o.vehicle_details?.model ?? '').toLowerCase().includes(searchText.toLowerCase())
      )
    : orders;

  return (
    <>
      <TopBar
        title="🧾 Ventas Mostrador"
        subtitle={`${count} ventas · Facturado visible: ${formatCurrency(facturadoTotal)}`}
      />
      <div className="flex h-full min-h-0" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Lista con filtros */}
        <div className="flex flex-col w-[55%] border-r border-zinc-800/80">
          {/* Filtros */}
          <div className="p-4 border-b border-zinc-800/60 space-y-2">
            {/* Búsqueda libre */}
            <input
              value={searchText}
              onChange={e => handleSearchText(e.target.value)}
              placeholder="🔍 Buscar por cliente, vehículo..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
                className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
              >
                <option value="">Todos los estados</option>
                <option value="open">Abierta</option>
                <option value="closed">Cerrada</option>
                <option value="cancelled">Cancelada</option>
              </select>
              <input
                type="date"
                value={noDateFilter ? '' : filterFrom}
                disabled={noDateFilter}
                onChange={e => { setFilterFrom(e.target.value); setPage(0); }}
                className={`rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-300 focus:outline-none ${noDateFilter ? 'opacity-40 cursor-not-allowed' : ''}`}
              />
              <input
                type="date"
                value={noDateFilter ? '' : filterTo}
                disabled={noDateFilter}
                onChange={e => { setFilterTo(e.target.value); setPage(0); }}
                className={`rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-300 focus:outline-none ${noDateFilter ? 'opacity-40 cursor-not-allowed' : ''}`}
              />
            </div>
            {/* Toggle historial */}
            <label className="flex items-center gap-2 cursor-pointer group w-fit">
              <input
                type="checkbox"
                checked={noDateFilter}
                onChange={e => {
                  setNoDateFilter(e.target.checked);
                  if (!e.target.checked) { setFilterFrom(today()); setFilterTo(today()); }
                  setPage(0);
                }}
                className="w-3.5 h-3.5 rounded accent-orange-500"
              />
              <span className="text-[11px] text-zinc-500 group-hover:text-zinc-300 transition-colors font-medium select-none">
                Ver historial completo (sin filtro de fechas)
              </span>
            </label>
          </div>

          {/* Tabla */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl bg-zinc-900/60 animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">Sin ventas para los filtros seleccionados</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur-sm">
                  <tr className="border-b border-zinc-800/60">
                    {['Fecha', 'Cliente', 'Vehículo', 'Total', 'Vendedor', 'Estado'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/30">
                  {filtered.map(o => (
                    <tr
                      key={o.id}
                      onClick={() => openDetail(o)}
                      className={`cursor-pointer transition-colors ${
                        selected?.id === o.id ? 'bg-orange-500/10' : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <td className="px-3 py-3 text-xs text-zinc-400 whitespace-nowrap">{formatDate(o.created_at)}</td>
                      <td className="px-3 py-3">
                        <p className="text-xs font-semibold text-zinc-200 truncate max-w-[100px]">{o.client?.full_name ?? '—'}</p>
                        {o.client?.phone && <p className="text-[10px] text-zinc-600">{o.client.phone}</p>}
                      </td>
                      <td className="px-3 py-3 text-xs text-zinc-400">
                        {o.vehicle_details ? `${o.vehicle_details.brand} ${o.vehicle_details.model}` : '—'}
                      </td>
                      <td className="px-3 py-3 font-bold text-zinc-200 text-xs">{formatCurrency(o.total_amount)}</td>
                      <td className="px-3 py-3 text-xs text-zinc-500 truncate max-w-[80px]">{(o.vendor as any)?.name ?? '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STATUS_COLORS[o.status] ?? ''}`}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/60 bg-zinc-950/30">
              <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40">← Ant.</button>
              <span className="text-xs text-zinc-500">{page + 1} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40">Sig. →</button>
            </div>
          )}
        </div>

        {/* Panel de detalle */}
        <div className="flex-1 overflow-y-auto">
          {loadingDetail ? (
            <div className="p-6"><div className="h-48 animate-pulse rounded-2xl bg-zinc-900/60 border border-zinc-800" /></div>
          ) : !selected ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm"><p>← Seleccioná una venta</p></div>
          ) : (
            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-black text-lg text-zinc-100">{selected.client?.full_name ?? 'Sin cliente'}</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{formatDateTime(selected.created_at)} · {(selected.vendor as any)?.name ?? '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${STATUS_COLORS[selected.status] ?? ''}`}>
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </span>
                  {user?.role === 'admin' && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditMode(!editMode); setEditNotes(selected.notes ?? ''); }}>
                      ✏️ Modificar
                    </Button>
                  )}
                </div>
              </div>

              {/* Vehículo */}
              {selected.vehicle_details && (
                <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Vehículo</p>
                  <p className="text-sm font-semibold text-zinc-200">
                    {selected.vehicle_details.brand} {selected.vehicle_details.model} {selected.vehicle_details.year}
                  </p>
                  {selected.vehicle_details.engine && <p className="text-xs text-zinc-400">Motor: {selected.vehicle_details.engine}</p>}
                  {selected.vehicle_details.plate  && <p className="text-xs text-zinc-400">Patente: {selected.vehicle_details.plate}</p>}
                </div>
              )}

              {/* Ítems */}
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Repuestos / Servicios</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/40">
                      <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-600">Repuesto</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-600">Cant.</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-600">P. Unit.</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-600">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/30">
                    {(selected.items ?? []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-zinc-200">{item.part_name}</p>
                          {item.description && <p className="text-[10px] text-zinc-500">{item.description}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{item.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{formatCurrency(item.unit_price)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-zinc-200">{formatCurrency(item.subtotal ?? item.quantity * item.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-800/60">
                      <td colSpan={3} className="px-4 py-3 text-right font-bold text-zinc-400 text-xs uppercase tracking-wider">TOTAL</td>
                      <td className="px-4 py-3 text-right font-black text-lg text-white">{formatCurrency(selected.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Edición admin */}
              {editMode && (
                <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-400/70">Modificar pedido (Admin)</p>
                  <Textarea label="Notas" value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} placeholder="Observaciones adicionales..." />
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancelar</Button>
                    <Button size="sm" loading={saving} onClick={handleSaveEdit} className="bg-orange-600/20 border border-orange-500/40 text-orange-300">Guardar</Button>
                  </div>
                </div>
              )}

              {selected.notes && !editMode && (
                <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Notas</p>
                  <p className="text-xs text-zinc-400">{selected.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
