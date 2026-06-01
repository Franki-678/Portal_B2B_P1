'use client';

import { useState, useEffect, useCallback } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';

interface CuentaRow {
  workshopId:   string;
  workshopName: string;
  phone:        string | null;
  totalDeuda:   number;
  pedidos: {
    id:               string;
    label:            string;
    totalAmount:      number;
    paidAmount:       number;
    financialStatus:  string;
    updatedAt:        string;
  }[];
}

interface PagoModalState {
  orderId:    string;
  orderLabel: string;
  deuda:      number;
  monto:      string;
}

export default function CuentasCorrientesPage() {
  const [cuentas,       setCuentas]       = useState<CuentaRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [pagoModal,     setPagoModal]     = useState<PagoModalState | null>(null);
  const [savingPago,    setSavingPago]    = useState(false);
  const [filter,        setFilter]        = useState<'all' | 'unpaid' | 'partial'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseClient() as any;
    const { data, error } = await sb
      .from('orders')
      .select(`
        id,
        workshop_order_number,
        total_amount,
        paid_amount,
        financial_status,
        updated_at,
        workshops (id, name, phone, taller_number)
      `)
      .in('financial_status', ['unpaid', 'partial'])
      .order('updated_at', { ascending: false });

    if (error || !data) { setLoading(false); return; }

    // Agrupar por taller
    const map: Record<string, CuentaRow> = {};
    for (const row of data as any[]) {
      const ws    = row.workshops;
      const wid   = ws?.id ?? 'unknown';
      const tNum  = ws?.taller_number;
      const oNum  = row.workshop_order_number;
      const label = tNum != null && oNum != null
        ? `${String(tNum).padStart(2, '0')}-PED-${String(oNum).padStart(4, '0')}`
        : oNum != null ? `PED-${String(oNum).padStart(4, '0')}` : row.id.slice(0, 8).toUpperCase();

      if (!map[wid]) {
        map[wid] = {
          workshopId:   wid,
          workshopName: ws?.name ?? 'Taller desconocido',
          phone:        ws?.phone ?? null,
          totalDeuda:   0,
          pedidos:      [],
        };
      }
      const deuda = (Number(row.total_amount) || 0) - (Number(row.paid_amount) || 0);
      map[wid].totalDeuda += deuda;
      map[wid].pedidos.push({
        id:              row.id,
        label,
        totalAmount:     Number(row.total_amount) || 0,
        paidAmount:      Number(row.paid_amount) || 0,
        financialStatus: row.financial_status,
        updatedAt:       row.updated_at,
      });
    }

    setCuentas(Object.values(map).sort((a, b) => b.totalDeuda - a.totalDeuda));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRegistrarPago = async () => {
    if (!pagoModal) return;
    const monto = parseFloat(pagoModal.monto.replace(',', '.'));
    if (isNaN(monto) || monto <= 0) return;

    setSavingPago(true);
    const sb = getSupabaseClient() as any;

    // Buscar estado actual
    const { data: current } = await sb
      .from('orders')
      .select('total_amount, paid_amount')
      .eq('id', pagoModal.orderId)
      .single();

    if (!current) { setSavingPago(false); return; }

    const totalAmt = Number((current as any).total_amount) || 0;
    const nuevoAcumulado = Math.min((Number((current as any).paid_amount) || 0) + monto, totalAmt);
    const newStatus = nuevoAcumulado >= totalAmt ? 'paid' : nuevoAcumulado > 0 ? 'partial' : 'unpaid';

    await sb
      .from('orders')
      .update({ paid_amount: nuevoAcumulado, financial_status: newStatus })
      .eq('id', pagoModal.orderId);

    setSavingPago(false);
    setPagoModal(null);
    await load();
  };

  const totalGlobal = cuentas.reduce((s, c) => s + c.totalDeuda, 0);
  const filteredCuentas = filter === 'all' ? cuentas
    : cuentas.map(c => ({ ...c, pedidos: c.pedidos.filter(p => p.financialStatus === filter) }))
             .filter(c => c.pedidos.length > 0);

  return (
    <>
      <TopBar
        title="Cuentas Corrientes"
        subtitle={`Plata en la calle: ${formatCurrency(totalGlobal)} · ${cuentas.length} talleres con deuda`}
      />

      <div className="p-6 space-y-6">
        {/* Resumen global */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/8 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400/70 mb-1">Total en calle</p>
            <p className="text-2xl font-black text-rose-300">{formatCurrency(totalGlobal)}</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-1">Sin pagar</p>
            <p className="text-2xl font-black text-amber-300">
              {cuentas.reduce((s, c) => s + c.pedidos.filter(p => p.financialStatus === 'unpaid').length, 0)} ped.
            </p>
          </div>
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/8 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400/70 mb-1">Pago parcial</p>
            <p className="text-2xl font-black text-sky-300">
              {cuentas.reduce((s, c) => s + c.pedidos.filter(p => p.financialStatus === 'partial').length, 0)} ped.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          {(['all', 'unpaid', 'partial'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filter === f
                  ? 'bg-orange-500/20 border border-orange-500/40 text-orange-300'
                  : 'border border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'unpaid' ? 'Sin pagar' : 'Parciales'}
            </button>
          ))}
          <button type="button" onClick={load} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            🔄 Actualizar
          </button>
        </div>

        {/* Lista de talleres */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-zinc-900/60 animate-pulse border border-zinc-800" />)}
          </div>
        ) : filteredCuentas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
            <p className="text-sm text-zinc-500">✅ No hay deudas activas en este filtro.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCuentas.map(cuenta => (
              <div key={cuenta.workshopId} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
                {/* Header del taller */}
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === cuenta.workshopId ? null : cuenta.workshopId)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">🏭</span>
                    <div className="min-w-0 text-left">
                      <p className="font-bold text-zinc-100 truncate">{cuenta.workshopName}</p>
                      <p className="text-xs text-zinc-500">{cuenta.pedidos.length} pedido{cuenta.pedidos.length !== 1 ? 's' : ''} con deuda</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-lg font-black text-rose-300">{formatCurrency(cuenta.totalDeuda)}</span>
                    <span className="text-zinc-500 text-sm">{expanded === cuenta.workshopId ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Detalle de pedidos */}
                {expanded === cuenta.workshopId && (
                  <div className="border-t border-zinc-800/60 divide-y divide-zinc-800/40">
                    {cuenta.pedidos.map(ped => {
                      const deuda = ped.totalAmount - ped.paidAmount;
                      return (
                        <div key={ped.id} className="flex items-center justify-between gap-4 px-5 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-bold text-orange-400/80">#{ped.label}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Total: {formatCurrency(ped.totalAmount)}
                              {ped.paidAmount > 0 && ` · Pagado: ${formatCurrency(ped.paidAmount)}`}
                              {' · '}{formatDate(ped.updatedAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
                              ped.financialStatus === 'partial'
                                ? 'bg-sky-500/10 border-sky-500/20 text-sky-300'
                                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                            }`}>
                              {ped.financialStatus === 'partial' ? 'Parcial' : 'Sin pagar'}
                            </span>
                            <span className="text-sm font-black text-rose-300 w-24 text-right">{formatCurrency(deuda)}</span>
                            <Button
                              size="sm"
                              onClick={() => setPagoModal({ orderId: ped.id, orderLabel: ped.label, deuda, monto: '' })}
                              className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold"
                            >
                              💰 Pago
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Registrar Pago */}
      {pagoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-extrabold text-zinc-100 mb-1">💰 Registrar Pago</h3>
            <p className="text-sm text-zinc-400 mb-1">Pedido <span className="font-bold text-zinc-200">#{pagoModal.orderLabel}</span></p>
            <p className="text-sm text-zinc-400 mb-5">Deuda: <span className="font-bold text-rose-300">{formatCurrency(pagoModal.deuda)}</span></p>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Monto recibido ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={pagoModal.monto}
                onChange={e => setPagoModal({ ...pagoModal, monto: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-lg font-bold text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Podés ingresar un pago parcial — el saldo se actualizará automáticamente.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPagoModal(null)}
                disabled={savingPago}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-700 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <Button
                loading={savingPago}
                disabled={!pagoModal.monto || parseFloat(pagoModal.monto) <= 0}
                onClick={handleRegistrarPago}
                className="flex-1 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 font-bold"
              >
                ✅ Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
