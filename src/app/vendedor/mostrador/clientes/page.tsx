'use client';

import { useState, useEffect, useCallback } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import { formatDate, formatCurrency } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { listClients, getClientHistory, updateClient, type PosClient, type PosClientHistory } from '@/lib/erp/mostrador';
import { useAuth } from '@/contexts/AuthContext';

export default function MostradorClientesPage() {
  const { user } = useAuth();
  const [search,     setSearch]     = useState('');
  const [clients,    setClients]    = useState<PosClient[]>([]);
  const [count,      setCount]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<PosClient | null>(null);
  const [history,    setHistory]    = useState<PosClientHistory[]>([]);
  const [orders,     setOrders]     = useState<any[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [editMode,   setEditMode]   = useState(false);
  const [editForm,   setEditForm]   = useState<Partial<PosClient>>({});
  const [saving,     setSaving]     = useState(false);
  const PER_PAGE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const { data, count: c } = await listClients(sb, { search, page, perPage: PER_PAGE });
    setClients(data);
    setCount(c);
    setLoading(false);
  }, [search, page]);

  useEffect(() => { void load(); }, [load]);

  const openClient = async (c: PosClient) => {
    setSelected(c);
    setEditMode(false);
    setEditForm({});
    setLoadingPanel(true);
    const sb = getSupabaseClient() as any;
    const [hist, rawOrders] = await Promise.all([
      getClientHistory(sb, c.id),
      sb.from('pos_orders')
        .select('id, total_amount, status, created_at, vehicle_details, pos_order_items(part_name, quantity, unit_price)')
        .eq('client_id', c.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setHistory(hist);
    setOrders(rawOrders.data ?? []);
    setLoadingPanel(false);
  };

  const handleSaveEdit = async () => {
    if (!selected || !user) return;
    setSaving(true);
    const sb = getSupabaseClient();
    await updateClient(sb, selected.id, editForm, user.id, selected);
    setSaving(false);
    setEditMode(false);
    // Actualizar objeto local
    setSelected({ ...selected, ...editForm });
    await load();
  };

  const totalPages = Math.ceil(count / PER_PAGE);

  return (
    <>
      <TopBar title="👤 Clientes Mostrador" subtitle={`${count} clientes registrados`} />
      <div className="flex h-full min-h-0" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Columna izquierda: lista */}
        <div className="flex flex-col border-r border-zinc-800/80 w-96 shrink-0">
          <div className="p-4 border-b border-zinc-800/60">
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar por nombre o DNI..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl bg-zinc-900/60 animate-pulse" />)}</div>
            ) : clients.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">Sin clientes{search ? ` para "${search}"` : ''}</div>
            ) : (
              <div className="divide-y divide-zinc-800/40">
                {clients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openClient(c)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      selected?.id === c.id
                        ? 'bg-orange-500/10 border-l-2 border-orange-500/50'
                        : 'hover:bg-zinc-800/40 border-l-2 border-transparent'
                    }`}
                  >
                    <p className="font-semibold text-sm text-zinc-200">{c.full_name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {c.dni ? `DNI: ${c.dni}` : 'Sin DNI'}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Desde {formatDate(c.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/60 bg-zinc-950/30">
              <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
                className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40">← Ant.</button>
              <span className="text-xs text-zinc-500">{page + 1} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40">Sig. →</button>
            </div>
          )}
        </div>

        {/* Panel derecho: detalle */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              <p>← Seleccioná un cliente para ver el detalle</p>
            </div>
          ) : (
            <div className="p-6 space-y-6 max-w-2xl">
              {/* Header del cliente */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-zinc-100">{selected.full_name}</h2>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    {selected.dni ? `DNI: ${selected.dni}` : 'Sin DNI'}
                    {selected.phone ? ` · ${selected.phone}` : ''}
                    {selected.email ? ` · ${selected.email}` : ''}
                  </p>
                  {selected.address && <p className="text-xs text-zinc-500 mt-1">📍 {selected.address}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setEditMode(!editMode); setEditForm({ dni: selected.dni ?? '', full_name: selected.full_name, phone: selected.phone ?? '', email: selected.email ?? '', address: selected.address ?? '' }); }}>
                  {editMode ? 'Cancelar' : '✏️ Editar'}
                </Button>
              </div>

              {/* Formulario edición */}
              {editMode && (
                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400/70">Editar datos del cliente</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Nombre" value={editForm.full_name ?? ''} onChange={e => setEditForm(f => ({...f, full_name: e.target.value}))} />
                    <Input label="DNI" value={editForm.dni ?? ''} onChange={e => setEditForm(f => ({...f, dni: e.target.value}))} />
                    <Input label="Teléfono" value={editForm.phone ?? ''} onChange={e => setEditForm(f => ({...f, phone: e.target.value}))} />
                    <Input label="Email" value={editForm.email ?? ''} onChange={e => setEditForm(f => ({...f, email: e.target.value}))} />
                  </div>
                  <Input label="Dirección" value={editForm.address ?? ''} onChange={e => setEditForm(f => ({...f, address: e.target.value}))} />
                  <Button loading={saving} onClick={handleSaveEdit} className="bg-orange-600/20 border border-orange-500/40 text-orange-300">Guardar cambios</Button>
                </div>
              )}

              {loadingPanel ? (
                <div className="h-32 animate-pulse rounded-2xl bg-zinc-900/60 border border-zinc-800" />
              ) : (
                <>
                  {/* Historial de compras */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                      Historial de ventas ({orders.length})
                      {orders.length > 0 && (
                        <span className="ml-2 text-orange-400/70 normal-case">
                          Total: {formatCurrency(orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0))}
                        </span>
                      )}
                    </h3>
                    {orders.length === 0 ? (
                      <p className="text-xs text-zinc-600 py-2">Sin compras registradas</p>
                    ) : (
                      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden divide-y divide-zinc-800/40">
                        {orders.map((o: any) => {
                          const veh = o.vehicle_details;
                          return (
                            <div key={o.id} className="px-4 py-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                {veh && <p className="text-xs text-zinc-400">{veh.brand} {veh.model} {veh.year}</p>}
                                <p className="text-[10px] text-zinc-600">
                                  {(o.pos_order_items ?? []).slice(0, 2).map((i: any) => i.part_name).join(', ')}
                                  {(o.pos_order_items ?? []).length > 2 ? '...' : ''}
                                </p>
                                <p className="text-[10px] text-zinc-600">{formatDate(o.created_at)}</p>
                              </div>
                              <p className="font-black text-zinc-200 shrink-0">{formatCurrency(Number(o.total_amount) || 0)}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Historial de modificaciones del perfil */}
                  {history.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Cambios en el perfil</h3>
                      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden divide-y divide-zinc-800/40">
                        {history.map(h => (
                          <div key={h.id} className="px-4 py-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-zinc-400">{(h.profile as any)?.name ?? 'Usuario'}</span>
                              <span className="text-[10px] text-zinc-600">{formatDate(h.changed_at)}</span>
                            </div>
                            {Object.entries(h.field_changes).map(([field, change]) => (
                              <p key={field} className="text-[10px] text-zinc-500">
                                <span className="text-zinc-400 font-semibold">{field}:</span>{' '}
                                <span className="line-through text-rose-400/60">{String((change as any).old ?? '—')}</span>
                                {' → '}
                                <span className="text-emerald-400/70">{String((change as any).new ?? '—')}</span>
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
