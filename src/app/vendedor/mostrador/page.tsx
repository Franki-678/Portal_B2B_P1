'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PosClient {
  id:        string;
  dni:       string | null;
  full_name: string;
  phone:     string | null;
  email:     string | null;
}

interface SaleItem {
  tempId:    string;
  part_name: string;
  quantity:  number;
  price:     number;
}

interface PosSale {
  id:           string;
  total_amount: number;
  status:       string;
  created_at:   string;
  closed_at:    string | null;
  client:       PosClient | null;
  items:        { part_name: string; quantity: number; price: number }[];
}

export default function MostradorPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'nueva' | 'historial'>('nueva');

  // ── Búsqueda de cliente ──────────────────────────────────────────────────
  const [searchQ,       setSearchQ]       = useState('');
  const [searching,     setSearching]     = useState(false);
  const [foundClient,   setFoundClient]   = useState<PosClient | null>(null);
  const [noClient,      setNoClient]      = useState(false);

  // ── Crear cliente ────────────────────────────────────────────────────────
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ dni: '', full_name: '', phone: '', email: '' });
  const [savingClient,  setSavingClient]  = useState(false);

  // ── Nueva venta ──────────────────────────────────────────────────────────
  const [saleItems,   setSaleItems]   = useState<SaleItem[]>([]);
  const [savingSale,  setSavingSale]  = useState(false);
  const [saleSuccess, setSaleSuccess] = useState(false);

  // ── Historial ────────────────────────────────────────────────────────────
  const [sales,       setSales]       = useState<PosSale[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const genId = () => Math.random().toString(36).slice(2, 9);

  // ── Buscar cliente ───────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setFoundClient(null);
    setNoClient(false);
    const sb = getSupabaseClient() as any;
    const q  = searchQ.trim();
    const { data } = await sb
      .from('pos_clients')
      .select('*')
      .or(`dni.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(1)
      .maybeSingle();
    setSearching(false);
    if (data) {
      setFoundClient(data as PosClient);
    } else {
      setNoClient(true);
    }
  };

  // ── Crear nuevo cliente ──────────────────────────────────────────────────
  const handleCreateClient = async () => {
    if (!newClientForm.full_name.trim()) return;
    setSavingClient(true);
    const sb = getSupabaseClient() as any;
    const { data } = await sb
      .from('pos_clients')
      .insert({
        dni:       newClientForm.dni  || null,
        full_name: newClientForm.full_name.trim(),
        phone:     newClientForm.phone || null,
        email:     newClientForm.email || null,
        created_by: user?.id,
      })
      .select()
      .single();
    setSavingClient(false);
    if (data) {
      setFoundClient(data as PosClient);
      setShowNewClient(false);
      setNoClient(false);
      setSaleItems([{ tempId: genId(), part_name: '', quantity: 1, price: 0 }]);
    }
  };

  const startSale = () => {
    setSaleItems([{ tempId: genId(), part_name: '', quantity: 1, price: 0 }]);
    setSaleSuccess(false);
  };

  const addItem = () => setSaleItems(prev => [...prev, { tempId: genId(), part_name: '', quantity: 1, price: 0 }]);
  const removeItem = (id: string) => setSaleItems(prev => prev.filter(i => i.tempId !== id));
  const updateItem = (id: string, field: keyof Omit<SaleItem, 'tempId'>, val: string | number) =>
    setSaleItems(prev => prev.map(i => i.tempId === id ? { ...i, [field]: val } : i));

  const totalVenta = saleItems.reduce((s, i) => s + (i.price * i.quantity), 0);

  const handleCerrarVenta = async () => {
    if (!foundClient || saleItems.some(i => !i.part_name.trim())) return;
    setSavingSale(true);
    const sb = getSupabaseClient() as any;
    const { data: sale } = await sb
      .from('pos_sales')
      .insert({
        client_id:    foundClient.id,
        vendor_id:    user?.id,
        total_amount: totalVenta,
        status:       'closed',
        closed_at:    new Date().toISOString(),
      })
      .select()
      .single();

    if (sale) {
      await sb.from('pos_sale_items').insert(
        saleItems.map(i => ({
          pos_sale_id: (sale as any).id,
          part_name:   i.part_name.trim(),
          quantity:    i.quantity,
          price:       i.price,
        }))
      );
    }

    setSavingSale(false);
    setSaleSuccess(true);
    setSaleItems([]);
  };

  // ── Historial ────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    const sb = getSupabaseClient() as any;
    const { data: rawSales } = await sb
      .from('pos_sales')
      .select('id, total_amount, status, created_at, closed_at, client_id')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!rawSales) { setLoadingHist(false); return; }

    const saleIds   = rawSales.map((s: any) => s.id);
    const clientIds = [...new Set(rawSales.map((s: any) => s.client_id).filter(Boolean))];

    const [itemsR, clientsR] = await Promise.all([
      sb.from('pos_sale_items').select('*').in('pos_sale_id', saleIds),
      clientIds.length > 0 ? sb.from('pos_clients').select('*').in('id', clientIds) : Promise.resolve({ data: [] }),
    ]);

    const itemsMap: Record<string, any[]> = {};
    for (const it of (itemsR.data ?? []) as any[]) {
      if (!itemsMap[it.pos_sale_id]) itemsMap[it.pos_sale_id] = [];
      itemsMap[it.pos_sale_id].push(it);
    }
    const clientMap: Record<string, PosClient> = {};
    for (const c of (clientsR.data ?? []) as any[]) clientMap[c.id] = c;

    setSales(rawSales.map((s: any) => ({
      ...s,
      client: s.client_id ? (clientMap[s.client_id] ?? null) : null,
      items:  itemsMap[s.id] ?? [],
    })));
    setLoadingHist(false);
  }, []);

  useEffect(() => { if (tab === 'historial') void loadHistory(); }, [tab, loadHistory]);

  const totalHoy = sales
    .filter(s => s.status === 'closed' && s.closed_at && new Date(s.closed_at).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + s.total_amount, 0);

  return (
    <>
      <TopBar title="🛒 Venta de Mostrador" subtitle="Ventas directas sin pedido B2B" />

      <div className="p-6 space-y-6">
        {/* Tabs */}
        <div className="flex items-end gap-0 border-b border-zinc-800/80">
          {(['nueva', 'historial'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`relative px-4 pb-3 pt-1 text-sm font-semibold transition-colors ${
                tab === t
                  ? 'text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-orange-400 after:rounded-t'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t === 'nueva' ? '🛒 Nueva Venta' : '📋 Historial'}
            </button>
          ))}
        </div>

        {/* ── TAB NUEVA VENTA ── */}
        {tab === 'nueva' && (
          <div className="space-y-6 max-w-2xl">
            {/* Buscador de cliente */}
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
              <h3 className="text-sm font-bold text-zinc-300 mb-3">1. Buscar cliente</h3>
              <div className="flex gap-2">
                <input
                  value={searchQ}
                  onChange={e => { setSearchQ(e.target.value); setFoundClient(null); setNoClient(false); }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="DNI o nombre..."
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
                />
                <Button loading={searching} onClick={handleSearch} className="shrink-0">Buscar</Button>
              </div>

              {noClient && !showNewClient && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-2.5">
                  <p className="text-sm text-amber-300">No se encontró cliente</p>
                  <Button size="sm" onClick={() => { setShowNewClient(true); setNewClientForm({ dni: searchQ, full_name: '', phone: '', email: '' }); }}
                    className="bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs">
                    + Crear cliente
                  </Button>
                </div>
              )}

              {showNewClient && (
                <div className="mt-4 space-y-3 border border-zinc-700/60 rounded-xl p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Nuevo cliente</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Nombre *" value={newClientForm.full_name} onChange={e => setNewClientForm(f => ({...f, full_name: e.target.value}))} placeholder="Juan García" />
                    <Input label="DNI" value={newClientForm.dni} onChange={e => setNewClientForm(f => ({...f, dni: e.target.value}))} placeholder="30123456" />
                    <Input label="Teléfono" value={newClientForm.phone} onChange={e => setNewClientForm(f => ({...f, phone: e.target.value}))} placeholder="11 4444-5555" />
                    <Input label="Email" value={newClientForm.email} onChange={e => setNewClientForm(f => ({...f, email: e.target.value}))} placeholder="juan@mail.com" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setShowNewClient(false)} className="flex-1 text-sm text-zinc-400 hover:text-zinc-200">Cancelar</button>
                    <Button loading={savingClient} onClick={handleCreateClient} disabled={!newClientForm.full_name.trim()} className="flex-1 text-sm">Crear cliente →</Button>
                  </div>
                </div>
              )}

              {foundClient && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-emerald-300">{foundClient.full_name}</p>
                    <p className="text-xs text-emerald-500/80">{foundClient.dni ? `DNI: ${foundClient.dni}` : ''}{foundClient.phone ? ` · ${foundClient.phone}` : ''}</p>
                  </div>
                  <span className="text-emerald-400 text-lg">✅</span>
                </div>
              )}
            </div>

            {/* Items de la venta */}
            {foundClient && !saleSuccess && (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
                <h3 className="text-sm font-bold text-zinc-300 mb-4">2. Cargar repuestos</h3>
                <div className="space-y-3">
                  {saleItems.length === 0 && (
                    <Button onClick={startSale} className="w-full" variant="secondary">+ Agregar primer ítem</Button>
                  )}
                  {saleItems.map((item, idx) => (
                    <div key={item.tempId} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        {idx === 0 && <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Repuesto</p>}
                        <input
                          value={item.part_name}
                          onChange={e => updateItem(item.tempId, 'part_name', e.target.value)}
                          placeholder="Nombre del repuesto"
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Cant.</p>}
                        <input
                          type="number" min={1}
                          value={item.quantity}
                          onChange={e => updateItem(item.tempId, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500/50 focus:outline-none text-center"
                        />
                      </div>
                      <div className="col-span-3">
                        {idx === 0 && <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Precio unit.</p>}
                        <input
                          type="number" min={0} step="0.01"
                          value={item.price || ''}
                          onChange={e => updateItem(item.tempId, 'price', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-1">
                        {idx === 0 && <div className="h-5" />}
                        <span className="text-xs text-zinc-500 truncate">{formatCurrency(item.price * item.quantity)}</span>
                        {saleItems.length > 1 && (
                          <button type="button" onClick={() => removeItem(item.tempId)} className="text-rose-400/70 hover:text-rose-400 text-xs">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {saleItems.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <button type="button" onClick={addItem} className="text-xs text-orange-400/70 hover:text-orange-300 transition-colors">+ Agregar otro ítem</button>
                    <div className="flex items-center justify-between border-t border-zinc-800/60 pt-3">
                      <span className="text-sm font-semibold text-zinc-400">Total venta</span>
                      <span className="text-xl font-black text-white">{formatCurrency(totalVenta)}</span>
                    </div>
                    <Button
                      loading={savingSale}
                      disabled={saleItems.some(i => !i.part_name.trim()) || totalVenta <= 0}
                      onClick={handleCerrarVenta}
                      size="lg"
                      className="w-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 font-bold"
                    >
                      💵 Cerrar Venta — {formatCurrency(totalVenta)}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {saleSuccess && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-6 text-center space-y-3">
                <p className="text-3xl">✅</p>
                <p className="text-lg font-bold text-emerald-300">Venta cerrada exitosamente</p>
                <Button onClick={() => { setSaleSuccess(false); setSaleItems([]); }} variant="secondary">Nueva venta al mismo cliente</Button>
                <button type="button" onClick={() => { setSaleSuccess(false); setFoundClient(null); setSearchQ(''); setSaleItems([]); }} className="block w-full text-xs text-zinc-500 hover:text-zinc-300 mt-1">Nuevo cliente</button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB HISTORIAL ── */}
        {tab === 'historial' && (
          <div className="space-y-4">
            {totalHoy > 0 && (
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/8 px-5 py-3 flex items-center justify-between">
                <p className="text-sm text-zinc-400">Facturación de hoy</p>
                <p className="text-xl font-black text-orange-300">{formatCurrency(totalHoy)}</p>
              </div>
            )}
            {loadingHist ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-zinc-900/60 animate-pulse border border-zinc-800" />)}</div>
            ) : sales.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">Sin ventas registradas aún.</div>
            ) : (
              <div className="space-y-2">
                {sales.map(sale => (
                  <div key={sale.id} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-200 truncate">{sale.client?.full_name ?? 'Sin cliente'}</p>
                        <p className="text-xs text-zinc-500">
                          {sale.items.length} ítem{sale.items.length !== 1 ? 's' : ''}
                          {sale.items.length > 0 && ` · ${sale.items.map(i => i.part_name).slice(0, 2).join(', ')}${sale.items.length > 2 ? '...' : ''}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-zinc-100">{formatCurrency(sale.total_amount)}</p>
                        <p className="text-xs text-zinc-500">{sale.closed_at ? formatDate(sale.closed_at) : formatDate(sale.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
