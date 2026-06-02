'use client';

import { useState, useCallback, useRef } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/FormFields';
import { formatCurrency } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { searchClients, createClient, updateClient, createOrder, type PosClient, type PosVehicleDetails, type PosOrderItem } from '@/lib/erp/mostrador';

interface ItemRow { id: string; part_name: string; description: string; quantity: number; unit_price: number }

const mkItem = (): ItemRow => ({ id: Math.random().toString(36).slice(2), part_name: '', description: '', quantity: 1, unit_price: 0 });

export default function NuevaVentaPosPage() {
  const { user } = useAuth();

  // ── Vehículo ──────────────────────────────────────────────────────────────
  const [vehicle, setVehicle] = useState<PosVehicleDetails>({ brand: '', model: '', year: '', engine: '', plate: '' });

  // ── Ítems ─────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ItemRow[]>([mkItem()]);

  // ── Cliente ───────────────────────────────────────────────────────────────
  const [clientData, setClientData]  = useState({ dni: '', full_name: '', phone: '', email: '', address: '' });
  const [foundClient, setFoundClient] = useState<PosClient | null>(null);
  const [clientDirty, setClientDirty] = useState(false);  // si se editó algún campo del cliente buscado

  // ── Modal búsqueda de clientes ────────────────────────────────────────────
  const [showSearch,  setShowSearch]  = useState(false);
  const [searchQ,     setSearchQ]     = useState('');
  const [searchResults, setResults]   = useState<PosClient[]>([]);
  const [searching,   setSearching]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (q: string) => {
    setSearchQ(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      setSearching(true);
      const sb = getSupabaseClient();
      const res = await searchClients(sb, q);
      setResults(res);
      setSearching(false);
    }, 300);
  };

  const selectClient = (c: PosClient) => {
    setFoundClient(c);
    setClientData({ dni: c.dni ?? '', full_name: c.full_name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' });
    setClientDirty(false);
    setShowSearch(false);
    setSearchQ('');
    setResults([]);
  };

  // ── Guardar pedido ────────────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [errMsg,   setErrMsg]   = useState<string | null>(null);

  const validItems    = items.filter(i => i.part_name.trim() && i.unit_price > 0);
  const total         = validItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const canSave       = validItems.length > 0 && clientData.full_name.trim();

  const handleSave = async () => {
    if (!canSave || !user) return;
    setSaving(true);
    setErrMsg(null);
    const sb = getSupabaseClient();

    try {
      let clientId: string | null = null;

      if (foundClient) {
        clientId = foundClient.id;
        // Actualizar datos del cliente si fueron modificados
        if (clientDirty) {
          await updateClient(sb, foundClient.id, {
            dni:     clientData.dni || null,
            phone:   clientData.phone || null,
            email:   clientData.email || null,
            address: clientData.address || null,
          }, user.id, foundClient);
        }
      } else if (clientData.full_name.trim()) {
        // Crear nuevo cliente
        const newClient = await createClient(sb, {
          dni:        clientData.dni || null,
          full_name:  clientData.full_name.trim(),
          phone:      clientData.phone || null,
          email:      clientData.email || null,
          address:    clientData.address || null,
          notes:      null,
          created_by: user.id,
        }, user.id);
        clientId = newClient?.id ?? null;
      }

      const vehicleDetails = Object.values(vehicle).some(v => v.trim())
        ? vehicle
        : null;

      await createOrder(sb, {
        clientId,
        vendorId:       user.id,
        vehicleDetails,
        items:          validItems,
        notes:          '',
      });

      setSuccess(true);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Error al guardar la venta');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setVehicle({ brand: '', model: '', year: '', engine: '', plate: '' });
    setItems([mkItem()]);
    setClientData({ dni: '', full_name: '', phone: '', email: '', address: '' });
    setFoundClient(null);
    setClientDirty(false);
    setSuccess(false);
    setErrMsg(null);
  };

  if (success) {
    return (
      <>
        <TopBar title="🛒 Mostrador — Nueva Venta" subtitle="Venta cerrada exitosamente" />
        <div className="p-6 max-w-lg">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-8 text-center space-y-4">
            <p className="text-4xl">✅</p>
            <h2 className="text-xl font-bold text-emerald-300">Venta registrada</h2>
            <p className="text-emerald-400/70 text-sm">Total: <span className="font-black text-emerald-300">{formatCurrency(total)}</span></p>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleReset} className="flex-1" variant="secondary">Nueva venta</Button>
              <Button onClick={() => window.location.href = '/vendedor/mostrador/pedidos'} className="flex-1">Ver ventas →</Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="🛒 Mostrador — Nueva Venta" subtitle="Cargá los repuestos y los datos del cliente" />

      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-8 max-w-6xl">
        {/* ── COLUMNA IZQUIERDA: Vehículo + Ítems ── */}
        <div className="space-y-6">
          {/* Vehículo */}
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">🚗 Datos del vehículo</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <Input label="Marca" value={vehicle.brand}  onChange={e => setVehicle(v => ({...v, brand:  e.target.value}))} placeholder="Toyota" />
              <Input label="Modelo" value={vehicle.model} onChange={e => setVehicle(v => ({...v, model:  e.target.value}))} placeholder="Corolla" />
              <Input label="Año"    value={vehicle.year}  onChange={e => setVehicle(v => ({...v, year:   e.target.value}))} placeholder="2020" />
              <Input label="Motor"  value={vehicle.engine} onChange={e => setVehicle(v => ({...v, engine: e.target.value}))} placeholder="1.8 VVT-i" />
              <Input label="Patente" value={vehicle.plate} onChange={e => setVehicle(v => ({...v, plate:  e.target.value}))} placeholder="AB 123 CD" className="col-span-2" />
            </div>
          </section>

          {/* Repuestos */}
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">🔩 Repuestos / Servicios</h2>
              <button type="button" onClick={() => setItems(prev => [...prev, mkItem()])} className="text-xs text-orange-400/70 hover:text-orange-300">+ Agregar ítem</button>
            </div>
            <div className="divide-y divide-zinc-800/40">
              {items.map((item, idx) => (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="grid grid-cols-6 gap-2">
                    <div className="col-span-3">
                      <Input
                        label={idx === 0 ? 'Repuesto / Servicio' : undefined}
                        value={item.part_name}
                        onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, part_name: e.target.value} : x))}
                        placeholder="Nombre del repuesto"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        label={idx === 0 ? 'Cant.' : undefined}
                        type="number" min={1}
                        value={item.quantity}
                        onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, quantity: parseInt(e.target.value) || 1} : x))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label={idx === 0 ? 'Precio unit.' : undefined}
                        type="number" min={0} step="0.01"
                        value={item.unit_price || ''}
                        onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, unit_price: parseFloat(e.target.value) || 0} : x))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Input
                      placeholder="Descripción (opcional)"
                      value={item.description}
                      onChange={e => setItems(p => p.map((x, i) => i === idx ? {...x, description: e.target.value} : x))}
                      className="text-xs"
                    />
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <span className="text-sm font-bold text-zinc-300 w-24 text-right">{formatCurrency(item.quantity * item.unit_price)}</span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => setItems(p => p.filter((_, i) => i !== idx))} className="text-rose-400/60 hover:text-rose-400 text-xs">✕</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/60 bg-zinc-950/30">
              <span className="text-sm font-semibold text-zinc-400">TOTAL</span>
              <span className="text-xl font-black text-white">{formatCurrency(total)}</span>
            </div>
          </section>
        </div>

        {/* ── COLUMNA DERECHA: Cliente + Guardar ── */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">👤 Cliente</h2>
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-orange-400/80 hover:text-orange-300 transition-colors"
              >
                🔍 Buscar cliente existente
              </button>
            </div>

            {foundClient && (
              <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2">
                <p className="text-xs text-emerald-300 font-semibold">✓ Cliente cargado: {foundClient.full_name}</p>
                <button type="button" onClick={() => { setFoundClient(null); setClientData({ dni: '', full_name: '', phone: '', email: '', address: '' }); }}
                  className="text-[10px] text-zinc-500 hover:text-rose-400">Limpiar</button>
              </div>
            )}

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Nombre completo *"
                  value={clientData.full_name}
                  onChange={e => { setClientData(d => ({...d, full_name: e.target.value})); if (foundClient) setClientDirty(true); }}
                />
                <Input
                  label="DNI"
                  value={clientData.dni}
                  onChange={e => { setClientData(d => ({...d, dni: e.target.value})); if (foundClient) setClientDirty(true); }}
                  placeholder="30123456"
                />
                <Input
                  label="Teléfono"
                  value={clientData.phone}
                  onChange={e => { setClientData(d => ({...d, phone: e.target.value})); if (foundClient) setClientDirty(true); }}
                  placeholder="11 4444-5555"
                />
                <Input
                  label="Email"
                  value={clientData.email}
                  onChange={e => { setClientData(d => ({...d, email: e.target.value})); if (foundClient) setClientDirty(true); }}
                  placeholder="cliente@mail.com"
                />
              </div>
              <Input
                label="Dirección"
                value={clientData.address}
                onChange={e => { setClientData(d => ({...d, address: e.target.value})); if (foundClient) setClientDirty(true); }}
                placeholder="Av. Corrientes 1234, CABA"
              />
              {clientDirty && (
                <p className="text-[10px] text-amber-400/70">⚠️ Los datos del cliente fueron modificados y se actualizarán al guardar.</p>
              )}
            </div>
          </section>

          {errMsg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errMsg}</div>
          )}

          <Button
            loading={saving}
            disabled={!canSave}
            onClick={handleSave}
            size="lg"
            className="w-full bg-orange-600/20 border border-orange-500/40 text-orange-300 hover:bg-orange-600/30 font-bold"
          >
            💵 Cerrar Venta — {formatCurrency(total)}
          </Button>
        </div>
      </div>

      {/* ── Modal búsqueda de cliente ── */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-bold text-zinc-100">🔍 Buscar cliente</h3>
              <button type="button" onClick={() => { setShowSearch(false); setSearchQ(''); setResults([]); }} className="text-zinc-500 hover:text-zinc-100 text-sm">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <input
                autoFocus
                value={searchQ}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Nombre o DNI..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
              />
              {searching && <p className="text-xs text-zinc-500 text-center py-2">Buscando...</p>}
              {!searching && searchQ && searchResults.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-4">Sin resultados para "{searchQ}"</p>
              )}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectClient(c)}
                    className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 hover:border-orange-500/30 hover:bg-orange-500/5 transition-all"
                  >
                    <p className="font-semibold text-sm text-zinc-200">{c.full_name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {c.dni ? `DNI: ${c.dni}` : 'Sin DNI'}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
