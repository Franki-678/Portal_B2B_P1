/**
 * Webhook Receiver — Supabase → Telegram.
 *
 * Configurar en Supabase Dashboard → Database → Webhooks:
 *   - URL:    https://TU_DOMINIO/api/webhooks/supabase/telegram
 *   - Method: POST
 *   - HTTP Headers:
 *       x-supabase-signature: <SUPABASE_WEBHOOK_SECRET>
 *       Content-Type: application/json
 *   - Tablas a watcher:
 *       orders        → INSERT, UPDATE
 *       order_events  → INSERT
 *
 * El flujo:
 *   1. Supabase dispara este endpoint con el payload (record + old_record).
 *   2. Validamos el secret del header.
 *   3. Si es order_events INSERT → buscamos contexto y mandamos al grupo.
 *   4. Si es orders UPDATE sin cambio de status (taller editó) → mention al vendor.
 *   5. Cambios de status reales ya se cubren via order_events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getWebhookSecret } from '@/lib/telegram/config';
import {
  formatEventForGroup,
  formatVendorMention,
  type OrderRecord,
  type OrderEventRecord,
  type FormatContext,
} from '@/lib/telegram/formatters';
import { sendToGroup } from '@/lib/telegram/service';

// Necesitamos runtime Node (no Edge) para @supabase/supabase-js + service-role.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Tipos del payload de Supabase ────────────────────────────────────────

interface SupabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

// ─── Service-role client (queries internas) ──────────────────────────────

let cachedClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[Webhook] Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

// ─── Lookups ──────────────────────────────────────────────────────────────

async function lookupOrder(orderId: string): Promise<OrderRecord | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('orders')
    .select(
      'id, workshop_id, status, workshop_order_number, assigned_vendor_id, assigned_vendor_name, vehicle_brand, vehicle_model, vehicle_year, created_at, updated_at'
    )
    .eq('id', orderId)
    .single();
  if (error || !data) return null;
  return data as unknown as OrderRecord;
}

async function lookupWorkshopName(workshopId: string): Promise<string> {
  const sb = getServiceClient();
  const { data } = await sb
    .from('workshops')
    .select('name')
    .eq('id', workshopId)
    .single();
  return (data?.name as string | undefined) ?? 'Taller';
}

/**
 * Lee `profiles.telegram_username` del vendedor asignado.
 * Devuelve el username limpio (sin @) o null si no está configurado.
 * Esta es la fuente única de verdad para etiquetar vendedores en Telegram.
 */
async function lookupVendorTelegramUsername(vendorId: string | null): Promise<string | null> {
  if (!vendorId) return null;
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('profiles')
    .select('telegram_username')
    .eq('id', vendorId)
    .single();
  if (error || !data) return null;
  const raw = (data as { telegram_username: string | null }).telegram_username;
  if (!raw || !raw.trim()) return null;
  // Defensivo: limpiar @ por si quedó alguno guardado en la DB
  return raw.trim().replace(/^@+/, '');
}

/**
 * Suma el total ARS de los items aprobados (approved !== false) de la quote
 * del pedido. Devuelve null si no hay cotización.
 */
async function lookupApprovedTotal(orderId: string): Promise<number | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('quote_items')
    .select('price, quantity_offered, approved, quotes!inner(order_id)')
    .eq('quotes.order_id', orderId);
  if (error || !data) return null;
  const rows = data as unknown as Array<{
    price: number;
    quantity_offered: number;
    approved: boolean | null;
  }>;
  return rows
    .filter(r => r.approved !== false)
    .reduce((acc, r) => acc + (Number(r.price) || 0) * (Number(r.quantity_offered) || 0), 0);
}

function eventNeedsTotal(action: string): boolean {
  return (
    action === 'cotizacion_aprobada' ||
    action === 'cotizacion_aprobada_parcial' ||
    action === 'pedido_entregado' ||
    action === 'pedido_pagado'
  );
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleOrderEventInsert(event: OrderEventRecord): Promise<void> {
  const order = await lookupOrder(event.order_id);
  if (!order) {
    console.warn('[Webhook] Order no encontrada para event', event.id);
    return;
  }

  const [workshopName, vendorTelegramUsername, approvedTotal] = await Promise.all([
    lookupWorkshopName(order.workshop_id),
    lookupVendorTelegramUsername(order.assigned_vendor_id),
    eventNeedsTotal(event.action) ? lookupApprovedTotal(order.id) : Promise.resolve(null),
  ]);

  const ctx: FormatContext = { order, workshopName, vendorTelegramUsername, approvedTotal };
  const msg = formatEventForGroup(event, ctx);
  if (!msg) return; // evento silenciado

  await sendToGroup(msg);
}

/**
 * Heurística para detectar "el taller modificó el pedido y espera respuesta":
 * el status no cambió, el pedido ya tiene vendor asignado y se actualizó.
 * Los cambios reales de status van via order_events.
 *
 * NOTA: sin auditoría de actor no podemos saber 100% que fue el taller.
 * En esta versión asumimos que cualquier UPDATE sin cambio de status
 * y con vendor asignado es candidato a mention. Conservador.
 */
async function handleOrderUpdate(oldRow: OrderRecord, newRow: OrderRecord): Promise<void> {
  if (oldRow.status !== newRow.status) return; // cubierto por order_events
  if (!newRow.assigned_vendor_id) return;       // sin vendor, no hay a quien pingear

  // Filtramos updates triviales (timestamps, sin cambios visibles)
  const significantChange =
    oldRow.vehicle_brand   !== newRow.vehicle_brand   ||
    oldRow.vehicle_model   !== newRow.vehicle_model   ||
    oldRow.vehicle_year    !== newRow.vehicle_year;
  if (!significantChange) return;

  const [workshopName, vendorTelegramUsername] = await Promise.all([
    lookupWorkshopName(newRow.workshop_id),
    lookupVendorTelegramUsername(newRow.assigned_vendor_id),
  ]);

  const ctx: FormatContext = { order: newRow, workshopName, vendorTelegramUsername };
  await sendToGroup(formatVendorMention(ctx, 'editó datos del vehículo'));
}

// ─── Endpoint ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validar secret
  let expectedSecret: string;
  try {
    expectedSecret = getWebhookSecret();
  } catch (err) {
    console.error('[Webhook] Config error:', err);
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }

  const providedSecret = req.headers.get('x-supabase-signature');
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Parsear payload
  let payload: SupabaseWebhookPayload;
  try {
    payload = (await req.json()) as SupabaseWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  // 3. Despachar según tabla + tipo
  try {
    if (payload.table === 'order_events' && payload.type === 'INSERT' && payload.record) {
      await handleOrderEventInsert(payload.record as unknown as OrderEventRecord);
    } else if (
      payload.table === 'orders' &&
      payload.type === 'UPDATE' &&
      payload.record &&
      payload.old_record
    ) {
      await handleOrderUpdate(
        payload.old_record as unknown as OrderRecord,
        payload.record as unknown as OrderRecord
      );
    }
    // INSERT en orders: no notificamos acá; lo cubre el evento `pedido_creado`
    // que se inserta inmediatamente después en order_events.

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Webhook] handler error:', msg);
    // Devolvemos 200 igual para que Supabase no reintente en loop por errores
    // transitorios de Telegram. Logueamos para investigar.
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}

/**
 * GET de health-check: confirma que el endpoint está vivo y la config presente.
 * NO devuelve secretos.
 */
export async function GET(): Promise<NextResponse> {
  try {
    getWebhookSecret();
    return NextResponse.json({
      ok: true,
      endpoint: 'supabase → telegram',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
