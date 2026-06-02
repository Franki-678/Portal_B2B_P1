/**
 * POST /api/credit-account-request
 *
 * Crea una solicitud de pago en Cuenta Corriente para un pedido ya cotizado.
 * El pedido NO se aprueba todavía — queda en "cotizado" esperando que
 * admin/vendedor apruebe la solicitud desde el panel de Cobranzas.
 *
 * Body: { orderId, notes? }
 * Auth: debe ser el taller dueño del pedido (validado via RLS + profiles)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';
import { sendToGroup } from '@/lib/telegram/service';
import { formatCcRequest }           from '@/lib/telegram/formatters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://rcrepuestos.vercel.app').replace(/\/$/, '');

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  ) as any;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Autenticar con el JWT del usuario ──────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!jwt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = serviceClient();

  // Verificar el JWT y obtener el usuario
  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // ── 2. Parsear body ───────────────────────────────────────────────────────
  let body: { orderId: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { orderId, notes } = body;
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  // ── 3. Obtener perfil del taller y validar que es dueño del pedido ────────
  const { data: profile } = await sb
    .from('profiles')
    .select('role, workshop_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'taller' || !profile.workshop_id) {
    return NextResponse.json({ error: 'Solo talleres pueden solicitar cuenta corriente' }, { status: 403 });
  }

  const { data: order } = await sb
    .from('orders')
    .select('id, workshop_id, status, workshop_order_number, workshops(id, name, phone, taller_number)')
    .eq('id', orderId)
    .eq('workshop_id', profile.workshop_id)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Pedido no encontrado o no pertenece a este taller' }, { status: 404 });
  }

  if (!['cotizado', 'aprobado', 'aprobado_parcial'].includes(order.status)) {
    return NextResponse.json({ error: 'El pedido no está en estado válido para solicitar CC' }, { status: 422 });
  }

  // ── 4. Calcular monto total de la cotización ──────────────────────────────
  const { data: quoteItems } = await sb
    .from('quotes')
    .select('id, quote_items(price, quantity_offered, approved)')
    .eq('order_id', orderId)
    .eq('status', 'enviada')
    .limit(1)
    .single();

  const items = (quoteItems?.quote_items ?? []) as any[];
  const requestedAmount = items
    .filter((qi: any) => qi.approved !== false)
    .reduce((s: number, qi: any) => s + (Number(qi.price) || 0) * (Number(qi.quantity_offered) || 1), 0);

  // ── 5. Verificar que no existe ya una solicitud pendiente ─────────────────
  const { data: existing } = await sb
    .from('credit_account_requests')
    .select('id, status')
    .eq('order_id', orderId)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'pending') {
      return NextResponse.json({ error: 'Ya existe una solicitud pendiente para este pedido', requestId: existing.id }, { status: 409 });
    }
    if (existing.status === 'rejected') {
      // Permitir re-solicitar si fue rechazada
      await sb.from('credit_account_requests').delete().eq('id', existing.id);
    }
  }

  // ── 6. Crear la solicitud ──────────────────────────────────────────────────
  const { data: newReq, error: reqErr } = await sb
    .from('credit_account_requests')
    .insert({
      workshop_id:      profile.workshop_id,
      order_id:         orderId,
      requested_by:     user.id,
      requested_amount: requestedAmount,
      notes:            notes?.trim() || null,
      status:           'pending',
    })
    .select()
    .single();

  if (reqErr || !newReq) {
    console.error('[CC-Request] Error creating request:', reqErr?.message);
    return NextResponse.json({ error: 'Error al crear la solicitud' }, { status: 500 });
  }

  // ── 7. Notificar por Telegram ─────────────────────────────────────────────
  try {
    const ws       = order.workshops as any;
    const tNum     = ws?.taller_number;
    const oNum     = order.workshop_order_number;
    const label    = tNum != null && oNum != null
      ? `${String(tNum).padStart(2, '0')}-PED-${String(oNum).padStart(4, '0')}`
      : oNum != null ? `PED-${String(oNum).padStart(4, '0')}`
      : orderId.slice(0, 8).toUpperCase();

    const msg = formatCcRequest({
      workshopName:  ws?.name ?? 'Taller',
      workshopPhone: ws?.phone ?? null,
      orderLabel:    label,
      orderLink:     `${APP_URL}/vendedor/pedidos/${label}`,
      amount:        requestedAmount,
      notes:         notes?.trim() ?? null,
      requestId:     newReq.id,
      approveUrl:    `${APP_URL}/vendedor/cobranzas`,
    });

    await sendToGroup(msg);
  } catch (tgErr) {
    // Telegram no debe romper el flujo principal
    console.warn('[CC-Request] Telegram notification failed:', tgErr);
  }

  return NextResponse.json({ ok: true, requestId: newReq.id });
}
