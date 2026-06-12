'use client';

import { useState, useEffect, useCallback } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/FormFields';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { updateQuoteItemsApproval } from '@/lib/supabase/queries';
import {
  listAccountsWithDebt,
  getAccountTransactions,
  getUnpaidOrders,
  createReceipt,
  getOrCreateAccount,
  registerOrderAsCC,
  PAYMENT_TERMS_LABELS,
  PAYMENT_METHOD_LABELS,
  type CurrentAccount,
  type AccountTransaction,
  type UnpaidOrder,
  type ReceiptPaymentMethod,
} from '@/lib/erp/cuentas-corrientes';

// ─── Tipos de UI ──────────────────────────────────────────────────────────────

type View = 'list' | 'detail' | 'receipt';

interface CcRequest {
  id:               string;
  workshop_id:      string;
  order_id:         string;
  requested_by:     string;
  requested_amount: number;
  status:           string;
  notes:            string | null;
  created_at:       string;
  reviewer_notes:   string | null;
  workshop:         { name: string; phone: string | null } | null;
  order:            { workshop_order_number: number | null; workshops: { taller_number: number | null } | null } | null;
}

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

  // ── Estado solicitudes CC ────────────────────────────────────────────────
  const [ccRequests,       setCcRequests]       = useState<CcRequest[]>([]);
  const [loadingRequests,  setLoadingRequests]  = useState(true);
  const [reviewTarget,     setReviewTarget]     = useState<CcRequest | null>(null);
  const [reviewAction,     setReviewAction]     = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes,      setReviewNotes]      = useState('');
  const [reviewLoading,    setReviewLoading]    = useState(false);
  const [creditLimit,      setCreditLimit]      = useState('');
  const [paymentTerms,     setPaymentTerms]     = useState('a_30_dias');

  const loadCcRequests = useCallback(async () => {
    setLoadingRequests(true);
    const sb = getSupabaseClient() as any;
    const { data } = await sb
      .from('credit_account_requests')
      .select(`
        *,
        workshop:workshops(name, phone),
        order:orders(workshop_order_number, workshops(taller_number))
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setCcRequests((data ?? []) as CcRequest[]);
    setLoadingRequests(false);
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    const data = await listAccountsWithDebt(sb);
    setAccounts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadCcRequests();
  }, [loadAccounts, loadCcRequests]);

  const handleReviewRequest = async () => {
    if (!reviewTarget || !user || !reviewAction) return;
    setReviewLoading(true);
    const sb = getSupabaseClient() as any;

    try {
      if (reviewAction === 'approve') {
        // 1. Obtener o crear cuenta corriente del taller
        const acc = await getOrCreateAccount(getSupabaseClient(), reviewTarget.workshop_id, user.id);
        if (!acc) throw new Error('No se pudo crear la cuenta corriente');

        // 2. Actualizar límite y condiciones si se especificaron
        if (creditLimit || paymentTerms !== 'a_30_dias') {
          await sb.from('current_accounts').update({
            credit_limit:  parseFloat(creditLimit) || acc.credit_limit,
            payment_terms: paymentTerms,
            active:        true,
          }).eq('id', acc.id);
        }

        // 3. Registrar el cargo en CC (activa la deuda)
        await registerOrderAsCC(getSupabaseClient(), {
          accountId:   acc.id,
          orderId:     reviewTarget.order_id,
          amount:      reviewTarget.requested_amount,
          userId:      user.id,
          description: `Cargo CC por pedido aprobado`,
        });

        // 4. Aprobar la cotización del pedido (actúa en nombre del taller)
        // Nota: usamos la API de Supabase directamente para cambiar el status
        await sb.from('orders').update({
          status:          'aprobado',
          payment_method:  'cuenta_corriente',
          updated_at:      new Date().toISOString(),
        }).eq('id', reviewTarget.order_id);

        // Marcar ítems de la cotización como aprobados (paridad con approveQuote)
        const { data: quoteRow } = await sb
          .from('quotes')
          .select('id, quote_items(id)')
          .eq('order_id', reviewTarget.order_id)
          .maybeSingle();
        const itemIds = (quoteRow?.quote_items ?? []).map((qi: any) => qi.id);
        if (itemIds.length > 0) {
          await updateQuoteItemsApproval(sb, itemIds, []);
        }

        // Insertar evento
        await sb.from('order_events').insert({
          order_id:   reviewTarget.order_id,
          user_id:    user.id,
          action:     'cotizacion_aprobada',
          comment:    `Aprobado con pago en cuenta corriente por ${user.name}`,
        });

        // 5. Marcar solicitud como aprobada
        await sb.from('credit_account_requests').update({
          status:        'approved',
          reviewed_by:   user.id,
          reviewed_at:   new Date().toISOString(),
          reviewer_notes: reviewNotes.trim() || null,
          approved_cc_id: acc.id,
        }).eq('id', reviewTarget.id);

      } else {
        // Rechazar
        await sb.from('credit_account_requests').update({
          status:         'rejected',
          reviewed_by:    user.id,
          reviewed_at:    new Date().toISOString(),
          reviewer_notes: reviewNotes.trim() || null,
        }).eq('id', reviewTarget.id);
      }

      setReviewTarget(null);
      setReviewAction(null);
      setReviewNotes('');
      setCreditLimit('');
      setPaymentTerms('a_30_dias');
      await Promise.all([loadCcRequests(), loadAccounts()]);
    } catch (e) {
      console.error('[CC Review] Error:', e);
      alert(e instanceof Error ? e.message : 'Error al procesar la solicitud');
    } finally {
      setReviewLoading(false);
    }
  };

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

  // ── Modal de revisión de solicitud CC ─────────────────────────────────────
  if (reviewTarget && reviewAction) {
    const isApprove = reviewAction === 'approve';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7 max-w-md w-full shadow-2xl">
          <h3 className={`text-lg font-extrabold mb-1 tracking-tight ${isApprove ? 'text-emerald-300' : 'text-rose-300'}`}>
            {isApprove ? '✅ Aprobar solicitud CC' : '✕ Rechazar solicitud CC'}
          </h3>
          <p className="text-sm text-zinc-400 mb-5">
            Taller: <span className="font-bold text-zinc-200">{reviewTarget.workshop?.name}</span>
            {' · '}Monto: <span className="font-bold text-sky-300">{formatCurrency(reviewTarget.requested_amount)}</span>
          </p>
          {reviewTarget.notes && (
            <div className="mb-4 rounded-xl border border-zinc-700/60 bg-zinc-800/40 px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Nota del taller</p>
              <p className="text-xs text-zinc-300 italic">"{reviewTarget.notes}"</p>
            </div>
          )}

          {isApprove && (
            <div className="space-y-4 mb-5">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Límite de crédito ($)"
                  type="number"
                  min="0"
                  value={creditLimit}
                  onChange={e => setCreditLimit(e.target.value)}
                  placeholder={String(reviewTarget.requested_amount)}
                />
                <Select
                  label="Condición de pago"
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                  options={Object.entries(PAYMENT_TERMS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-xs text-emerald-300/80">
                <p className="font-semibold text-emerald-300 mb-1">¿Qué pasa al aprobar?</p>
                <p>• Se crea/activa la cuenta corriente del taller</p>
                <p>• El pedido queda como "Aprobado" con pago en CC</p>
                <p>• Se genera un cargo de {formatCurrency(reviewTarget.requested_amount)} en su cuenta</p>
              </div>
            </div>
          )}

          <div className="mb-5">
            <label className="block text-xs font-semibold text-zinc-300 mb-2">
              Nota para el taller {!isApprove && <span className="text-rose-400">*</span>}
            </label>
            <textarea
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              placeholder={isApprove ? 'Ej: CC aprobada a 30 días...' : 'Motivo del rechazo...'}
              rows={2}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setReviewTarget(null); setReviewAction(null); }}
              disabled={reviewLoading}
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-700 transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button
              loading={reviewLoading}
              disabled={!isApprove && !reviewNotes.trim()}
              onClick={handleReviewRequest}
              className={`flex-1 font-bold ${isApprove ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30' : 'bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30'}`}
            >
              {isApprove ? '✅ Confirmar aprobación' : '✕ Confirmar rechazo'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

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

          {/* ── SOLICITUDES PENDIENTES DE CC ── */}
          {(loadingRequests || ccRequests.length > 0) && (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/8 overflow-hidden">
              <div className="px-5 py-3 border-b border-sky-500/20 flex items-center justify-between">
                <h3 className="text-sm font-bold text-sky-300 flex items-center gap-2">
                  🏦 Solicitudes de Cuenta Corriente
                  {ccRequests.length > 0 && (
                    <span className="rounded-full bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 text-[10px] font-black text-sky-300">
                      {ccRequests.length}
                    </span>
                  )}
                </h3>
                <button type="button" onClick={loadCcRequests} className="text-[10px] text-sky-500/70 hover:text-sky-300">🔄</button>
              </div>

              {loadingRequests ? (
                <div className="px-5 py-4"><div className="h-10 animate-pulse rounded-xl bg-sky-500/10" /></div>
              ) : ccRequests.length === 0 ? (
                <div className="px-5 py-4 text-xs text-sky-400/50 text-center">Sin solicitudes pendientes</div>
              ) : (
                <div className="divide-y divide-sky-500/10">
                  {ccRequests.map(req => {
                    const ws    = req.workshop;
                    const ord   = req.order;
                    const tNum  = (ord?.workshops as any)?.taller_number;
                    const oNum  = ord?.workshop_order_number;
                    const label = tNum != null && oNum != null
                      ? `${String(tNum).padStart(2,'0')}-PED-${String(oNum).padStart(4,'0')}`
                      : oNum != null ? `PED-${String(oNum).padStart(4,'0')}` : req.order_id.slice(0,8).toUpperCase();

                    return (
                      <div key={req.id} className="flex items-center justify-between gap-4 px-5 py-3.5 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm text-zinc-200">{ws?.name ?? 'Taller'}</p>
                            {ws?.phone && <p className="text-xs text-zinc-500">{ws.phone}</p>}
                          </div>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            <span className="font-mono text-orange-400/80">#{label}</span>
                            {' · '}<span className="font-semibold text-sky-300">{formatCurrency(req.requested_amount)}</span>
                            {' · '}{formatDate(req.created_at)}
                          </p>
                          {req.notes && <p className="text-[11px] text-zinc-500 italic mt-0.5">"{req.notes}"</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => { setReviewTarget(req); setReviewAction('approve'); setReviewNotes(''); setCreditLimit(String(req.requested_amount)); }}
                            className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition-all"
                          >
                            ✅ Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReviewTarget(req); setReviewAction('reject'); setReviewNotes(''); }}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition-all"
                          >
                            ✕ Rechazar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── KPIs */}
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

          {/* ── KPIs */}
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
