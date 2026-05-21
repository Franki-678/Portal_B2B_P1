/**
 * Telegram Bot — Incoming Webhook Handler.
 *
 * Registrar el webhook con:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://TU_DOMINIO/api/webhooks/telegram/bot&secret_token=<últimos-20-chars-del-token>"
 *
 * Comandos disponibles (solo desde TELEGRAM_ADMIN_ID):
 *   /hoy        — Resumen del día actual vs. ayer
 *   /vendedores — Ranking mensual + comparativa MoM + semana
 *   /alertas    — Pedidos estancados >48h + conflictos sin resolver con deep links
 *
 * SEGURIDAD: Solo TELEGRAM_ADMIN_ID puede ejecutar comandos.
 * Cualquier otro chat recibe silencio absoluto (sin respuesta).
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
  type ConflictOrder,
} from '@/lib/telegram/formatters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Supabase service client ──────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Telegram helper ─────────────────────────────────────────────────────

async function sendReply(chatId: number, text: string): Promise<void> {
  const { botToken } = getTelegramConfig();
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:                  chatId,
      text,
      parse_mode:               'HTML',
      disable_web_page_preview: true,
    }),
  });
}

// ─── Date range helpers ───────────────────────────────────────────────────

function dayRange(daysAgo = 0): { start: string; end: string } {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  const end   = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthRange(monthOffset = 0): { start: string; end: string } {
  const now   = new Date();
  const m     = now.getMonth() + monthOffset;
  const y     = now.getFullYear() + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const start = new Date(y, month, 1);
  const end   = new Date(y, month + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Lunes de la semana actual */
function weekRange(): { start: string; end: string } {
  const now     = new Date();
  const day     = now.getDay(); // 0=dom
  const monday  = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const end     = new Date(monday.getTime() + 7 * 86_400_000);
  return { start: monday.toISOString(), end: end.toISOString() };
}

function monthName(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return d.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
}

// ─── Helpers para calcular montos facturados ──────────────────────────────

async function calcFacturado(
  sb: ReturnType<typeof getServiceClient>,
  orderIds: string[]
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const { data } = await sb
    .from('quote_items')
    .select('price, quantity_offered, approved, quotes!inner(order_id)')
    .in('quotes.order_id', orderIds)
    .neq('approved', false);
  return (data ?? []).reduce(
    (acc: number, i: any) => acc + (Number(i.price) || 0) * (Number(i.quantity_offered) || 1),
    0
  );
}

// ─── /hoy ─────────────────────────────────────────────────────────────────

async function buildHoySnapshot(): Promise<HoySnapshot> {
  const sb    = getServiceClient();
  const today = dayRange(0);
  const ayer  = dayRange(1);
  const now   = new Date();

  const fecha     = now.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaActual = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const [deliveredHoy, deliveredAyer, newHoy, newAyer, allOrders] = await Promise.all([
    sb.from('orders').select('id').eq('status', 'cerrado_pagado').gte('updated_at', today.start).lt('updated_at', today.end),
    sb.from('orders').select('id').eq('status', 'cerrado_pagado').gte('updated_at', ayer.start).lt('updated_at', ayer.end),
    sb.from('orders').select('id').gte('created_at', today.start).lt('created_at', today.end),
    sb.from('orders').select('id').gte('created_at', ayer.start).lt('created_at', ayer.end),
    sb.from('orders').select('id, status'),
  ]);

  const deliveredIdsHoy  = (deliveredHoy.data  ?? []).map((r: any) => r.id);
  const deliveredIdsAyer = (deliveredAyer.data ?? []).map((r: any) => r.id);

  const all = (allOrders.data ?? []) as any[];
  const pendientesTotal   = all.filter(r => r.status === 'pendiente' || r.status === 'en_revision').length;
  const enConflictoTotal  = all.filter(r => r.status === 'en_conflicto').length;

  const [facturadoHoy, facturadoAyer] = await Promise.all([
    calcFacturado(sb, deliveredIdsHoy),
    calcFacturado(sb, deliveredIdsAyer),
  ]);

  return {
    fecha,
    horaActual,
    facturadoHoy,
    entregadosHoy:  deliveredIdsHoy.length,
    nuevosHoy:      (newHoy.data  ?? []).length,
    pendientesTotal,
    enConflictoTotal,
    facturadoAyer,
    entregadosAyer:  deliveredIdsAyer.length,
    nuevosAyer:      (newAyer.data ?? []).length,
  };
}

// ─── /vendedores ──────────────────────────────────────────────────────────

async function buildVendedoresSnapshot(): Promise<VendorLeaderboard> {
  const sb       = getServiceClient();
  const curMonth = monthRange(0);
  const prevMonth = monthRange(-1);
  const week     = weekRange();

  const [ordersCur, ordersPrev, ordersWeek] = await Promise.all([
    sb.from('orders').select('id, assigned_vendor_id').eq('status', 'cerrado_pagado')
      .gte('updated_at', curMonth.start).lt('updated_at', curMonth.end),
    sb.from('orders').select('id').eq('status', 'cerrado_pagado')
      .gte('updated_at', prevMonth.start).lt('updated_at', prevMonth.end),
    sb.from('orders').select('id').eq('status', 'cerrado_pagado')
      .gte('updated_at', week.start).lt('updated_at', week.end),
  ]);

  const curOrders  = (ordersCur.data  ?? []) as any[];
  const prevOrders = (ordersPrev.data ?? []) as any[];
  const weekOrders = (ordersWeek.data ?? []) as any[];

  const curIds   = curOrders.map(o => o.id);
  const prevIds  = prevOrders.map(o => o.id);
  const weekIds  = weekOrders.map(o => o.id);

  const vendorIds = [...new Set(curOrders.map(o => o.assigned_vendor_id).filter(Boolean))];

  const [profiles, qCur, qPrev, qWeek] = await Promise.all([
    vendorIds.length > 0
      ? sb.from('profiles').select('id, name').in('id', vendorIds)
      : Promise.resolve({ data: [] }),
    calcFacturado(sb, curIds),
    calcFacturado(sb, prevIds),
    calcFacturado(sb, weekIds),
  ]);

  const profileMap: Record<string, string> = {};
  ((profiles as any).data ?? []).forEach((p: any) => { profileMap[p.id] = p.name ?? 'Vendedor'; });

  // Ranking por vendedor (mes actual)
  const statsMap: Record<string, { entregados: number; facturado: number }> = {};
  curOrders.forEach(o => {
    const vid = o.assigned_vendor_id;
    if (!vid) return;
    if (!statsMap[vid]) statsMap[vid] = { entregados: 0, facturado: 0 };
    statsMap[vid].entregados++;
  });

  // Para facturado individual necesitamos los quote_items por vendedor
  // Usamos la misma query pero filtrando por order_id del vendedor
  if (curIds.length > 0) {
    const { data: qItems } = await sb
      .from('quote_items')
      .select('price, quantity_offered, approved, quotes!inner(order_id)')
      .in('quotes.order_id', curIds)
      .neq('approved', false);

    const orderVendorMap: Record<string, string> = {};
    curOrders.forEach(o => { orderVendorMap[o.id] = o.assigned_vendor_id; });

    (qItems ?? []).forEach((qi: any) => {
      const orderId = qi.quotes?.order_id;
      if (!orderId) return;
      const vid = orderVendorMap[orderId];
      if (!vid || !statsMap[vid]) return;
      statsMap[vid].facturado += (Number(qi.price) || 0) * (Number(qi.quantity_offered) || 1);
    });
  }

  const vendedores: VendorStat[] = Object.entries(statsMap)
    .map(([id, s]) => ({ name: profileMap[id] ?? 'Vendedor', ...s }))
    .sort((a, b) => b.facturado - a.facturado);

  return {
    vendedores,
    periodo:              monthName(0),
    totalFacturadoMes:   qCur,
    totalEntregadosMes:  curOrders.length,
    facturadoMesAnterior:  qPrev,
    entregadosMesAnterior: prevOrders.length,
    periodoAnterior:       monthName(-1),
    facturadoSemana:       qWeek,
    entregadosSemana:      weekOrders.length,
  };
}

// ─── /alertas ─────────────────────────────────────────────────────────────

async function buildAlertasSnapshot(): Promise<AlertasSnapshot> {
  const sb     = getServiceClient();
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

  const sinAsignar = all.filter(o => o.status === 'pendiente' && !o.assigned_vendor_id).length;

  // Conflictos activos (con deep links generados via label)
  const conflictOrders: ConflictOrder[] = all
    .filter(o => o.status === 'en_conflicto')
    .map(o => {
      const taller = o.workshop?.taller_number;
      const orderN = o.workshop_order_number;
      const label  = taller != null && orderN != null
        ? `${String(taller).padStart(2, '0')}-PED-${String(orderN).padStart(4, '0')}`
        : orderN != null
          ? `PED-${String(orderN).padStart(4, '0')}`
          : o.id.slice(0, 8).toUpperCase();
      const horas  = Math.floor((Date.now() - new Date(o.updated_at).getTime()) / 3_600_000);
      return { label, workshopName: o.workshop?.name ?? '?', horasEnConflicto: horas };
    })
    .sort((a, b) => b.horasEnConflicto - a.horasEnConflicto);

  // Pedidos estancados >48h en revisión
  const bottlenecks: BottleneckOrder[] = all
    .filter(o => o.status === 'en_revision' && o.updated_at < cutoff)
    .map(o => {
      const taller = o.workshop?.taller_number;
      const orderN = o.workshop_order_number;
      const label  = taller != null && orderN != null
        ? `${String(taller).padStart(2, '0')}-PED-${String(orderN).padStart(4, '0')}`
        : orderN != null
          ? `PED-${String(orderN).padStart(4, '0')}`
          : o.id.slice(0, 8).toUpperCase();
      const horas  = Math.floor((Date.now() - new Date(o.updated_at).getTime()) / 3_600_000);
      return { label, workshopName: o.workshop?.name ?? '?', horasEstancado: horas };
    })
    .sort((a, b) => b.horasEstancado - a.horasEstancado);

  return {
    bottlenecks,
    conflictOrders,
    enConflicto: conflictOrders.length,
    sinAsignar,
  };
}

// ─── Handler principal ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validar secret_token (Telegram lo manda como header X-Telegram-Bot-Api-Secret-Token)
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  const { botToken, adminId } = getTelegramConfig();
  if (secret && secret !== botToken.slice(-20)) {
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

  // ── SEGURIDAD: solo TELEGRAM_ADMIN_ID puede usar comandos ───────────────
  // Comparamos como número para manejar IDs negativos (grupos) y positivos (privados).
  const adminChatId = parseInt(adminId, 10);
  if (chatId !== adminChatId) {
    // Silencio absoluto — no respondemos ni con error para no revelar que el bot existe
    return NextResponse.json({ ok: true, reason: 'unauthorized_chat' });
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
        [
          `ℹ️ <b>Comandos disponibles:</b>`,
          `/hoy — resumen del día vs. ayer`,
          `/vendedores — ranking mensual + crecimiento MoM`,
          `/alertas — cuellos de botella y conflictos activos`,
        ].join('\n')
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[TG-BOT] Error procesando comando:', command, msg);
    await sendReply(chatId, `❌ Error interno al procesar <code>${command}</code>. Intentá de nuevo en unos segundos.`);
  }

  return NextResponse.json({ ok: true });
}
