'use client';

import { useState, useEffect, useCallback } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/FormFields';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  listAccountsWithDebt,
  getAccountTransactions,
  getUnpaidOrders,
  createReceipt,
  getOrCreateAccount,
  PAYMENT_TERMS_LABELS,
  PAYMENT_METHOD_LABELS,
  type CurrentAccount,
  type AccountTransaction,
  type UnpaidOrder,
  type ReceiptPaymentMethod,
} from '@/lib/erp/cuentas-corrientes';

// ─── Tipos de UI ──────────────────────────────────────────────────────────────

type View = 'list' | 'detail' | 'receipt';

interface PaymentMethodRow {
  id:             string;
  method:         string;
  amount:         string;
  reference_code: string;
  bank_name:      string;
  due_date:       string;
  notes:          string;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CobranzasPage() {
  const { user } = useAuth();
  const [view,         setView]         = useState<View>('list');
  const [accounts,     setAccounts]     = useState<(CurrentAccount & { workshop: any })[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<(CurrentAccount & { workshop: any }) | null>(null);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [unpaidOrders, setUnpaidOrders] = useState<UnpaidOrder[]>([]);
  const [loadingDetail,setLoadingDetail]= useState(false);

  // Receipt state
  const [checkedOrders, setCheckedOrders]     = useState<Set<string>>(new Set());
  const [discount,      setDiscount]           = useState('0');
  const [receiptNotes,  setReceiptNotes]        = useState('');
  const [payMethods,    setPayMethods]          = useState<PaymentMethodRow[]>([mkPM()]);
  const [savingReceipt, setSavingReceipt]       = useState(false);
  const [receiptMsg,    setReceiptMsg]          = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Account setup modal
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupAccountId, setSetupAccountId] = useState<string | null>(null);
  const [setupForm, setSetupForm] = useState({ credit_limit: '', payment_terms: 'a_30_dias', notes: '' });
  const [savingSetup, setSavingSetup] = useState(false);

  function mkPM(): PaymentMethodRow {
    return { id: Math.random().toString(36).slice(2), method: 'cash', amount: '', reference_code: '', bank_name: '', due_date: '', notes: '' };
  }

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const data = await listAccountsWithDebt(sb);
    setAccounts(data);
    setLoading(false);
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const openDetail = async (account: CurrentAccount & { workshop: any }) => {
    setSelected(account);
    setView('detail');
    setLoadingDetail(true);
    const sb = getSupabaseClient();
    const [txns, orders] = await Promise.all([
      getAccountTransactions(sb, account.id),
      getUnpaidOrders(sb, account.workshop_id),
    ]);
    setTransactions(txns);
    setUnpaidOrders(orders);
    setCheckedOrders(new Set());
    setLoadingDetail(false);
  };

  // Total seleccionado
  const selectedTotal = unpaidOrders
    .filter(o => checkedOrders.has(o.id))
    .reduce((s, o) => s + o.pending_amount, 0);
  const discountVal = parseFloat(discount) || 0;
  const netTotal    = Math.max(0, selectedTotal - discountVal);
  const payTotal    = payMethods.reduce((s, pm) => s + (parseFloat(pm.amount) || 0), 0);
  const payDiff     = Math.abs(payTotal - netTotal);

  const handleGenerateReceipt = async () => {
    if (!selected || !user || checkedOrders.size === 0) return;
    if (payDiff > 0.01) { setReceiptMsg({ type: 'err', text: `Los métodos de pago no cierran. Diferencia: ${formatCurrency(payDiff)}` }); return; }

    setSavingReceipt(true);
    setReceiptMsg(null);
    const sb = getSupabaseClient();

    const imputations = unpaidOrders
      .filter(o => checkedOrders.has(o.id))
      .map(o => ({ orderId: o.id, amount: o.pending_amount }));

    const methods: Omit<ReceiptPaymentMethod, 'id' | 'receipt_id'>[] = payMethods
      .filter(pm => parseFloat(pm.amount) > 0)
      .map(pm => ({
        method:         pm.method as any,
        amount:         parseFloat(pm.amount),
        reference_code: pm.reference_code || null,
        bank_name:      pm.bank_name || null,
        due_date:       pm.due_date || null,
        notes:          pm.notes || null,
        created_at:     new Date().toISOString(),
      }));

    const result = await createReceipt(sb, {
      accountId:      selected.id,
      userId:         user.id,
      totalCollected: netTotal,
      discount:       discountVal,
      notes:          receiptNotes,
      imputations,
      paymentMethods: methods,
    });

    setSavingReceipt(false);
    if ('error' in result) {
      setReceiptMsg({ type: 'err', text: result.error });
    } else {
      setReceiptMsg({ type: 'ok', text: `Recibo generado correctamente. ID: ${result.receiptId.slice(0, 8).toUpperCase()}` });
      await loadAccounts();
      await openDetail(selected);
      setView('detail');
      setCheckedOrders(new Set());
      setDiscount('0');
      setReceiptNotes('');
      setPayMethods([mkPM()]);
    }
  };

  const handleSaveSetup = async () => {
    if (!setupAccountId || !user) return;
    setSavingSetup(true);
    const sb = getSupabaseClient() as any;
    await sb.from('current_accounts').update({
      credit_limit:  parseFloat(setupForm.credit_limit) || 0,
      payment_terms: setupForm.payment_terms,
      notes:         setupForm.notes || null,
      active:        true,
    }).eq('id', setupAccountId);
    setSavingSetup(false);
    setShowSetupModal(false);
    await loadAccounts();
  };

  // ─── Render: Lista de cuentas ─────────────────────────────────────────────

  if (view === 'list') {
    const totalDeudaGlobal = accounts.reduce((s, a) => s + a.current_balance, 0);
    return (
      <>
        <TopBar
          title="Cuentas Corrientes"
          subtitle={`${accounts.length} talleres con saldo deudor · Total: ${formatCurrency(totalDeudaGlobal)}`}
        />
        <div className="p-6 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/8 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400/70 mb-1">Total en calle</p>
              <p className="text-2xl font-black text-rose-300">{formatCurrency(totalDeudaGlobal)}</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-1">Talleres deudores</p>
              <p className="text-2xl font-black text-amber-300">{accounts.length}</p>
            </div>
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/8 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400/70 mb-1">Promedio por taller</p>
              <p className="text-2xl font-black text-sky-300">
                {formatCurrency(accounts.length > 0 ? totalDeudaGlobal / accounts.length : 0)}
              </p>
            </div>
          </div>

          {/* Tabla */}
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 rounded-2xl bg-zinc-900/60 animate-pulse border border-zinc-800" />)}</div>
          ) : accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
              <p className="text-sm text-zinc-500">✅ Sin deudas activas. Todas las cuentas están al día.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-950/40">
                    {['Taller', 'Límite crédito', 'Saldo deudor', 'Condición', 'Acciones'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {accounts.map(acc => (
                    <tr key={acc.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-zinc-200">
                        <div>{acc.workshop?.name ?? '—'}</div>
                        <div className="text-xs text-zinc-500 font-normal">{acc.workshop?.phone ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{formatCurrency(acc.credit_limit)}</td>
                      <td className="px-4 py-3 font-black text-rose-300">{formatCurrency(acc.current_balance)}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{PAYMENT_TERMS_LABELS[acc.payment_terms] ?? acc.payment_terms}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => openDetail(acc)} className="text-xs">Ver / Cobrar</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  // ─── Render: Detalle de cuenta ────────────────────────────────────────────

  if (view === 'detail' && selected) {
    return (
      <>
        <TopBar
          title={selected.workshop?.name ?? 'Cuenta Corriente'}
          subtitle={`Saldo: ${formatCurrency(selected.current_balance)} · ${PAYMENT_TERMS_LABELS[selected.payment_terms] ?? ''}`}
        />
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setView('list')}>← Volver</Button>
            {unpaidOrders.length > 0 && (
              <Button onClick={() => { setView('receipt'); setReceiptMsg(null); }} className="bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30">
                💰 Generar Recibo de Cobro
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pedidos impagos */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Deuda pendiente</h3>
              {loadingDetail ? (
                <div className="h-32 animate-pulse rounded-2xl bg-zinc-900/60 border border-zinc-800" />
              ) : unpaidOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-8 text-center">
                  <p className="text-xs text-zinc-500">Sin pedidos impagos</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
                  {unpaidOrders.map(o => (
                    <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/40 last:border-0">
                      <div>
                        <p className="font-mono text-xs font-bold text-orange-400/80">#{o.label}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{formatDate(o.updated_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-rose-300">{formatCurrency(o.pending_amount)}</p>
                        <p className="text-[10px] text-zinc-500">de {formatCurrency(o.total_amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historial de movimientos */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Historial de movimientos</h3>
              {loadingDetail ? (
                <div className="h-32 animate-pulse rounded-2xl bg-zinc-900/60 border border-zinc-800" />
              ) : transactions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-8 text-center">
                  <p className="text-xs text-zinc-500">Sin movimientos</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden max-h-80 overflow-y-auto">
                  {transactions.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/40 last:border-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            t.type === 'FACTURA' ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                            : t.type === 'RECIBO' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                            : 'bg-sky-500/10 border-sky-500/20 text-sky-300'
                          }`}>{t.type}</span>
                          <span className="text-xs text-zinc-400 truncate">{t.description}</span>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-0.5">{formatDateTime(t.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black ${t.amount > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                          {t.amount > 0 ? '+' : ''}{formatCurrency(t.amount)}
                        </p>
                        <p className="text-[10px] text-zinc-500">Saldo: {formatCurrency(t.balance_after)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── Render: Generar Recibo ───────────────────────────────────────────────

  if (view === 'receipt' && selected) {
    return (
      <>
        <TopBar title="Generar Recibo de Cobro" subtitle={selected.workshop?.name ?? ''} />
        <div className="p-6 space-y-6 max-w-3xl">
          <Button variant="ghost" size="sm" onClick={() => setView('detail')}>← Volver al detalle</Button>

          {/* Selección de pedidos */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">1. Seleccioná los pedidos a imputar</h3>
            </div>
            {unpaidOrders.map(o => (
              <label key={o.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-zinc-800/40 last:border-0 cursor-pointer hover:bg-zinc-800/30 transition-colors">
                <input
                  type="checkbox"
                  checked={checkedOrders.has(o.id)}
                  onChange={() => setCheckedOrders(prev => {
                    const s = new Set(prev);
                    s.has(o.id) ? s.delete(o.id) : s.add(o.id);
                    return s;
                  })}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 accent-orange-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs font-bold text-orange-400/80">#{o.label}</p>
                  <p className="text-[10px] text-zinc-500">{formatDate(o.updated_at)}</p>
                </div>
                <p className="font-black text-rose-300">{formatCurrency(o.pending_amount)}</p>
              </label>
            ))}
            {checkedOrders.size > 0 && (
              <div className="flex items-center justify-between px-5 py-3 bg-zinc-950/40 border-t border-zinc-800/60">
                <span className="text-xs text-zinc-400">{checkedOrders.size} pedido(s) seleccionado(s)</span>
                <span className="font-black text-zinc-100">{formatCurrency(selectedTotal)}</span>
              </div>
            )}
          </div>

          {/* Descuento y notas */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Descuento a aplicar ($)" type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
            <div className="flex items-end">
              <div className="w-full rounded-xl border border-zinc-700/60 bg-zinc-950/40 px-4 py-2.5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Neto a cobrar</p>
                <p className="text-lg font-black text-emerald-300">{formatCurrency(netTotal)}</p>
              </div>
            </div>
          </div>
          <Textarea label="Notas del recibo" value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} placeholder="Observaciones del cobro..." rows={2} />

          {/* Métodos de pago */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/30 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">2. Métodos de pago</h3>
              <button type="button" onClick={() => setPayMethods(p => [...p, mkPM()])} className="text-xs text-orange-400/70 hover:text-orange-300">+ Agregar</button>
            </div>
            <div className="divide-y divide-zinc-800/40">
              {payMethods.map((pm, idx) => (
                <div key={pm.id} className="px-5 py-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <Select
                      label="Método"
                      value={pm.method}
                      onChange={e => setPayMethods(p => p.map((x, i) => i === idx ? { ...x, method: e.target.value } : x))}
                      options={Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                    />
                    <Input
                      label="Monto"
                      type="number"
                      min="0"
                      value={pm.amount}
                      onChange={e => setPayMethods(p => p.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                      placeholder="0"
                    />
                    <Input
                      label="Comprobante / CBU / Nro cheque"
                      value={pm.reference_code}
                      onChange={e => setPayMethods(p => p.map((x, i) => i === idx ? { ...x, reference_code: e.target.value } : x))}
                      placeholder="Opcional"
                    />
                  </div>
                  {(pm.method === 'check') && (
                    <div className="grid grid-cols-3 gap-3">
                      <Input label="Banco" value={pm.bank_name} onChange={e => setPayMethods(p => p.map((x, i) => i === idx ? { ...x, bank_name: e.target.value } : x))} />
                      <Input label="Vencimiento" type="date" value={pm.due_date} onChange={e => setPayMethods(p => p.map((x, i) => i === idx ? { ...x, due_date: e.target.value } : x))} />
                      <div className="flex items-end">
                        {payMethods.length > 1 && (
                          <button type="button" onClick={() => setPayMethods(p => p.filter((_, i) => i !== idx))} className="text-xs text-rose-400/70 hover:text-rose-400">Eliminar</button>
                        )}
                      </div>
                    </div>
                  )}
                  {payMethods.length > 1 && pm.method !== 'check' && (
                    <button type="button" onClick={() => setPayMethods(p => p.filter((_, i) => i !== idx))} className="text-xs text-rose-400/70 hover:text-rose-400">Eliminar método</button>
                  )}
                </div>
              ))}
            </div>
            <div className={`flex items-center justify-between px-5 py-3 border-t border-zinc-800/60 ${payDiff > 0.01 ? 'bg-rose-500/8' : 'bg-emerald-500/8'}`}>
              <span className="text-xs text-zinc-400">Total métodos de pago</span>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold ${payDiff > 0.01 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {payDiff > 0.01 ? `Diferencia: ${formatCurrency(payDiff)}` : '✓ Cierra'}
                </span>
                <span className="font-black text-zinc-100">{formatCurrency(payTotal)}</span>
              </div>
            </div>
          </div>

          {receiptMsg && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              receiptMsg.type === 'ok'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}>
              {receiptMsg.text}
            </div>
          )}

          <Button
            loading={savingReceipt}
            disabled={checkedOrders.size === 0 || payDiff > 0.01 || netTotal <= 0}
            onClick={handleGenerateReceipt}
            size="lg"
            className="w-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 font-bold"
          >
            ✅ Confirmar Recibo — {formatCurrency(netTotal)}
          </Button>
        </div>
      </>
    );
  }

  return null;
}
