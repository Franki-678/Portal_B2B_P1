/**
 * Telegram Bot — Formatters.
 *
 * Funciones PURAS para construir los mensajes que mandamos a Telegram.
 * Usamos parse_mode=HTML porque es más permisivo con caracteres
 * especiales que Markdown V2 (no hay que escapar . , - ! etc.).
 */

import type { OrderStatus, EventAction } from '@/lib/types';

// ─── Tipos del payload de Supabase ────────────────────────────────────────

/**
 * Forma esperada del registro `orders` que viene en el webhook de Supabase.
 * Solo contiene columnas que existen físicamente en la tabla.
 */
export interface OrderRecord {
  id: string;
  workshop_id: string;
  status: OrderStatus;
  workshop_order_number: number | null;
  assigned_vendor_id: string | null;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_year: number;
  created_at: string;
  updated_at: string;
}

/** Forma esperada del registro `order_events` que viene en el webhook. */
export interface OrderEventRecord {
  id: string;
  order_id: string;
  user_id: string;
  /**
   * Nombre del actor. NO existe físicamente en `order_events` — se inyecta
   * en el endpoint mediante un JOIN a `profiles.name`. Default 'Usuario'.
   */
  user_name?: string;
  action: EventAction;
  comment: string | null;
  created_at: string;
}

/** Contexto extra que el endpoint resuelve antes de formatear. */
export interface FormatContext {
  order: OrderRecord;
  workshopName: string;
  /** Número de taller (workshops.taller_number) — para generar deep links. */
  tallerNumber?: number | null;
  /** Monto total aprobado en ARS (null si no aplica al evento). */
  approvedTotal?: number | null;
  /**
   * Username de Telegram del vendedor asignado, sin @ (ej: 'juan_pereyra').
   * Resuelto desde `profiles.telegram_username` via JOIN en el endpoint.
   */
  vendorTelegramUsername?: string | null;
  /**
   * Nombre real del vendedor asignado (profiles.name).
   * Fallback de mención cuando no hay telegram_username.
   */
  vendorName?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** URL base del CRM (configurar en Vercel → Settings → Env Variables). */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal-b2b.vercel.app').replace(/\/$/, '');

function formatOrderLabel(order: OrderRecord, tallerNumber?: number | null): string {
  if (tallerNumber != null && order.workshop_order_number != null) {
    return `${String(tallerNumber).padStart(2, '0')}-PED-${String(order.workshop_order_number).padStart(4, '0')}`;
  }
  if (order.workshop_order_number != null) {
    return `PED-${String(order.workshop_order_number).padStart(4, '0')}`;
  }
  return order.id.replace(/-/g, '').slice(0, 12).toUpperCase();
}

/** Genera el deep link al detalle del pedido en el CRM (vista vendedor). */
function orderDeepLink(order: OrderRecord, tallerNumber?: number | null): string {
  const slug = formatOrderLabel(order, tallerNumber);
  return `${APP_URL}/vendedor/pedidos/${slug}`;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Devuelve "@username" si tenemos username de Telegram, sino el nombre real
 * en negrita HTML (sin ping).
 */
function vendorMention(
  telegramUsername: string | null | undefined,
  fallbackName: string | null | undefined
): string {
  if (telegramUsername && telegramUsername.trim()) {
    return `@${telegramUsername.trim().replace(/^@+/, '')}`;
  }
  return fallbackName ? `<b>${esc(fallbackName)}</b>` : '<b>el vendedor</b>';
}

/** Escape mínimo de HTML para que Telegram no se queje con <, > o &. */
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function vehicle(order: OrderRecord): string {
  return `${esc(order.vehicle_brand)} ${esc(order.vehicle_model)} ${order.vehicle_year}`;
}

// ─── Formatters por acción ────────────────────────────────────────────────

export function formatOrderCreated(ctx: FormatContext): string {
  const label = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link  = orderDeepLink(ctx.order, ctx.tallerNumber);
  return [
    `🆕 <b>[NUEVO PEDIDO]</b>`,
    `🏢 <b>Taller:</b> ${esc(ctx.workshopName)}`,
    `📦 <b>Pedido:</b> <a href="${link}"><code>#${label}</code></a>`,
    `🚗 ${vehicle(ctx.order)}`,
  ].join('\n');
}

export function formatOrderTaken(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link  = orderDeepLink(ctx.order, ctx.tallerNumber);
  return [
    `🙋 <b>[TOMADO]</b>`,
    `👤 <b>${esc(event.user_name ?? 'Usuario')}</b> tomó <a href="${link}"><code>#${label}</code></a>`,
    `🏢 ${esc(ctx.workshopName)} · 🚗 ${vehicle(ctx.order)}`,
  ].join('\n');
}

export function formatQuoteSent(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link  = orderDeepLink(ctx.order, ctx.tallerNumber);
  return [
    `📝 <b>[COTIZADO]</b>`,
    `👤 <b>${esc(event.user_name ?? 'Usuario')}</b> envió cotización para <a href="${link}"><code>#${label}</code></a>`,
    `🏢 ${esc(ctx.workshopName)} · 🚗 ${vehicle(ctx.order)}`,
  ].join('\n');
}

export function formatQuoteApproved(
  ctx: FormatContext,
  event: OrderEventRecord,
  partial: boolean
): string {
  const label   = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link    = orderDeepLink(ctx.order, ctx.tallerNumber);
  const mention = vendorMention(ctx.vendorTelegramUsername, ctx.vendorName);
  const monto   = ctx.approvedTotal != null ? formatCurrency(ctx.approvedTotal) : '—';
  const tag     = partial ? '🟡 <b>[APROBADO PARCIAL]</b>' : '🟢 <b>[APROBADO]</b>';
  const lines   = [
    tag,
    `🏢 <b>Taller:</b> ${esc(ctx.workshopName)}`,
    `📦 <b>Pedido:</b> <a href="${link}"><code>#${label}</code></a>`,
    `🚗 ${vehicle(ctx.order)}`,
    `💰 <b>Monto:</b> ${monto}`,
  ];
  if (event.comment) lines.push(`💬 <i>${esc(event.comment)}</i>`);
  lines.push('', `🔔 ${mention}, coordiná el cobro y la entrega.`);
  return lines.join('\n');
}

export function formatQuoteRejected(ctx: FormatContext, event: OrderEventRecord): string {
  const label   = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link    = orderDeepLink(ctx.order, ctx.tallerNumber);
  const mention = vendorMention(ctx.vendorTelegramUsername, ctx.vendorName);
  const lines   = [
    `🔴 <b>[RECHAZADO]</b>`,
    `🏢 <b>Taller:</b> ${esc(ctx.workshopName)}`,
    `📦 <b>Pedido:</b> <a href="${link}"><code>#${label}</code></a>`,
    `🚗 ${vehicle(ctx.order)}`,
  ];
  if (event.comment) lines.push(`💬 <i>${esc(event.comment)}</i>`);
  lines.push('', `🔔 ${mention}, el taller rechazó tu cotización.`);
  return lines.join('\n');
}

export function formatOrderMarkedPaid(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link  = orderDeepLink(ctx.order, ctx.tallerNumber);
  return [
    `💰 <b>[PAGO REGISTRADO]</b>`,
    `👤 <b>${esc(event.user_name ?? 'Usuario')}</b> registró el pago de <a href="${link}"><code>#${label}</code></a>`,
    `🏢 ${esc(ctx.workshopName)} · 🚗 ${vehicle(ctx.order)}`,
    `⏳ Mercadería pendiente de entrega.`,
  ].join('\n');
}

export function formatOrderDelivered(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link  = orderDeepLink(ctx.order, ctx.tallerNumber);
  const monto = ctx.approvedTotal != null ? formatCurrency(ctx.approvedTotal) : '—';
  return [
    `📦 <b>[ENTREGADO Y COBRADO]</b>`,
    `👤 <b>${esc(event.user_name ?? 'Usuario')}</b> entregó <a href="${link}"><code>#${label}</code></a>`,
    `🏢 ${esc(ctx.workshopName)} · 🚗 ${vehicle(ctx.order)}`,
    `✅ <b>Total facturado:</b> ${monto}`,
  ].join('\n');
}

export function formatClaimInitiated(ctx: FormatContext, event: OrderEventRecord): string {
  const label   = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link    = orderDeepLink(ctx.order, ctx.tallerNumber);
  const mention = vendorMention(ctx.vendorTelegramUsername, ctx.vendorName);
  const lines   = [
    `⚠️ <b>[CONFLICTO INICIADO]</b>`,
    `🏢 <b>Taller:</b> ${esc(ctx.workshopName)}`,
    `📦 <b>Pedido:</b> <a href="${link}"><code>#${label}</code></a>`,
    `🚗 ${vehicle(ctx.order)}`,
  ];
  if (event.comment) lines.push(`💬 <i>${esc(event.comment)}</i>`);
  lines.push('', `🔔 ${mention}, el taller inició un reclamo. Requiere atención inmediata.`);
  return lines.join('\n');
}

export function formatConflictResolved(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link  = orderDeepLink(ctx.order, ctx.tallerNumber);
  const lines = [
    `🤝 <b>[CONFLICTO RESUELTO]</b>`,
    `👤 <b>${esc(event.user_name ?? 'Usuario')}</b> resolvió <a href="${link}"><code>#${label}</code></a>`,
    `🏢 ${esc(ctx.workshopName)}`,
  ];
  if (event.comment) lines.push(`💬 <i>${esc(event.comment)}</i>`);
  return lines.join('\n');
}

export function formatVendorMention(ctx: FormatContext, accion: string): string {
  const label   = formatOrderLabel(ctx.order, ctx.tallerNumber);
  const link    = orderDeepLink(ctx.order, ctx.tallerNumber);
  const mention = vendorMention(ctx.vendorTelegramUsername, ctx.vendorName);
  return [
    `🔔 ${mention}, el taller modificó <a href="${link}"><code>#${label}</code></a>`,
    `🏢 ${esc(ctx.workshopName)} · ${esc(accion)}`,
    `Esperando tu respuesta.`,
  ].join('\n');
}

// ─── Dispatcher central ───────────────────────────────────────────────────

export function formatEventForGroup(
  event: OrderEventRecord,
  ctx: FormatContext
): string | null {
  switch (event.action) {
    case 'pedido_creado':                return formatOrderCreated(ctx);
    case 'pedido_tomado':                return formatOrderTaken(ctx, event);
    case 'cotizacion_enviada':           return formatQuoteSent(ctx, event);
    case 'cotizacion_aprobada':          return formatQuoteApproved(ctx, event, false);
    case 'cotizacion_aprobada_parcial':  return formatQuoteApproved(ctx, event, true);
    case 'cotizacion_rechazada':         return formatQuoteRejected(ctx, event);
    case 'pedido_marcado_pagado':        return formatOrderMarkedPaid(ctx, event);
    case 'pedido_entregado':             return formatOrderDelivered(ctx, event);
    case 'pedido_pagado':                return formatOrderDelivered(ctx, event);
    case 'reclamo_iniciado':             return formatClaimInitiated(ctx, event);
    case 'conflicto_resuelto':           return formatConflictResolved(ctx, event);
    case 'pedido_en_revision':
    case 'pedido_liberado':
    case 'pedido_cerrado':
    case 'recotizacion_preacordada':
    case 'comentario':
    default:
      return null;
  }
}

// ─── Métricas privadas para el admin ──────────────────────────────────────

export interface VendorStat {
  name: string;
  entregados: number;
  facturado: number;
}

export interface BottleneckOrder {
  label: string;
  horasEstancado: number;
  workshopName: string;
}

export interface AdminMetricsSnapshot {
  periodo: string;
  facturado: number;
  entregados: number;
  pendientes: number;
  enConflicto: number;
  ticketPromedio?: number;
  /** Monto del período anterior para comparación (opcional). */
  facturadoAnterior?: number;
  /** Entregados período anterior (opcional). */
  entregadosAnterior?: number;
  /** Top vendedor del período (opcional). */
  topVendedor?: VendorStat;
  /** Pedidos atascados >48h en en_revision (opcional). */
  bottlenecks?: BottleneckOrder[];
}

function diffArrow(current: number, previous: number): string {
  if (previous === 0) return '';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0)  return ` ▲${pct}%`;
  if (pct < 0)  return ` ▼${Math.abs(pct)}%`;
  return ' →0%';
}

/**
 * Reporte agresivo para el chat privado de Juan.
 * Incluye comparativa MoM, top vendedor y alertas de cuellos de botella.
 */
export function formatAdminMetrics(snap: AdminMetricsSnapshot): string {
  const ticket = snap.ticketPromedio ?? (snap.entregados > 0 ? snap.facturado / snap.entregados : 0);

  const facturadoCmp = snap.facturadoAnterior != null
    ? diffArrow(snap.facturado, snap.facturadoAnterior)
    : '';
  const entregadosCmp = snap.entregadosAnterior != null
    ? diffArrow(snap.entregados, snap.entregadosAnterior)
    : '';

  const lines = [
    `📊 <b>Métricas — ${esc(snap.periodo)}</b>`,
    ``,
    `💰 <b>Facturado:</b> ${formatCurrency(snap.facturado)}${facturadoCmp}`,
    `✅ <b>Entregados:</b> ${snap.entregados}${entregadosCmp}`,
    `📊 <b>Ticket promedio:</b> ${formatCurrency(ticket)}`,
    `⏳ <b>Pendientes:</b> ${snap.pendientes}`,
    `⚠️ <b>En conflicto:</b> ${snap.enConflicto}`,
  ];

  if (snap.topVendedor) {
    const tv = snap.topVendedor;
    lines.push('');
    lines.push(`🏆 <b>Top vendedor:</b> ${esc(tv.name)} — ${tv.entregados} ent. · ${formatCurrency(tv.facturado)}`);
  }

  if (snap.bottlenecks && snap.bottlenecks.length > 0) {
    lines.push('');
    lines.push(`🚨 <b>Cuellos de botella (&gt;48h sin respuesta):</b>`);
    snap.bottlenecks.slice(0, 5).forEach(b => {
      lines.push(`  · <code>${esc(b.label)}</code> — ${esc(b.workshopName)} (${b.horasEstancado}h)`);
    });
  }

  return lines.join('\n');
}

// ─── Slash commands ───────────────────────────────────────────────────────

/** Genera deep link para cualquier slug de pedido (usado en slash commands). */
function slugDeepLink(slug: string): string {
  return `${APP_URL}/vendedor/pedidos/${encodeURIComponent(slug)}`;
}

// ── /hoy ──────────────────────────────────────────────────────────────────

export interface HoySnapshot {
  fecha: string;
  /** Hora actual en formato "HH:MM" (zona local del servidor). */
  horaActual: string;
  facturadoHoy: number;
  entregadosHoy: number;
  nuevosHoy: number;
  pendientesTotal: number;
  enConflictoTotal: number;
  /** Mismo día de ayer para comparación. */
  facturadoAyer: number;
  entregadosAyer: number;
  nuevosAyer: number;
}

export function formatSlashHoy(snap: HoySnapshot): string {
  const facturadoCmp   = diffArrow(snap.facturadoHoy,   snap.facturadoAyer);
  const entregadosCmp  = diffArrow(snap.entregadosHoy,  snap.entregadosAyer);
  const nuevosCmp      = diffArrow(snap.nuevosHoy,       snap.nuevosAyer);

  return [
    `📅 <b>Hoy · ${esc(snap.fecha)} · ${esc(snap.horaActual)}</b>`,
    ``,
    `💰 <b>Facturado:</b> ${formatCurrency(snap.facturadoHoy)}${facturadoCmp}`,
    `📦 <b>Entregados:</b> ${snap.entregadosHoy}${entregadosCmp}`,
    `🆕 <b>Nuevos:</b> ${snap.nuevosHoy}${nuevosCmp}`,
    ``,
    `⏳ <b>Pendientes (total):</b> ${snap.pendientesTotal}`,
    `⚠️ <b>En conflicto:</b> ${snap.enConflictoTotal}`,
    ``,
    `<i>Comparación vs. ayer — facturado ${formatCurrency(snap.facturadoAyer)}, ${snap.entregadosAyer} ent., ${snap.nuevosAyer} nuevos</i>`,
  ].join('\n');
}

// ── /vendedores ───────────────────────────────────────────────────────────

export interface VendorLeaderboard {
  vendedores: VendorStat[];
  /** Mes en curso, ej: "mayo 2026" */
  periodo: string;
  totalFacturadoMes: number;
  totalEntregadosMes: number;
  /** Mes anterior para cálculo de crecimiento. */
  facturadoMesAnterior?: number;
  entregadosMesAnterior?: number;
  periodoAnterior?: string;
  /** Facturación de la semana en curso (lunes→hoy). */
  facturadoSemana?: number;
  entregadosSemana?: number;
}

export function formatSlashVendedores(data: VendorLeaderboard): string {
  const lines: string[] = [];

  // ── Cabecera mensual ──
  const facturadoCmp  = (data.facturadoMesAnterior  != null) ? diffArrow(data.totalFacturadoMes,  data.facturadoMesAnterior)  : '';
  const entregadosCmp = (data.entregadosMesAnterior != null) ? diffArrow(data.totalEntregadosMes, data.entregadosMesAnterior) : '';

  lines.push(`👥 <b>Vendedores — ${esc(data.periodo)}</b>`);
  lines.push('');
  lines.push(`💰 <b>Facturado del mes:</b> ${formatCurrency(data.totalFacturadoMes)}${facturadoCmp}`);
  lines.push(`✅ <b>Entregados del mes:</b> ${data.totalEntregadosMes}${entregadosCmp}`);

  if (data.periodoAnterior && data.facturadoMesAnterior != null) {
    lines.push(`<i>vs. ${esc(data.periodoAnterior)}: ${formatCurrency(data.facturadoMesAnterior)}</i>`);
  }

  // ── Semana en curso ──
  if (data.facturadoSemana != null) {
    lines.push('');
    lines.push(`📆 <b>Esta semana:</b> ${formatCurrency(data.facturadoSemana)} · ${data.entregadosSemana ?? 0} ent.`);
  }

  // ── Ranking ──
  if (data.vendedores.length === 0) {
    lines.push('', 'Sin actividad registrada este mes.');
    return lines.join('\n');
  }

  lines.push('', `🏆 <b>Ranking del mes:</b>`);
  const medals = ['🥇', '🥈', '🥉'];
  data.vendedores.slice(0, 8).forEach((v, i) => {
    const medal = medals[i] ?? `${i + 1}.`;
    const ticket = v.entregados > 0 ? ` · ticket ${formatCurrency(Math.round(v.facturado / v.entregados))}` : '';
    lines.push(`${medal} <b>${esc(v.name)}</b> — ${v.entregados} ent. · ${formatCurrency(v.facturado)}${ticket}`);
  });

  return lines.join('\n');
}

// ── /alertas ──────────────────────────────────────────────────────────────

/** Pedido en conflicto activo con deep link. */
export interface ConflictOrder {
  label: string;
  workshopName: string;
  horasEnConflicto: number;
}

export interface AlertasSnapshot {
  bottlenecks: BottleneckOrder[];
  /** Lista real de pedidos en conflicto (max 10). */
  conflictOrders: ConflictOrder[];
  enConflicto: number;
  sinAsignar: number;
}

export function formatSlashAlertas(data: AlertasSnapshot): string {
  const lines: string[] = [`🚨 <b>Alertas activas</b>`, ``];

  // ── Sin asignar ──
  if (data.sinAsignar > 0) {
    lines.push(`📭 <b>${data.sinAsignar} pedido${data.sinAsignar !== 1 ? 's' : ''} sin vendedor asignado</b>`);
  }

  // ── Conflictos con deep links ──
  if (data.enConflicto > 0) {
    lines.push(``, `⚠️ <b>${data.enConflicto} pedido${data.enConflicto !== 1 ? 's' : ''} en conflicto activo:</b>`);
    data.conflictOrders.slice(0, 8).forEach(c => {
      const link = slugDeepLink(c.label);
      lines.push(`  · <a href="${link}"><code>${esc(c.label)}</code></a> — ${esc(c.workshopName)} (${c.horasEnConflicto}h)`);
    });
  }

  // ── Atascados >48h con deep links ──
  if (data.bottlenecks.length > 0) {
    lines.push(``, `⏱ <b>Atascados &gt;48h en revisión:</b>`);
    data.bottlenecks.slice(0, 10).forEach(b => {
      const link = slugDeepLink(b.label);
      lines.push(`  · <a href="${link}"><code>${esc(b.label)}</code></a> — ${esc(b.workshopName)} (${b.horasEstancado}h)`);
    });
  }

  if (data.sinAsignar === 0 && data.enConflicto === 0 && data.bottlenecks.length === 0) {
    lines.push(`✅ Todo en orden. No hay alertas activas.`);
  }

  return lines.join('\n');
}
