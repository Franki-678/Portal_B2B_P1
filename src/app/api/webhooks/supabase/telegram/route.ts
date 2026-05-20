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
 *
 * MODO TEST: POST con header `x-test-mode: true` y body `{ "test": "ping" }` o
 * `{ "test": "approved-mock" }` para verificar Telegram sin pasar por DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTelegramConfig, getWebhookSecret } from '@/lib/telegram/config';
import {
  formatEventForGroup,
  formatVendorMention,
  type OrderRecord,
  type OrderEventRecord,
  type FormatContext,
} from '@/lib/telegram/formatters';
import { sendToGroup, pingBot } from '@/lib/telegram/service';

// Necesitamos runtime Node (no Edge) para @supabase/supabase-js + service-role.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Logger con prefijo + timestamp ──────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const ts = new Date().toISOString();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[TG-WH ${ts}]`, ...args);
}

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

// ─── Tipos internos de la query relacional ────────────────────────────────

/**
 * Resultado enriquecido de `lookupOrder`: incluye el pedido más los datos
 * resueltos via JOIN (nombre del taller y nombre/telegram del vendedor).
 * Reemplaza las llamadas separadas a lookupWorkshopName y lookupVendorTelegramUsername.
 */
interface OrderQueryResult {
  order: OrderRecord;
  workshopName: string;
  /** Username de Telegram sin @ ni espacios. Null si el vendedor no tiene. */
  vendorTelegramUsername: string | null;
  /** Nombre real del vendedor (profiles.name). Null si no hay vendedor asignado. */
  vendorName: string | null;
}

// ─── Lookups ──────────────────────────────────────────────────────────────

/**
 * Busca el pedido en la DB junto con el nombre del taller y los datos del
 * vendedor en una sola query relacional.
 *
 * La sintaxis `workshop:workshops(name)` y `vendor:profiles!assigned_vendor_id(...)`
 * usa las FK de Supabase para hacer el JOIN en un solo round-trip:
 *   - orders.workshop_id       → workshops.id
 *   - orders.assigned_vendor_id → profiles.id
 */
async function lookupOrder(orderId: string): Promise<OrderQueryResult | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('orders')
    .select(
      `id,
       workshop_id,
       status,
       workshop_order_number,
       assigned_vendor_id,
       vehicle_brand,
       vehicle_model,
       vehicle_year,
       created_at,
       updated_at,
       workshop:workshops(name),
       vendor:profiles!assigned_vendor_id(name, telegram_username)`
    )
    .eq('id', orderId)
    .single();

  if (error) {
    log('error', 'lookupOrder query error:', error.message);
    return null;
  }
  if (!data) return null;

  // Supabase retorna las relaciones como objetos anidados.
  const row = data as unknown as {
    id: string;
    workshop_id: string;
    status: OrderRecord['status'];
    workshop_order_number: number | null;
    assigned_vendor_id: string | null;
    vehicle_brand: string;
    vehicle_model: string;
    vehicle_year: number;
    created_at: string;
    updated_at: string;
    workshop: { name: string } | null;
    vendor: { name: string; telegram_username: string | null } | null;
  };

  const order: OrderRecord = {
    id: row.id,
    workshop_id: row.workshop_id,
    status: row.status,
    workshop_order_number: row.workshop_order_number,
    assigned_vendor_id: row.assigned_vendor_id,
    vehicle_brand: row.vehicle_brand,
    vehicle_model: row.vehicle_model,
    vehicle_year: row.vehicle_year,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const rawTelegram = row.vendor?.telegram_username;
  const vendorTelegramUsername = rawTelegram?.trim()
    ? rawTelegram.trim().replace(/^@+/, '')
    : null;

  return {
    order,
    workshopName: row.workshop?.name ?? 'Taller',
    vendorTelegramUsername,
    vendorName: row.vendor?.name ?? null,
  };
}

/**
 * Resuelve el nombre del actor de un evento desde `profiles.name`.
 * La tabla `order_events` solo guarda user_id; el name se inyecta acá.
 */
async function lookupUserName(userId: string | null): Promise<string> {
  if (!userId) return 'Usuario';
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .single();
  if (error || !data) return 'Usuario';
  return (data as { name: string | null }).name ?? 'Usuario';
}

async function lookupApprovedTotal(orderId: string): Promise<number | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('quote_items')
    .select('price, quantity_offered, approved, quotes!inner(order_id)')
    .eq('quotes.order_id', orderId);
  if (error) {
    log('warn', 'lookupApprovedTotal error:', error.message);
    return null;
  }
  if (!data) return null;
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

interface HandleResult {
  ok: boolean;
  reason?: string;
  telegramError?: string;
  msgSnippet?: string;
}

async function handleOrderEventInsert(event: OrderEventRecord): Promise<HandleResult> {
  log('info', 'order_events INSERT:', { eventId: event.id, action: event.action, orderId: event.order_id });

  // Una sola query: pedido + taller + vendedor via JOIN relacional.
  const result = await lookupOrder(event.order_id);
  if (!result) {
    log('warn', 'Order no encontrada — evento descartado');
    return { ok: false, reason: 'order_not_found' };
  }

  const { order, workshopName, vendorTelegramUsername, vendorName } = result;

  // lookupApprovedTotal y lookupUserName siguen siendo queries separadas
  // porque no tienen FK directa desde orders.
  const [approvedTotal, actorName] = await Promise.all([
    eventNeedsTotal(event.action) ? lookupApprovedTotal(order.id) : Promise.resolve(null),
    lookupUserName(event.user_id),
  ]);

  log('info', 'context resolved:', {
    workshop: workshopName,
    vendor: vendorTelegramUsername,
    vendorName,
    total: approvedTotal,
    actor: actorName,
  });

  // Inyectar user_name resuelto desde profiles
  const enrichedEvent: OrderEventRecord = { ...event, user_name: actorName };
  const ctx: FormatContext = { order, workshopName, vendorTelegramUsername, vendorName, approvedTotal };
  const msg = formatEventForGroup(enrichedEvent, ctx);
  if (!msg) {
    log('info', 'evento silenciado por formatter:', event.action);
    return { ok: true, reason: 'silenced_event' };
  }

  const send = await sendToGroup(msg);
  if (!send.ok) {
    log('error', 'Telegram sendToGroup falló:', send.error);
    return { ok: false, telegramError: send.error, msgSnippet: msg.slice(0, 120) };
  }
  log('info', 'mensaje enviado OK al grupo');
  return { ok: true, msgSnippet: msg.slice(0, 120) };
}

async function handleOrderUpdate(oldRow: OrderRecord, newRow: OrderRecord): Promise<HandleResult> {
  if (oldRow.status !== newRow.status) {
    return { ok: true, reason: 'status_change_handled_by_event' };
  }
  if (!newRow.assigned_vendor_id) {
    return { ok: true, reason: 'no_vendor_assigned' };
  }

  const significantChange =
    oldRow.vehicle_brand !== newRow.vehicle_brand ||
    oldRow.vehicle_model !== newRow.vehicle_model ||
    oldRow.vehicle_year !== newRow.vehicle_year;
  if (!significantChange) {
    return { ok: true, reason: 'no_significant_change' };
  }

  // Usamos lookupOrder para obtener taller + vendedor en una sola query.
  const result = await lookupOrder(newRow.id);
  if (!result) {
    log('warn', 'handleOrderUpdate: order no encontrada para lookup relacional');
    return { ok: false, reason: 'order_not_found' };
  }

  const { order, workshopName, vendorTelegramUsername, vendorName } = result;
  const ctx: FormatContext = { order, workshopName, vendorTelegramUsername, vendorName };
  const msg = formatVendorMention(ctx, 'editó datos del vehículo');
  const send = await sendToGroup(msg);
  if (!send.ok) {
    log('error', 'mention falló:', send.error);
    return { ok: false, telegramError: send.error };
  }
  return { ok: true };
}

// ─── Modo TEST: bypass DB para probar Telegram directo ────────────────────

async function handleTestMode(body: { test: string }): Promise<NextResponse> {
  if (body.test === 'ping') {
    const ping = await pingBot();
    return NextResponse.json({ mode: 'test', step: 'pingBot', ...ping });
  }
  if (body.test === 'group-hello') {
    const send = await sendToGroup(
      '🧪 <b>[TEST]</b>\nMensaje de prueba desde el endpoint webhook.\n<i>Si ves esto, el bot tiene permisos en el grupo.</i>'
    );
    return NextResponse.json({ mode: 'test', step: 'sendToGroup', ...send });
  }
  if (body.test === 'approved-mock') {
    const mockOrder: OrderRecord = {
      id: 'test-uuid-0000',
      workshop_id: 'workshop-mock',
      status: 'aprobado',
      workshop_order_number: 9999,
      assigned_vendor_id: 'vendor-mock',
      vehicle_brand: 'Toyota',
      vehicle_model: 'Hilux',
      vehicle_year: 2018,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const mockEvent: OrderEventRecord = {
      id: 'event-mock',
      order_id: mockOrder.id,
      user_id: 'taller-mock',
      user_name: 'Roberto Funes',
      action: 'cotizacion_aprobada',
      comment: 'Test desde endpoint',
      created_at: new Date().toISOString(),
    };
    const ctx: FormatContext = {
      order: mockOrder,
      workshopName: 'Taller QA',
      vendorTelegramUsername: 'Franco_San_Martin',
      vendorName: 'Lucas Pereyra',   // resuelto via JOIN en producción
      approvedTotal: 125000,
    };
    const msg = formatEventForGroup(mockEvent, ctx);
    if (!msg) return NextResponse.json({ mode: 'test', step: 'format', ok: false, reason: 'empty_msg' });
    const send = await sendToGroup(msg);
    return NextResponse.json({ mode: 'test', step: 'sendToGroup', ...send, msg });
  }
  return NextResponse.json(
    { mode: 'test', error: 'unknown test command', available: ['ping', 'group-hello', 'approved-mock'] },
    { status: 400 }
  );
}

// ─── Endpoint ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validar secret (en modo test relajamos)
  let expectedSecret: string;
  try {
    expectedSecret = getWebhookSecret();
  } catch (err) {
    log('error', 'config error:', err);
    return NextResponse.json({ error: 'misconfigured', detail: String(err) }, { status: 500 });
  }

  const providedSecret = req.headers.get('x-supabase-signature');
  const isTestMode = req.headers.get('x-test-mode') === 'true';

  if (providedSecret !== expectedSecret) {
    log('warn', 'unauthorized request — header mismatch', {
      provided: providedSecret ? `${providedSecret.slice(0, 4)}...` : 'null',
      expectedPrefix: expectedSecret.slice(0, 4) + '...',
    });
    return NextResponse.json(
      { error: 'unauthorized', hint: 'x-supabase-signature header inválido o ausente' },
      { status: 401 }
    );
  }

  // 2. Parsear payload
  let payload: SupabaseWebhookPayload | { test: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  // 3. Modo test
  if (isTestMode && 'test' in payload) {
    return handleTestMode(payload as { test: string });
  }

  const wh = payload as SupabaseWebhookPayload;
  log('info', 'webhook incoming:', { table: wh.table, type: wh.type });

  // 4. Dispatch
  try {
    let result: HandleResult = { ok: true, reason: 'no_handler' };

    if (wh.table === 'order_events' && wh.type === 'INSERT' && wh.record) {
      result = await handleOrderEventInsert(wh.record as unknown as OrderEventRecord);
    } else if (wh.table === 'orders' && wh.type === 'UPDATE' && wh.record && wh.old_record) {
      result = await handleOrderUpdate(
        wh.old_record as unknown as OrderRecord,
        wh.record as unknown as OrderRecord
      );
    } else {
      log('info', 'sin handler para esta combinación');
    }

    // Devolvemos el resultado real (sin retry automático de Supabase incluso si ok:false,
    // porque los errores de Telegram NO son recuperables con reintentos).
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    log('error', 'handler exception:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}

/**
 * GET healthcheck COMPLETO: chequea todas las env vars y opcionalmente pingea al bot.
 *   ?ping=1 → además llama a Telegram getMe para validar el token.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const wantPing = url.searchParams.get('ping') === '1';

  const checks = {
    webhookSecret: !!process.env.SUPABASE_WEBHOOK_SECRET,
    botToken:      !!process.env.TELEGRAM_BOT_TOKEN,
    groupId:       !!process.env.TELEGRAM_GROUP_ID,
    adminId:       !!process.env.TELEGRAM_ADMIN_ID,
    supabaseUrl:   !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRole:   !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const allOk = Object.values(checks).every(Boolean);

  let bot: { ok: boolean; username?: string; error?: string } | null = null;
  if (wantPing && checks.botToken) {
    try {
      const p = await pingBot();
      bot = { ok: p.ok, username: p.botUsername, error: p.error };
    } catch (err) {
      bot = { ok: false, error: err instanceof Error ? err.message : 'unknown' };
    }
  }

  // Confirmar también que la config del bot esté disponible
  let configOk = false;
  try {
    getTelegramConfig();
    configOk = true;
  } catch {
    configOk = false;
  }

  return NextResponse.json({
    ok: allOk && configOk,
    endpoint: 'supabase → telegram',
    timestamp: new Date().toISOString(),
    envChecks: checks,
    configOk,
    bot,
  });
}
