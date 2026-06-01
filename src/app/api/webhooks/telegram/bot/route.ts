/**
 * Telegram Bot — Incoming Webhook Handler.
 *
 * Registrar el webhook con:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://TU_DOMINIO/api/webhooks/telegram/bot&secret_token=<últimos-20-chars-del-token>"
 *
 * Comandos disponibles (solo desde TELEGRAM_ADMIN_ID):
 *   /hoy        — Resumen del día vs. ayer
 *   /semana     — Facturación de la semana actual vs. mismos días de la semana pasada (WoW)
 *   /mes        — Facturación desde el día 1 del mes vs. mismo período del mes anterior (MoM)
 *   /vendedores — Ranking puro del mes en curso: quién vendió más y cuántos pedidos cerró
 *   /alertas    — Pedidos estancados >48h + conflictos con deep links
 *
 * SEGURIDAD: Solo TELEGRAM_ADMIN_ID puede ejecutar comandos.
 * Cualquier otro chat recibe silencio absoluto (sin respuesta).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTelegramConfig } from '@/lib/telegram/config';
import {
  formatSlashHoy,
  formatSlashSemana,
  formatSlashMes,
  formatSlashVendedores,
  formatSlashAlertas,
  formatSlashDeuda,
  formatSlashMostrador,
  formatSlashBuscar,
  formatSlashTalleresDeudores,
  formatSlashEstadoServidor,
  type HoySnapshot,
  type SemanaSnapshot,
  type MesSnapshot,
  type VendorLeaderboard,
  type AlertasSnapshot,
  type VendorStat,
  type BottleneckOrder,
  type ConflictOrder,
  type DeudaSnapshot,
  type MostradorSnapshot,
  type BuscarSnapshot,
  type TallerDeudor,
} from '@/lib/telegram/formatters';

const SERVER_START = Date.now();

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

/** Rango de un día específico (daysAgo=0 → hoy, 1 → ayer). */
function dayRange(daysAgo = 0): { start: string; end: string } {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  const end   = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Rango completo de un mes calendario (mes actual u offset). */
function fullMonthRange(monthOffset = 0): { start: string; end: string } {
  const now   = new Date();
  const m     = now.getMonth() + monthOffset;
  const y     = now.getFullYear() + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const start = new Date(y, month, 1);
  const end   = new Date(y, month + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Nombre legible de un mes (ej: "mayo 2026"). */
function monthName(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return d.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
}

// ── Rangos para WoW ──────────────────────────────────────────────────────

/**
 * Semana actual: desde el lunes de esta semana 00:00 hasta ahora.
 * Semana anterior: misma ventana pero 7 días antes.
 *
 * Ejemplo (hoy = martes):
 *   cur:  lun 00:00 → mar 15:30
 *   prev: lun-7 00:00 → mar-7 15:30
 */
function weekComparisionRanges(): {
  cur:  { start: string; end: string };
  prev: { start: string; end: string };
  labelCur:  string;
  labelPrev: string;
  daysElapsed: number;
} {
  const now = new Date();
  const dayOfWeek   = now.getDay(); // 0=Dom 1=Lun … 6=Sab
  const daysFromMon = (dayOfWeek + 6) % 7; // Lun=0, Mar=1, … Dom=6

  const thisMonday = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() - daysFromMon, 0, 0, 0, 0
  );
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86_400_000);
  // "Ahora - 7 días" = mismo instante de la semana pasada
  const nowMinus7  = new Date(now.getTime()      - 7 * 86_400_000);

  const fmt = (d: Date) =>
    d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });

  return {
    cur:  { start: thisMonday.toISOString(), end: now.toISOString() },
    prev: { start: lastMonday.toISOString(), end: nowMinus7.toISOString() },
    labelCur:    `${fmt(thisMonday)} → ${fmt(now)}`,
    labelPrev:   `${fmt(lastMonday)} → ${fmt(nowMinus7)}`,
    daysElapsed: daysFromMon + 1,
  };
}

// ── Rangos para MoM ──────────────────────────────────────────────────────

/**
 * Mes actual: desde el día 1 del mes en curso 00:00 hasta ahora.
 * Mes anterior: desde el día 1 del mes pasado 00:00 hasta el mismo día del mes pasado.
 *
 * Si el mes anterior tiene menos días (ej: feb), se limita al último día disponible.
 *
 * Ejemplo (hoy = 20 de mayo):
 *   cur:  1 may 00:00 → 20 may 15:30
 *   prev: 1 abr 00:00 → 20 abr 15:30
 */
function monthComparisonRanges(): {
  cur:  { start: string; end: string };
  prev: { start: string; end: string };
  diaActual:      number;
  diaComparacion: number;
  mesActual:      string;
  mesAnterior:    string;
} {
  const now = new Date();

  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  // Último día del mes anterior
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const endDay           = Math.min(now.getDate(), lastDayPrevMonth);

  const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const endOfPrevPeriod  = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    endDay,
    now.getHours(), now.getMinutes(), now.getSeconds(), 999
  );

  return {
    cur:  { start: firstOfThisMonth.toISOString(), end: now.toISOString() },
    prev: { start: firstOfPrevMonth.toISOString(), end: endOfPrevPeriod.toISOString() },
    diaActual:      now.getDate(),
    diaComparacion: endDay,
    mesActual:      monthName(0),
    mesAnterior:    monthName(-1),
  };
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

  const fecha      = now.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
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
  const pendientesTotal  = all.filter(r => r.status === 'pendiente' || r.status === 'en_revision').length;
  const enConflictoTotal = all.filter(r => r.status === 'en_conflicto').length;

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

// ─── /semana (Week-over-Week) ─────────────────────────────────────────────

async function buildSemanaSnapshot(): Promise<SemanaSnapshot> {
  const sb     = getServiceClient();
  const ranges = weekComparisionRanges();

  const [ordersCur, ordersPrev] = await Promise.all([
    sb.from('orders').select('id')
      .eq('status', 'cerrado_pagado')
      .gte('updated_at', ranges.cur.start)
      .lte('updated_at', ranges.cur.end),
    sb.from('orders').select('id')
      .eq('status', 'cerrado_pagado')
      .gte('updated_at', ranges.prev.start)
      .lte('updated_at', ranges.prev.end),
  ]);

  const curIds  = (ordersCur.data  ?? []).map((o: any) => o.id);
  const prevIds = (ordersPrev.data ?? []).map((o: any) => o.id);

  const [facturadoCur, facturadoPrev] = await Promise.all([
    calcFacturado(sb, curIds),
    calcFacturado(sb, prevIds),
  ]);

  return {
    labelCur:      ranges.labelCur,
    labelPrev:     ranges.labelPrev,
    facturadoCur,
    entregadosCur: curIds.length,
    facturadoPrev,
    entregadosPrev: prevIds.length,
    daysElapsed:   ranges.daysElapsed,
  };
}

// ─── /mes (Month-over-Month) ──────────────────────────────────────────────

async function buildMesSnapshot(): Promise<MesSnapshot> {
  const sb     = getServiceClient();
  const ranges = monthComparisonRanges();

  const [ordersCur, ordersPrev] = await Promise.all([
    sb.from('orders').select('id')
      .eq('status', 'cerrado_pagado')
      .gte('updated_at', ranges.cur.start)
      .lte('updated_at', ranges.cur.end),
    sb.from('orders').select('id')
      .eq('status', 'cerrado_pagado')
      .gte('updated_at', ranges.prev.start)
      .lte('updated_at', ranges.prev.end),
  ]);

  const curIds  = (ordersCur.data  ?? []).map((o: any) => o.id);
  const prevIds = (ordersPrev.data ?? []).map((o: any) => o.id);

  const [facturadoCur, facturadoPrev] = await Promise.all([
    calcFacturado(sb, curIds),
    calcFacturado(sb, prevIds),
  ]);

  return {
    mesActual:      ranges.mesActual,
    mesAnterior:    ranges.mesAnterior,
    diaActual:      ranges.diaActual,
    diaComparacion: ranges.diaComparacion,
    facturadoCur,
    entregadosCur:  curIds.length,
    facturadoPrev,
    entregadosPrev: prevIds.length,
  };
}

// ─── /vendedores (ranking puro del mes en curso) ──────────────────────────

async function buildVendedoresSnapshot(): Promise<VendorLeaderboard> {
  const sb       = getServiceClient();
  const curMonth = fullMonthRange(0);

  const { data: rawOrders } = await sb
    .from('orders')
    .select('id, assigned_vendor_id')
    .eq('status', 'cerrado_pagado')
    .gte('updated_at', curMonth.start)
    .lt('updated_at', curMonth.end);

  const curOrders = (rawOrders ?? []) as any[];
  const curIds    = curOrders.map(o => o.id);

  const vendorIds = [...new Set(
    curOrders.map(o => o.assigned_vendor_id).filter(Boolean)
  )] as string[];

  // Perfiles + total facturado del mes en paralelo
  const [profiles, totalFacturadoMes] = await Promise.all([
    vendorIds.length > 0
      ? sb.from('profiles').select('id, name').in('id', vendorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    calcFacturado(sb, curIds),
  ]);

  const profileMap: Record<string, string> = {};
  ((profiles as any).data ?? []).forEach((p: any) => {
    profileMap[p.id] = p.name ?? 'Vendedor';
  });

  // Mapa de conteo por vendedor
  const statsMap: Record<string, { entregados: number; facturado: number }> = {};
  curOrders.forEach(o => {
    const vid = o.assigned_vendor_id;
    if (!vid) return;
    if (!statsMap[vid]) statsMap[vid] = { entregados: 0, facturado: 0 };
    statsMap[vid].entregados++;
  });

  // Facturado individual por vendedor desde quote_items
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
      statsMap[vid].facturado +=
        (Number(qi.price) || 0) * (Number(qi.quantity_offered) || 1);
    });
  }

  const vendedores: VendorStat[] = Object.entries(statsMap)
    .map(([id, s]) => ({ name: profileMap[id] ?? 'Vendedor', ...s }))
    .sort((a, b) => b.facturado - a.facturado);

  return {
    vendedores,
    periodo:            monthName(0),
    totalFacturadoMes,
    totalEntregadosMes: curOrders.length,
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

  const sinAsignar = all.filter(
    o => o.status === 'pendiente' && !o.assigned_vendor_id
  ).length;

  const buildLabel = (o: any): string => {
    const taller = o.workshop?.taller_number;
    const orderN = o.workshop_order_number;
    if (taller != null && orderN != null) {
      return `${String(taller).padStart(2, '0')}-PED-${String(orderN).padStart(4, '0')}`;
    }
    if (orderN != null) {
      return `PED-${String(orderN).padStart(4, '0')}`;
    }
    return o.id.slice(0, 8).toUpperCase();
  };

  const conflictOrders: ConflictOrder[] = all
    .filter(o => o.status === 'en_conflicto')
    .map(o => ({
      label:            buildLabel(o),
      workshopName:     o.workshop?.name ?? '?',
      horasEnConflicto: Math.floor(
        (Date.now() - new Date(o.updated_at).getTime()) / 3_600_000
      ),
    }))
    .sort((a, b) => b.horasEnConflicto - a.horasEnConflicto);

  const bottlenecks: BottleneckOrder[] = all
    .filter(o => o.status === 'en_revision' && o.updated_at < cutoff)
    .map(o => ({
      label:          buildLabel(o),
      workshopName:   o.workshop?.name ?? '?',
      horasEstancado: Math.floor(
        (Date.now() - new Date(o.updated_at).getTime()) / 3_600_000
      ),
    }))
    .sort((a, b) => b.horasEstancado - a.horasEstancado);

  return {
    bottlenecks,
    conflictOrders,
    enConflicto: conflictOrders.length,
    sinAsignar,
  };
}

// ─── Nuevos comandos ERP Plus ─────────────────────────────────────────────

async function buildDeudaSnapshot(): Promise<DeudaSnapshot> {
  const sb = getServiceClient();
  const [unpaidR, partialR] = await Promise.all([
    sb.from('orders').select('total_amount, paid_amount').eq('financial_status', 'unpaid'),
    sb.from('orders').select('total_amount, paid_amount').eq('financial_status', 'partial'),
  ]);
  const sumDebt = (rows: any[]) =>
    rows.reduce((acc, r) => acc + (Number(r.total_amount) || 0) - (Number(r.paid_amount) || 0), 0);

  const unpaid  = unpaidR.data  ?? [];
  const partial = partialR.data ?? [];

  return {
    totalDeuda:     sumDebt(unpaid) + sumDebt(partial),
    pedidosUnpaid:  unpaid.length,
    pedidosPartial: partial.length,
    fechaConsulta:  new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
  };
}

async function buildMostradorSnapshot(): Promise<MostradorSnapshot> {
  const sb     = getServiceClient();
  const today  = dayRange(0);
  const fecha  = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

  const { data: sales } = await sb
    .from('pos_sales')
    .select('id, total_amount, vendor_id')
    .eq('status', 'closed')
    .gte('closed_at', today.start)
    .lt('closed_at', today.end);

  const rows = (sales ?? []) as any[];
  const facturadoHoy = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const ticketPromedio = rows.length > 0 ? facturadoHoy / rows.length : 0;

  // Top vendedor del día
  const vendorCount: Record<string, number> = {};
  rows.forEach(r => { vendorCount[r.vendor_id] = (vendorCount[r.vendor_id] ?? 0) + 1; });
  const topVendorId = Object.entries(vendorCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  let topVendedor: string | null = null;
  if (topVendorId) {
    const { data: profile } = await sb.from('profiles').select('name').eq('id', topVendorId).maybeSingle();
    topVendedor = (profile as any)?.name ?? null;
  }

  return { fecha, ventasHoy: rows.length, facturadoHoy, ticketPromedio, topVendedor };
}

async function buildBuscarSnapshot(query: string): Promise<BuscarSnapshot> {
  const sb  = getServiceClient();
  const q   = query.trim().toUpperCase();
  const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://rcrepuestos.vercel.app').replace(/\/$/, '');

  // Intentar parsear "NN-PED-XXXX" o "PED-XXXX"
  const fullMatch    = q.match(/^(\d+)-PED-(\d+)$/);
  const shortMatch   = q.match(/^PED-(\d+)$/);

  let order: any = null;
  if (fullMatch) {
    const tallerNum = parseInt(fullMatch[1], 10);
    const orderNum  = parseInt(fullMatch[2], 10);
    const { data } = await sb
      .from('orders')
      .select('id, status, vehicle_brand, vehicle_model, vehicle_year, updated_at, assigned_vendor_id, workshop_order_number, workshop:workshops(name, taller_number)')
      .eq('workshop_order_number', orderNum)
      .eq('workshops.taller_number', tallerNum)
      .maybeSingle();
    order = data;
  } else if (shortMatch) {
    const orderNum = parseInt(shortMatch[1], 10);
    const { data } = await sb
      .from('orders')
      .select('id, status, vehicle_brand, vehicle_model, vehicle_year, updated_at, assigned_vendor_id, workshop_order_number, workshop:workshops(name, taller_number)')
      .eq('workshop_order_number', orderNum)
      .limit(1);
    order = (data as any)?.[0] ?? null;
  }

  if (!order) return { encontrado: false, label: q, workshopName: '', vehiculo: '', status: '', vendedorName: null, link: '', actualizado: '' };

  const tNum     = (order.workshop as any)?.taller_number;
  const orderN   = order.workshop_order_number;
  const label    = tNum != null && orderN != null
    ? `${String(tNum).padStart(2, '0')}-PED-${String(orderN).padStart(4, '0')}`
    : orderN != null ? `PED-${String(orderN).padStart(4, '0')}` : order.id.slice(0, 8);

  let vendedorName: string | null = null;
  if (order.assigned_vendor_id) {
    const { data: vp } = await sb.from('profiles').select('name').eq('id', order.assigned_vendor_id).maybeSingle();
    vendedorName = (vp as any)?.name ?? null;
  }

  return {
    encontrado:   true,
    label,
    workshopName: (order.workshop as any)?.name ?? '?',
    vehiculo:     `${order.vehicle_brand} ${order.vehicle_model} ${order.vehicle_year}`,
    status:       order.status,
    vendedorName,
    link:         `${APP_URL}/vendedor/pedidos/${label}`,
    actualizado:  new Date(order.updated_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
  };
}

async function buildTalleresDeudores(): Promise<TallerDeudor[]> {
  const sb = getServiceClient();
  const { data } = await sb
    .from('orders')
    .select('workshop_id, total_amount, paid_amount, workshops(name)')
    .in('financial_status', ['unpaid', 'partial']);

  const rows = (data ?? []) as any[];
  const map: Record<string, { name: string; deuda: number; pedidos: number }> = {};
  rows.forEach(r => {
    const wid  = r.workshop_id;
    const name = (r.workshops as any)?.name ?? wid;
    const debt = (Number(r.total_amount) || 0) - (Number(r.paid_amount) || 0);
    if (!map[wid]) map[wid] = { name, deuda: 0, pedidos: 0 };
    map[wid].deuda   += debt;
    map[wid].pedidos += 1;
  });

  return Object.values(map)
    .sort((a, b) => b.deuda - a.deuda)
    .slice(0, 5)
    .map(({ name, deuda, pedidos }) => ({ workshopName: name, deuda, pedidos }));
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
  const adminChatId = parseInt(adminId, 10);
  if (chatId !== adminChatId) {
    return NextResponse.json({ ok: true, reason: 'unauthorized_chat' });
  }

  // Extraer comando (ignorar @botname suffix y args)
  const command = text.split('@')[0].split(' ')[0].toLowerCase();

  try {
    switch (command) {
      case '/hoy': {
        const snap = await buildHoySnapshot();
        await sendReply(chatId, formatSlashHoy(snap));
        break;
      }
      case '/semana': {
        const snap = await buildSemanaSnapshot();
        await sendReply(chatId, formatSlashSemana(snap));
        break;
      }
      case '/mes': {
        const snap = await buildMesSnapshot();
        await sendReply(chatId, formatSlashMes(snap));
        break;
      }
      case '/vendedores': {
        const data = await buildVendedoresSnapshot();
        await sendReply(chatId, formatSlashVendedores(data));
        break;
      }
      case '/alertas': {
        const data = await buildAlertasSnapshot();
        await sendReply(chatId, formatSlashAlertas(data));
        break;
      }
      // ── Nuevos comandos ERP Plus ─────────────────────────────────────────
      case '/deuda': {
        const snap = await buildDeudaSnapshot();
        await sendReply(chatId, formatSlashDeuda(snap));
        break;
      }
      case '/mostrador': {
        const snap = await buildMostradorSnapshot();
        await sendReply(chatId, formatSlashMostrador(snap));
        break;
      }
      case '/buscar': {
        // /buscar 10-PED-0002   ó   /buscar PED-0005
        const args = text.split(/\s+/).slice(1).join(' ').trim();
        if (!args) {
          await sendReply(chatId, `🔍 Uso: <code>/buscar 10-PED-0002</code>`);
        } else {
          const snap = await buildBuscarSnapshot(args);
          await sendReply(chatId, formatSlashBuscar(snap, args));
        }
        break;
      }
      case '/talleres_deudores': {
        const deudores = await buildTalleresDeudores();
        await sendReply(chatId, formatSlashTalleresDeudores(deudores));
        break;
      }
      case '/estado_servidor': {
        await sendReply(chatId, formatSlashEstadoServidor(Date.now() - SERVER_START));
        break;
      }
      default: {
        await sendReply(chatId, [
          `ℹ️ <b>Comandos disponibles (${10} total):</b>`,
          ``,
          `📊 <b>Análisis</b>`,
          `/hoy              — resumen del día vs. ayer`,
          `/semana           — facturación WoW ▲▼`,
          `/mes              — facturación MoM ▲▼`,
          `/vendedores       — ranking del mes`,
          `/alertas          — cuellos de botella y conflictos`,
          ``,
          `💸 <b>ERP Plus</b>`,
          `/deuda            — total deuda cuentas corrientes`,
          `/talleres_deudores — top 5 talleres que más deben`,
          `/mostrador        — ventas de mostrador del día`,
          `/buscar &lt;nro&gt;  — ej: /buscar 10-PED-0002`,
          `/estado_servidor  — health check`,
        ].join('\n'));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[TG-BOT] Error procesando comando:', command, msg);
    await sendReply(
      chatId,
      `❌ Error interno al procesar <code>${command}</code>. Intentá de nuevo en unos segundos.`
    );
  }

  return NextResponse.json({ ok: true });
}
