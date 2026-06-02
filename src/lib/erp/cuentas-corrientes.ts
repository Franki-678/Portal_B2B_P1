/**
 * Cuentas Corrientes — Data Access Layer
 * Lógica de negocio para el módulo AR (Accounts Receivable)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface CurrentAccount {
  id:              string;
  workshop_id:     string;
  credit_limit:    number;
  payment_terms:   string;
  active:          boolean;
  current_balance: number;
  notes:           string | null;
  created_at:      string;
  workshop?:       { id: string; name: string; phone: string | null; taller_number: number | null };
}

export interface AccountTransaction {
  id:                   string;
  account_id:           string;
  type:                 'FACTURA' | 'RECIBO' | 'NOTA_CREDITO' | 'NOTA_DEBITO' | 'AJUSTE';
  amount:               number;
  balance_after:        number;
  description:          string | null;
  reference_order_id:   string | null;
  reference_receipt_id: string | null;
  created_at:           string;
  created_by:           string | null;
}

export interface Receipt {
  id:               string;
  account_id:       string;
  receipt_number:   number;
  total_collected:  number;
  discount_applied: number;
  notes:            string | null;
  status:           'draft' | 'confirmed' | 'cancelled';
  created_at:       string;
  confirmed_at:     string | null;
  imputations?:     ReceiptImputation[];
  payment_methods?: ReceiptPaymentMethod[];
}

export interface ReceiptImputation {
  id:             string;
  receipt_id:     string;
  order_id:       string;
  amount_applied: number;
}

export interface ReceiptPaymentMethod {
  id:             string;
  receipt_id:     string;
  method:         'cash' | 'transfer' | 'check' | 'debit_card' | 'credit_card' | 'other';
  amount:         number;
  reference_code: string | null;
  bank_name:      string | null;
  due_date:       string | null;
  notes:          string | null;
}

export interface UnpaidOrder {
  id:                    string;
  label:                 string;
  workshop_order_number: number | null;
  total_amount:          number;
  paid_amount:           number;
  pending_amount:        number;
  financial_status:      string;
  updated_at:            string;
}

// ─── Funciones ───────────────────────────────────────────────────────────────

const sb = (client: SupabaseClient) => client as any;

/** Obtener o crear cuenta corriente de un taller */
export async function getOrCreateAccount(
  client: SupabaseClient,
  workshopId: string,
  userId: string
): Promise<CurrentAccount | null> {
  const { data: existing } = await sb(client)
    .from('current_accounts')
    .select('*')
    .eq('workshop_id', workshopId)
    .maybeSingle();

  if (existing) return existing as CurrentAccount;

  const { data: created } = await sb(client)
    .from('current_accounts')
    .insert({ workshop_id: workshopId, created_by: userId })
    .select()
    .single();

  return created as CurrentAccount | null;
}

/** Listar todas las cuentas corrientes con saldo */
export async function listAccountsWithDebt(
  client: SupabaseClient
): Promise<(CurrentAccount & { workshop: { id: string; name: string; phone: string | null; taller_number: number | null } })[]> {
  const { data } = await sb(client)
    .from('current_accounts')
    .select(`
      *,
      workshop:workshops(id, name, phone, taller_number)
    `)
    .eq('active', true)
    .gt('current_balance', 0)
    .order('current_balance', { ascending: false });

  return (data ?? []) as any[];
}

/** Historial de movimientos de una cuenta */
export async function getAccountTransactions(
  client: SupabaseClient,
  accountId: string,
  limit = 50
): Promise<AccountTransaction[]> {
  const { data } = await sb(client)
    .from('account_transactions')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as AccountTransaction[];
}

/** Pedidos impagos de un taller */
export async function getUnpaidOrders(
  client: SupabaseClient,
  workshopId: string
): Promise<UnpaidOrder[]> {
  const { data } = await sb(client)
    .from('orders')
    .select('id, workshop_order_number, total_amount, paid_amount, financial_status, updated_at, workshops(taller_number)')
    .eq('workshop_id', workshopId)
    .in('financial_status', ['unpaid', 'partial'])
    .not('total_amount', 'is', null)
    .order('updated_at', { ascending: false });

  return ((data ?? []) as any[]).map((row: any) => {
    const tNum = row.workshops?.taller_number;
    const oNum = row.workshop_order_number;
    const label = tNum != null && oNum != null
      ? `${String(tNum).padStart(2, '0')}-PED-${String(oNum).padStart(4, '0')}`
      : oNum != null ? `PED-${String(oNum).padStart(4, '0')}`
      : row.id.slice(0, 8).toUpperCase();
    return {
      id:                    row.id,
      label,
      workshop_order_number: row.workshop_order_number,
      total_amount:          Number(row.total_amount) || 0,
      paid_amount:           Number(row.paid_amount) || 0,
      pending_amount:        (Number(row.total_amount) || 0) - (Number(row.paid_amount) || 0),
      financial_status:      row.financial_status,
      updated_at:            row.updated_at,
    };
  });
}

/** Genera un recibo, imputa pedidos y registra métodos de pago */
export async function createReceipt(
  client: SupabaseClient,
  params: {
    accountId:      string;
    userId:         string;
    totalCollected: number;
    discount:       number;
    notes:          string;
    imputations:    { orderId: string; amount: number }[];
    paymentMethods: Omit<ReceiptPaymentMethod, 'id' | 'receipt_id'>[];
  }
): Promise<{ receiptId: string } | { error: string }> {
  const { accountId, userId, totalCollected, discount, notes, imputations, paymentMethods } = params;

  // 1. Crear recibo en borrador
  const { data: receipt, error: rErr } = await sb(client)
    .from('receipts')
    .insert({
      account_id:       accountId,
      total_collected:  totalCollected,
      discount_applied: discount,
      notes:            notes || null,
      status:           'confirmed',
      confirmed_at:     new Date().toISOString(),
      created_by:       userId,
    })
    .select()
    .single();

  if (rErr || !receipt) return { error: rErr?.message ?? 'Error al crear recibo' };

  const receiptId = receipt.id;

  // 2. Imputaciones
  if (imputations.length > 0) {
    await sb(client).from('receipt_imputations').insert(
      imputations.map(i => ({ receipt_id: receiptId, order_id: i.orderId, amount_applied: i.amount }))
    );

    // Actualizar paid_amount de cada pedido
    for (const imp of imputations) {
      const { data: order } = await sb(client)
        .from('orders')
        .select('total_amount, paid_amount')
        .eq('id', imp.orderId)
        .single();

      if (order) {
        const newPaid   = (Number(order.paid_amount) || 0) + imp.amount;
        const totalAmt  = Number(order.total_amount) || 0;
        const newStatus = newPaid >= totalAmt ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
        await sb(client)
          .from('orders')
          .update({ paid_amount: newPaid, financial_status: newStatus })
          .eq('id', imp.orderId);
      }
    }
  }

  // 3. Métodos de pago
  if (paymentMethods.length > 0) {
    await sb(client).from('receipt_payment_methods').insert(
      paymentMethods.map(pm => ({ ...pm, receipt_id: receiptId }))
    );
  }

  // 4. Transacción contable (abono: negativo en cuenta)
  await sb(client).from('account_transactions').insert({
    account_id:           accountId,
    type:                 'RECIBO',
    amount:               -(totalCollected + discount),
    description:          `Recibo de cobro — ${notes || 'sin detalle'}`,
    reference_receipt_id: receiptId,
    created_by:           userId,
  });

  return { receiptId };
}

/** Activar cuenta corriente para un taller con factura */
export async function registerOrderAsCC(
  client: SupabaseClient,
  params: { accountId: string; orderId: string; amount: number; userId: string; description?: string }
): Promise<void> {
  const { accountId, orderId, amount, userId, description } = params;

  // Marcar pedido como "cuenta corriente" (unpaid)
  await sb(client)
    .from('orders')
    .update({ total_amount: amount, paid_amount: 0, financial_status: 'unpaid' })
    .eq('id', orderId);

  // Registrar transacción de cargo
  await sb(client).from('account_transactions').insert({
    account_id:          accountId,
    type:                'FACTURA',
    amount:              amount,
    description:         description ?? 'Cargo por pedido en cuenta corriente',
    reference_order_id:  orderId,
    created_by:          userId,
  });
}

export const PAYMENT_TERMS_LABELS: Record<string, string> = {
  contado:      'Contado',
  a_7_dias:     'A 7 días',
  a_15_dias:    'A 15 días',
  a_30_dias:    'A 30 días',
  a_60_dias:    'A 60 días',
  los_dias_10:  'Los días 10 del mes',
  los_dias_15:  'Los días 15 del mes',
  los_dias_25:  'Los días 25 del mes',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:        'Efectivo',
  transfer:    'Transferencia',
  check:       'Cheque',
  debit_card:  'Débito',
  credit_card: 'Crédito',
  other:       'Otro',
};
