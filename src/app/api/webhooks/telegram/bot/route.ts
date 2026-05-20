/**
 * Telegram Bot — Incoming Webhook Handler.
 *
 * Registrar el webhook con:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://TU_DOMINIO/api/webhooks/telegram/bot"
 *
 * Comandos disponibles:
 *   /hoy        — Resumen del día actual (facturado, entregados, nuevos)
 *   /vendedores — Ranking de vendedores del mes
 *   /alertas    — Pedidos atascados + conflictos + sin asignar
 *
 * Seguridad: Telegram no tiene firma HMAC en los updates estándar.
 * Validamos que el bot token en la URL (via secret_token de setWebhook)
 * coincida con TELEGRAM_BOT_TOKEN como capa básica de protección.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTelegramConfig } from '@/lib/telegram/config';
import {
  formatSlashHoy,
  formatSlashVendedores,
  formatSlashAlertas,
  type HoySnapshot,
  type VendorLeaderboard,
  type AlertasSnapshot,
  type VendorStat,
  type BottleneckOrder,
} from '@/lib/telegram/formatters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Supabase service client ──────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Telegram helper: responder a un chat_id ─────────────────────────────

async function sendReply(chatId: number, text: string): Promise<void> {
  const { botToken } = getTelegramConfig();
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────

function todayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthRange(): { start: string; end: string } {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function buildHoySnapshot(): Promise<HoySnapshot> {
  const sb = getServiceClient();
  const { start, end } = todayRange();
  const fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  const [delivered, newOrders, allOrders] = await Promise.all([
    // Entregados hoy (cerrado_pagado con updated_at hoy)
    sb.from('orders')
      .select('id')
      .eq('status', 'cerrado_pagado')
      .gte('updated_at', start)
      .lt('updated_at', end),
    // Nuevos hoy
    sb.from('orders')
      .select('id')
      .gte('created_at', start)
      .lt('created_at', end),
    // Total activos para pendientes + conflictos
    sb.from('orders').select('id, status'),
  ]);

  const deliveredIds = (delivered.data ?? []).map((r: any) => r.id);
  const pendientesTotal = (allOrders.data ?? []).filter(
    (r: any) => r.status === 'pendiente' || r.status === 'en_revision'
  ).length;
  const enConflictoTotal = (allOrders.data ?? []).filter((r: any) => r.status === 'en_conflicto').length;

  // Calcular monto facturado hoy: quotes aprobadas de pedidos entregados hoy
  let facturadoHoy = 0;
  if (deliveredIds.length > 0) {
    const { data: qItems } = await sb
      .from('quote_items')
      .select('price, quantity_offered, approved, quotes!inner(order_id)')
      .in('quotes.order_id', deliveredIds)
      .neq('approved', false);
    facturadoHoy = (qItems ?? []).reduce(
      (acc: number, i: any) => acc + (i.price ?? 0) * (i.quantity_offered ?? 1),
      0
    );
  }

  return {
    fecha,
    facturadoHoy,
    entregadosHoy: deliveredIds.length,
    nuevosHoy: (newOrders.data ?? []).length,
    pendientesTotal,
    enConflictoTotal,
  };
}

async function buildVendedoresSnapshot(): Promise<VendorLeaderboard> {
  const sb = getServiceClient();
  const { start, end } = monthRange();
  const now  = new Date();
  const periodo = `${now.toLocaleString('es-AR', { month: 'long' })} ${now.getFullYear()}`;

  // Pedidos entregados este mes
  const { data: orders } = await sb
    .from('orders')
    .select('id, assigned_vendor_id')
    .eq('status', 'cerrado_pagado')
    .gte('updated_at', start)
    .lt('updated_at', end);

  if (!orders || orders.length === 0) {
    return { vendedores: [], periodo };
  }

  const vendorIds = [...new Set((orders as any[]).map(o => o.assigned_vendor_id).filter(Boolean))];
  const orderIds  = (orders as any[]).map(o => o.id);

  const [profiles, qItems] = await Promise.all([
    sb.from('profiles').select('id, name').in('id', vendorIds),
    sb.from('quote_items')
      .select('price, quantity_offered, approved, quotes!inner(order_id)')
      .in('quotes.order_id', orderIds)
      .neq('approved', false),
  ]);

  const profileMap: Record<string, string> = {};
  (profiles.data ?? []).forEach((p: any) => { profileMap[p.id] = p.name ?? 'Vendedor'; });

  const orderVendorMap: Record<string, string> = {};
  (orders as any[]).forEach(o => { orderVendorMap[o.id] = o.assigned_vendor_id; });

  // Acumular por vendedor
  const statsMap: Record<string, { entregados: number; facturado: number }> = {};
  (orders as any[]).forEach(o => {
    const vid = o.assigned_vendor_id;
    if (!vid) return;
    if (!statsMap[vid]) statsMap[vid] = { entregados: 0, facturado: 0 };
    statsMap[vid].entregados++;
  });
  (qItems.data ?? []).forEach((qi: any) => {
    const orderId = qi.quotes?.order_id;
    if (!orderId) return;
    const vid = orderVendorMap[orderId];
    if (!vid || !statsMap[vid]) return;
    statsMap[vid].facturado += (qi.price ?? 0) * (qi.quantity_offered ?? 1);
  });

  const vendedores: VendorStat[] = Object.entries(statsMap)
    .map(([id, s]) => ({ name: profileMap[id] ?? 'Vendedor', ...s }))
    .sort((a, b) => b.facturado - a.facturado);

  return { vendedores, periodo };
}

async function buildAlertasSnapshot(): Promise<AlertasSnapshot> {
  const sb = getServiceClient();
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();

  const { data: orders } = await sb
    .from('orders')
    .select(`
      id,
      status,
      assigned_vendor_id,
      workshop_order_number,
      updated_at,
      workshop:workshops(name, taller_number)
    `);

  const all = (orders ?? []) as any[];

  const sinAsignar = all.filter(
    o => o.status === 'pendiente' && !o.assigned_vendor_id
  ).length;

  const enConflicto = all.filter(o => o.status === 'en_conflicto').length;

  const bottlenecks: BottleneckOrder[] = all
    .filter(o => o.status === 'en_revision' && o.updated_at < cutoff)
    .map(o => {
      const horas = Math.floor((Date.now() - new Date(o.updated_at).getTime()) / 3_600_000);
      const taller  = o.workshop?.taller_number;
      const orderN  = o.workshop_order_number;
      const label   = taller != null && orderN != null
        ? `${String(taller).padStart(2, '0')}-PED-${String(orderN).padStart(4, '0')}`
        : orderN != null
          ? `PED-${String(orderN).padStart(4, '0')}`
          : o.id.slice(0, 8).toUpperCase();
      return { label, horasEstancado: horas, workshopName: o.workshop?.name ?? '?' };
    })
    .sort((a, b) => b.horasEstancado - a.horasEstancado);

  return { bottlenecks, enConflicto, sinAsignar };
}

// ─── Handler principal ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validar secret_token (Telegram lo manda como header X-Telegram-Bot-Api-Secret-Token)
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  const { botToken } = getTelegramConfig();
  if (secret && secret !== botToken.slice(-20)) {
    // Si el cliente configuró secret_token al registrar el webhook, validamos
    return NextResponse.json({ ok: false, error: 'invalid_secret' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const message = body?.message ?? body?.channel_post;
  if (!message) {
    return NextResponse.json({ ok: true, reason: 'no_message' });
  }

  const chatId: number = message.chat?.id;
  const text: string   = (message.text ?? '').trim();

  if (!text.startsWith('/')) {
    return NextResponse.json({ ok: true, reason: 'not_a_command' });
  }

  // Extraer comando (ignorar @botname suffix y args)
  const command = text.split('@')[0].split(' ')[0].toLowerCase();

  try {
    if (command === '/hoy') {
      const snap = await buildHoySnapshot();
      await sendReply(chatId, formatSlashHoy(snap));
    } else if (command === '/vendedores') {
      const data = await buildVendedoresSnapshot();
      await sendReply(chatId, formatSlashVendedores(data));
    } else if (command === '/alertas') {
      const data = await buildAlertasSnapshot();
      await sendReply(chatId, formatSlashAlertas(data));
    } else {
      await sendReply(
        chatId,
        `ℹ️ Comandos disponibles:\n/hoy — resumen del día\n/vendedores — ranking del mes\n/alertas — cuellos de botella y conflictos`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[TG-BOT] Error procesando comando:', command, msg);
    await sendReply(chatId, `❌ Error interno al procesar <code>${command}</code>. Intentá de nuevo en unos segundos.`);
  }

  return NextResponse.json({ ok: true });
}
