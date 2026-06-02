'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormFields';
import { formatCurrency } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchVehiclesCatalog } from '@/lib/supabase/queries';
import {
  searchClients, createClient, updateClient, createOrder,
  type PosClient, type PosVehicleDetails,
} from '@/lib/erp/mostrador';

// ── Catálogo cache module-level ────────────────────────────────────────────
type CatalogType = Record<string, Record<string, Record<string, string[]>>>;
let _cat: CatalogType | null = null;
let _catP: Promise<CatalogType> | null = null;
function getCatalog(sb: ReturnType<typeof getSupabaseClient>): Promise<CatalogType> {
  if (_cat) return Promise.resolve(_cat);
  if (_catP) return _catP;
  _catP = fetchVehiclesCatalog(sb).then(c => { _cat = c; return c; });
  return _catP;
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ItemRow { id: string; sku: string; part_name: string; description: string; quantity: number; unit_price: number }
const mkItem = (): ItemRow => ({ id: Math.random().toString(36).slice(2), sku: '', part_name: '', description: '', quantity: 1, unit_price: 0 });

type VehicleMode = 'catalog' | 'freetext' | 'none';

// ── Componente ─────────────────────────────────────────────────────────────
export default function NuevaVentaPosPage() {
  const { user } = useAuth();

  // ── Catálogo ────────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<Record<string, Record<string, Record<string, string[]>>>>({});
  const [catalogReady, setCatalogReady] = useState(false);
  useEffect(() => {
    const sb = getSupabaseClient();
    getCatalog(sb).then(c => { setCatalog(c); setCatalogReady(true); });
  }, []);

  // ── Vehículo ─────────────────────────────────────────────────────────────
  const [vehicleMode, setVehicleMode] = useState<VehicleMode>('catalog');
  const [selBrand,   setSelBrand]   = useState('');
  const [selModel,   setSelModel]   = useState('');
  const [selYear,    setSelYear]    = useState('');
  const [selVersion, setSelVersion] = useState('');
  const [freeVehicle, setFreeVehicle] = useState<PosVehicleDetails>({ brand: '', model: '', year: '', engine: '', plate: '' });

  const brands   = useMemo(() => Object.keys(catalog).sort(), [catalog]);
  const models   = useMemo(() => selBrand ? Object.keys(catalog[selBrand] ?? {}).sort() : [], [catalog, selBrand]);
  const years    = useMemo(() => (selBrand && selModel) ? Object.keys(catalog[selBrand]?.[selModel] ?? {}).sort((a, b) => Number(b) - Number(a)) : [], [catalog, selBrand, selModel]);
  const versions = useMemo(() => (selBrand && selModel && selYear) ? (catalog[selBrand]?.[selModel]?.[selYear] ?? []) : [], [catalog, selBrand, selModel, selYear]);

  const vehicleDetails = useMemo((): PosVehicleDetails | null => {
    if (vehicleMode === 'none') return null;
    if (vehicleMode === 'freetext') return Object.values(freeVehicle).some(v => v.trim()) ? freeVehicle : null;
    if (selBrand) return { brand: selBrand, model: selModel, year: selYear, engine: selVersion, plate: '' };
    return null;
  }, [vehicleMode, selBrand, selModel, selYear, selVersion, freeVehicle]);

  // ── Ítems ─────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ItemRow[]>([mkItem()]);
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const validItems = items.filter(i => i.part_name.trim() && i.unit_price > 0);

  // ── Cliente ───────────────────────────────────────────────────────────────
  const [foundClient,  setFoundClient]  = useState<PosClient | null>(null);
  const [clientData,   setClientData]   = useState({ dni: '', full_name: '', phone: '', email: '', address: '' });
  const [clientEdited, setClientEdited] = useState(false); // campos editados sobre cliente buscado

  // Búsqueda inline (sin modal)
  const [searchQ,    setSearchQ]    = useState('');
  const [results,    setResults]    = useState<PosClient[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [showDrop,   setShowDrop]   = useState(false);
  const searchRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBox  = useRef<HTMLDivElement>(null);

  const handleSearchInput = (q: string) => {
    setSearchQ(q);
    setShowDrop(true);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    // 200ms debounce — más rápido
    searchRef.current = setTimeout(async () => {
      const sb = getSupabaseClient();
      const res = await searchClients(sb, q, 6);
      setResults(res);
      setSearching(false);
    }, 200);
  };

  const selectClient = (c: PosClient) => {
    setFoundClient(c);
    setClientData({ dni: c.dni ?? '', full_name: c.full_name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' });
    setClientEdited(false);
    setSearchQ('');
    setResults([]);
    setShowDrop(false);
  };

  const clearClient = () => {
    setFoundClient(null);
    setClientData({ dni: '', full_name: '', phone: '', email: '', address: '' });
    setClientEdited(false);
  };

  // Cerrar dropdown al click afuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBox.current && !searchBox.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Guardar ────────────────────────────────────────────────────────────────
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [errMsg,  setErrMsg]  = useState<string | null>(null);
  const canSave = validItems.length > 0;

  const handleSave = async () => {
    if (!canSave || !user) return;
    setSaving(true); setErrMsg(null);
    const sb = getSupabaseClient();
    try {
      let clientId: string | null = null;

      if (foundClient) {
        clientId = foundClient.id;
        if (clientEdited) {
          // Solo actualizamos los campos editables (NO full_name)
          await updateClient(sb, foundClient.id, {
            dni:     clientData.dni     || null,
            phone:   clientData.phone   || null,
            email:   clientData.email   || null,
            address: clientData.address || null,
          }, user.id, foundClient);
        }
      } else if (clientData.full_name.trim()) {
        const newC = await createClient(sb, {
          dni:        clientData.dni     || null,
          full_name:  clientData.full_name.trim(),
          phone:      clientData.phone   || null,
          email:      clientData.email   || null,
          address:    clientData.address || null,
          notes:      null,
          created_by: user.id,
        }, user.id);
        clientId = newC?.id ?? null;
      }

      await createOrder(sb, { clientId, vendorId: user.id, vehicleDetails, items: validItems, notes: '' });
      setSuccess(true);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setVehicleMode('catalog'); setSelBrand(''); setSelModel(''); setSelYear(''); setSelVersion('');
    setFreeVehicle({ brand: '', model: '', year: '', engine: '', plate: '' });
    setItems([mkItem()]);
    clearClient(); setSuccess(false); setErrMsg(null);
  };

  // ── Success ────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <>
        <TopBar title="🛒 Nueva Venta" />
        <div className="p-6 max-w-lg">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-8 text-center space-y-4">
            <p className="text-4xl">✅</p>
            <h2 className="text-xl font-bold text-emerald-300">Venta registrada</h2>
            <p className="text-emerald-400/70 text-sm">Total: <span className="font-black text-emerald-300">{formatCurrency(total)}</span></p>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleReset} className="flex-1" variant="secondary">Nueva venta</Button>
              <Button onClick={() => window.location.href='/vendedor/mostrador/pedidos'} className="flex-1">Ver ventas →</Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar title="🛒 Nueva Venta Mostrador" subtitle="Cargá el vehículo, los repuestos y el cliente" />

      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-6xl">

        {/* ══ COLUMNA IZQUIERDA ══ */}
        <div className="space-y-5">

          {/* ── Vehículo ── */}
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">🚗 Vehículo</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vehicleMode === 'none'}
                    onChange={e => setVehicleMode(e.target.checked ? 'none' : 'catalog')}
                    className="w-3.5 h-3.5 rounded accent-orange-500"
                  />
                  <span className="text-[11px] text-zinc-400 font-medium">Sin vehículo</span>
                </label>
                {vehicleMode !== 'none' && vehicleMode === 'catalog' && (
                  <button
                    type="button"
                    onClick={() => setVehicleMode('freetext')}
                    className="text-[11px] text-orange-400/70 hover:text-orange-300 font-semibold transition-colors"
                  >
                    ✏️ Mi vehículo no aparece
                  </button>
                )}
                {vehicleMode === 'freetext' && (
                  <button
                    type="button"
                    onClick={() => { setVehicleMode('catalog'); setFreeVehicle({ brand: '', model: '', year: '', engine: '', plate: '' }); }}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    ← Usar catálogo
                  </button>
                )}
              </div>
            </div>

            {vehicleMode === 'none' && (
              <div className="px-5 py-4 text-center text-sm text-zinc-500">Esta venta no requiere datos de vehículo.</div>
            )}

            {vehicleMode === 'catalog' && (
              <div className="p-5 space-y-4">
                {!catalogReady ? (
                  <div className="h-10 animate-pulse rounded-xl bg-zinc-800/60" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Select
                        label="Marca"
                        value={selBrand}
                        onChange={e => { setSelBrand(e.target.value); setSelModel(''); setSelYear(''); setSelVersion(''); }}
                        options={[{ value: '', label: '— Seleccioná —' }, ...brands.map(b => ({ value: b, label: b }))]}
                      />
                      <Select
                        label="Modelo"
                        value={selModel}
                        disabled={!selBrand}
                        onChange={e => { setSelModel(e.target.value); setSelYear(''); setSelVersion(''); }}
                        options={[{ value: '', label: selBrand ? '— Seleccioná —' : '(primero marca)' }, ...models.map(m => ({ value: m, label: m }))]}
                      />
                      <Select
                        label="Año"
                        value={selYear}
                        disabled={!selModel}
                        onChange={e => { setSelYear(e.target.value); setSelVersion(''); }}
                        options={[{ value: '', label: selModel ? '— Seleccioná —' : '(primero modelo)' }, ...years.map(y => ({ value: y, label: y }))]}
                      />
                      <Select
                        label="Versión / Motor"
                        value={selVersion}
                        disabled={!selYear}
                        onChange={e => setSelVersion(e.target.value)}
                        options={[{ value: '', label: selYear ? '— Seleccioná —' : '(primero año)' }, ...versions.map(v => ({ value: v, label: v }))]}
                      />
                    </div>
                    <Input label="Patente (opcional)" value={freeVehicle.plate} onChange={e => setFreeVehicle(f => ({...f, plate: e.target.value}))} placeholder="AB 123 CD" />
                  </>
                )}
              </div>
            )}

            {vehicleMode === 'freetext' && (
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-[11px] text-amber-400/70 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2">
                  <span>✏️</span>
                  <span>Modo texto libre. Los datos no se vinculan al catálogo.</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Marca" value={freeVehicle.brand}  onChange={e => setFreeVehicle(f => ({...f, brand:  e.target.value}))} placeholder="Toyota" />
                  <Input label="Modelo" value={freeVehicle.model} onChange={e => setFreeVehicle(f => ({...f, model:  e.target.value}))} placeholder="Corolla" />
                  <Input label="Año"    value={freeVehicle.year}  onChange={e => setFreeVehicle(f => ({...f, year:   e.target.value}))} placeholder="2020" />
                  <Input label="Motor / Versión" value={freeVehicle.engine} onChange={e => setFreeVehicle(f => ({...f, engine: e.target.value}))} placeholder="1.8 VVT-i" />
                  <Input label="Patente" value={freeVehicle.plate} onChange={e => setFreeVehicle(f => ({...f, plate: e.target.value}))} placeholder="AB 123 CD" className="col-span-2" />
                </div>
              </div>
            )}
          </section>

          {/* ── Repuestos ── */}
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">🔩 Repuestos / Servicios</h2>
              <button type="button" onClick={() => setItems(p => [...p, mkItem()])} className="text-xs text-orange-400/70 hover:text-orange-300 font-semibold">+ Agregar ítem</button>
            </div>

            {/* Encabezado de columnas */}
            <div className="grid grid-cols-12 gap-1.5 px-4 pt-3 pb-1">
              {['SKU', 'Repuesto / Servicio', 'Cant.', 'Precio', ''].map((h, i) => (
                <div key={i} className={`text-[9px] font-bold uppercase tracking-widest text-zinc-600 ${i === 0 ? 'col-span-2' : i === 1 ? 'col-span-4' : i === 2 ? 'col-span-1' : i === 3 ? 'col-span-2' : 'col-span-3 text-right'}`}>{h}</div>
              ))}
            </div>

            <div className="divide-y divide-zinc-800/30">
              {items.map((item, idx) => (
                <div key={item.id} className="px-4 py-2.5 space-y-1.5">
                  {/* Fila principal */}
                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    {/* SKU */}
                    <input
                      value={item.sku}
                      onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, sku: e.target.value} : x))}
                      placeholder="SKU"
                      className="col-span-2 rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:border-orange-500/40 focus:outline-none font-mono"
                    />
                    {/* Nombre */}
                    <input
                      value={item.part_name}
                      onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, part_name: e.target.value} : x))}
                      placeholder="Nombre del repuesto *"
                      className="col-span-4 rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-orange-500/40 focus:outline-none"
                    />
                    {/* Cant */}
                    <input
                      type="number" min={1}
                      value={item.quantity}
                      onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, quantity: Math.max(1, parseInt(e.target.value) || 1)} : x))}
                      className="col-span-1 rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-2 py-1.5 text-xs text-zinc-100 focus:border-orange-500/40 focus:outline-none text-center"
                    />
                    {/* Precio */}
                    <input
                      type="number" min={0} step="0.01"
                      value={item.unit_price || ''}
                      onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, unit_price: parseFloat(e.target.value) || 0} : x))}
                      placeholder="0"
                      className="col-span-2 rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-orange-500/40 focus:outline-none text-right"
                    />
                    {/* Subtotal + eliminar */}
                    <div className="col-span-3 flex items-center justify-end gap-2">
                      <span className="text-xs font-bold text-zinc-300">{formatCurrency(item.quantity * item.unit_price)}</span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => setItems(p => p.filter((_, i) => i !== idx))} className="text-rose-400/50 hover:text-rose-400 text-xs w-4">✕</button>
                      )}
                    </div>
                  </div>
                  {/* Descripción */}
                  <input
                    value={item.description}
                    onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, description: e.target.value} : x))}
                    placeholder="Descripción adicional (opcional)"
                    className="w-full rounded-lg border border-zinc-700/30 bg-zinc-900/40 px-2.5 py-1 text-[11px] text-zinc-500 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/60 bg-zinc-950/30">
              <span className="text-xs font-semibold text-zinc-500">TOTAL ({validItems.length} ítem{validItems.length !== 1 ? 's' : ''})</span>
              <span className="text-xl font-black text-white">{formatCurrency(total)}</span>
            </div>
          </section>
        </div>

        {/* ══ COLUMNA DERECHA ══ */}
        <div className="space-y-5">

          {/* ── Cliente ── */}
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">👤 Cliente</h2>
            </div>
            <div className="p-5 space-y-4">

              {/* Búsqueda inline */}
              <div ref={searchBox} className="relative">
                <div className="relative">
                  <input
                    value={searchQ}
                    onChange={e => handleSearchInput(e.target.value)}
                    onFocus={() => searchQ && setShowDrop(true)}
                    placeholder="🔍 Buscar cliente por nombre o DNI..."
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-orange-500/50 focus:outline-none"
                  />
                  {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">buscando...</span>}
                </div>

                {showDrop && (searchQ.trim().length > 0) && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-20 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
                    {results.length === 0 && !searching ? (
                      <div className="px-4 py-3 text-xs text-zinc-500 text-center">Sin resultados para "{searchQ}"</div>
                    ) : (
                      results.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); selectClient(c); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-orange-500/10 transition-colors border-b border-zinc-800/50 last:border-0"
                        >
                          <p className="text-sm font-semibold text-zinc-200">{c.full_name}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            {c.dni ? `DNI: ${c.dni}` : 'Sin DNI'}
                            {c.phone ? ` · ${c.phone}` : ''}
                            {c.email ? ` · ${c.email}` : ''}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Cliente seleccionado */}
              {foundClient && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2">
                  <div>
                    <p className="text-xs font-bold text-emerald-300">✓ Cliente encontrado</p>
                    <p className="text-[11px] text-emerald-400/70">{foundClient.full_name}</p>
                  </div>
                  <button type="button" onClick={clearClient} className="text-[10px] text-zinc-500 hover:text-rose-400 transition-colors font-semibold">
                    Desvincular
                  </button>
                </div>
              )}

              {/* Campos del cliente */}
              <div className="grid grid-cols-2 gap-3">
                {/* Nombre: bloqueado si hay cliente seleccionado */}
                <div className="col-span-2 relative">
                  <Input
                    label={foundClient ? 'Nombre completo (bloqueado)' : 'Nombre completo *'}
                    value={clientData.full_name}
                    onChange={e => !foundClient && setClientData(d => ({...d, full_name: e.target.value}))}
                    readOnly={!!foundClient}
                    className={foundClient ? 'opacity-60 cursor-not-allowed bg-zinc-950/60' : ''}
                    placeholder="Nombre del cliente"
                  />
                  {foundClient && (
                    <div className="absolute right-3 top-7 flex items-center gap-1 text-[10px] text-zinc-600">
                      <span>🔒</span>
                    </div>
                  )}
                </div>
                <Input label="DNI"
                  value={clientData.dni}
                  onChange={e => { setClientData(d => ({...d, dni: e.target.value})); if (foundClient) setClientEdited(true); }}
                  placeholder="30123456" />
                <Input label="Teléfono"
                  value={clientData.phone}
                  onChange={e => { setClientData(d => ({...d, phone: e.target.value})); if (foundClient) setClientEdited(true); }}
                  placeholder="11 4444-5555" />
                <Input label="Email"
                  value={clientData.email}
                  onChange={e => { setClientData(d => ({...d, email: e.target.value})); if (foundClient) setClientEdited(true); }}
                  placeholder="cliente@mail.com"
                  className="col-span-2" />
                <Input label="Dirección"
                  value={clientData.address}
                  onChange={e => { setClientData(d => ({...d, address: e.target.value})); if (foundClient) setClientEdited(true); }}
                  placeholder="Av. Corrientes 1234"
                  className="col-span-2" />
              </div>

              {clientEdited && foundClient && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-300">
                  <span>⚠️</span>
                  <span>Los datos editados <strong>se guardarán en el perfil del cliente</strong> al cerrar la venta. El nombre no puede cambiarse desde aquí.</span>
                </div>
              )}
            </div>
          </section>

          {/* ── Guardar ── */}
          {errMsg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errMsg}</div>
          )}

          <Button
            loading={saving}
            disabled={!canSave}
            onClick={handleSave}
            size="lg"
            className="w-full bg-orange-600/20 border border-orange-500/40 text-orange-300 hover:bg-orange-600/30 font-bold text-base"
          >
            💵 Cerrar Venta — {formatCurrency(total)}
          </Button>

          {!canSave && (
            <p className="text-[11px] text-zinc-600 text-center">Agregá al menos un repuesto con precio para continuar</p>
          )}
        </div>
      </div>
    </>
  );
}
