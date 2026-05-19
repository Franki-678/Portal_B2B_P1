/**
 * Telegram Bot — Formatters.
 *
 * Funciones PURAS para construir los mensajes que mandamos a Telegram.
 * Usamos parse_mode=HTML porque es más permisivo con caracteres
 * especiales que Markdown V2 (no hay que escapar . , - ! etc.).
 */

import type { OrderStatus, EventAction } from '@/lib/types';

// ─── Tipos del payload de Supabase ────────────────────────────────────────

/** Forma esperada del registro `orders` que viene en el webhook. */
export interface OrderRecord {
  id: string;
  workshop_id: string;
  status: OrderStatus;
  workshop_order_number: number | null;
  assigned_vendor_id: string | null;
  assigned_vendor_name: string | null;
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
  user_name: string;
  action: EventAction;
  comment: string | null;
  created_at: string;
}

/** Contexto extra que el endpoint resuelve antes de formatear (workshop, monto, etc.). */
export interface FormatContext {
  order: OrderRecord;
  workshopName: string;
  /** Monto total aprobado en ARS (null si no aplica al evento). */
  approvedTotal?: number | null;
  /**
   * Username de Telegram del vendedor asignado, sin @ (ej: 'juan_pereyra').
   * Resuelto desde `profiles.telegram_username` por el endpoint antes de formatear.
   * Si es null/undefined, las menciones caen al nombre en negrita sin ping.
   */
  vendorTelegramUsername?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatOrderLabel(order: OrderRecord): string {
  if (order.workshop_order_number != null) {
    return `PED-${String(order.workshop_order_number).padStart(4, '0')}`;
  }
  return order.id.replace(/-/g, '').slice(0, 12).toUpperCase();
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
 * en negrita HTML (sin ping). El username debe venir limpio (sin @, sin espacios).
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

// ─── Formatters por acción ────────────────────────────────────────────────

export function formatOrderCreated(ctx: FormatContext): string {
  const label = formatOrderLabel(ctx.order);
  const vehicle = `${ctx.order.vehicle_brand} ${ctx.order.vehicle_model} ${ctx.order.vehicle_year}`;
  return [
    `🆕 <b>[NUEVO PEDIDO]</b>`,
    `🏢 <b>Taller:</b> ${esc(ctx.workshopName)}`,
    `📦 <b>Pedido:</b> <code>#${label}</code>`,
    `🚗 ${esc(vehicle)}`,
  ].join('\n');
}

export function formatOrderTaken(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order);
  return [
    `🙋 <b>[TOMADO]</b>`,
    `👤 <b>${esc(event.user_name)}</b> tomó el pedido <code>#${label}</code>`,
    `🏢 ${esc(ctx.workshopName)}`,
  ].join('\n');
}

export function formatQuoteSent(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order);
  return [
    `📝 <b>[COTIZADO]</b>`,
    `👤 <b>${esc(event.user_name)}</b> envió cotización para <code>#${label}</code>`,
    `🏢 ${esc(ctx.workshopName)}`,
  ].join('\n');
}

export function formatQuoteApproved(
  ctx: FormatContext,
  event: OrderEventRecord,
  partial: boolean
): string {
  const label = formatOrderLabel(ctx.order);
  const mention = vendorMention(ctx.vendorTelegramUsername, ctx.order.assigned_vendor_name);
  const monto = ctx.approvedTotal != null ? formatCurrency(ctx.approvedTotal) : '—';
  const tag = partial ? '🟡 <b>[APROBADO PARCIAL]</b>' : '🟢 <b>[APROBADO]</b>';
  const lines = [
    tag,
    `🏢 <b>Taller:</b> ${esc(ctx.workshopName)}`,
    `📦 <b>Pedido:</b> <code>#${label}</code>`,
    `💰 <b>Monto:</b> ${monto}`,
  ];
  if (event.comment) lines.push(`💬 <i>${esc(event.comment)}</i>`);
  lines.push('', `🔔 ${mention}, coordiná el cobro y la entrega.`);
  return lines.join('\n');
}

export function formatQuoteRejected(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order);
  const mention = vendorMention(ctx.vendorTelegramUsername, ctx.order.assigned_vendor_name);
  const lines = [
    `🔴 <b>[RECHAZADO]</b>`,
    `🏢 <b>Taller:</b> ${esc(ctx.workshopName)}`,
    `📦 <b>Pedido:</b> <code>#${label}</code>`,
  ];
  if (event.comment) lines.push(`💬 <i>${esc(event.comment)}</i>`);
  lines.push('', `🔔 ${mention}, el taller rechazó tu cotización.`);
  return lines.join('\n');
}

export function formatOrderMarkedPaid(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order);
  return [
    `💰 <b>[PAGO REGISTRADO]</b>`,
    `👤 <b>${esc(event.user_name)}</b> registró el pago de <code>#${label}</code>`,
    `🏢 ${esc(ctx.workshopName)}`,
    `⏳ Mercadería pendiente de entrega.`,
  ].join('\n');
}

export function formatOrderDelivered(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order);
  const monto = ctx.approvedTotal != null ? formatCurrency(ctx.approvedTotal) : '—';
  return [
    `📦 <b>[ENTREGADO Y COBRADO]</b>`,
    `👤 <b>${esc(event.user_name)}</b> entregó <code>#${label}</code>`,
    `🏢 ${esc(ctx.workshopName)}`,
    `✅ <b>Total facturado:</b> ${monto}`,
  ].join('\n');
}

export function formatClaimInitiated(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order);
  const mention = vendorMention(ctx.vendorTelegramUsername, ctx.order.assigned_vendor_name);
  const lines = [
    `⚠️ <b>[CONFLICTO INICIADO]</b>`,
    `🏢 <b>Taller:</b> ${esc(ctx.workshopName)}`,
    `📦 <b>Pedido:</b> <code>#${label}</code>`,
  ];
  if (event.comment) lines.push(`💬 <i>${esc(event.comment)}</i>`);
  lines.push('', `🔔 ${mention}, el taller inició un reclamo. Requiere atención inmediata.`);
  return lines.join('\n');
}

export function formatConflictResolved(ctx: FormatContext, event: OrderEventRecord): string {
  const label = formatOrderLabel(ctx.order);
  const lines = [
    `🤝 <b>[CONFLICTO RESUELTO]</b>`,
    `👤 <b>${esc(event.user_name)}</b> resolvió <code>#${label}</code>`,
    `🏢 ${esc(ctx.workshopName)}`,
  ];
  if (event.comment) lines.push(`💬 <i>${esc(event.comment)}</i>`);
  return lines.join('\n');
}

/**
 * Mention puro: cuando el taller modifica un pedido ya asignado y queremos
 * pingear al vendedor sin un evento estructurado.
 */
export function formatVendorMention(ctx: FormatContext, accion: string): string {
  const label = formatOrderLabel(ctx.order);
  const mention = vendorMention(ctx.vendorTelegramUsername, ctx.order.assigned_vendor_name);
  return [
    `🔔 ${mention}, el taller modificó <code>#${label}</code>`,
    `🏢 ${esc(ctx.workshopName)} · ${esc(accion)}`,
    `Esperando tu respuesta.`,
  ].join('\n');
}

// ─── Dispatcher central ───────────────────────────────────────────────────

/**
 * Dada una acción de evento, devuelve el mensaje formateado para el grupo
 * o `null` si no corresponde notificar.
 */
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
    // Eventos silenciados para no spamear:
    case 'pedido_en_revision':
    case 'pedido_liberado':
    case 'pedido_cerrado':
    case 'comentario':
    default:
      return null;
  }
}

// ─── Métricas privadas para el admin ──────────────────────────────────────

export interface AdminMetricsSnapshot {
  /** Etiqueta del período (ej: 'Hoy', 'Últimos 7 días', 'Mayo 2026'). */
  periodo: string;
  /** Monto total facturado en ARS (suma de pedidos cerrado_pagado). */
  facturado: number;
  /** Cantidad de pedidos entregados (cerrado_pagado). */
  entregados: number;
  /** Cantidad de pedidos pendientes (status pendiente + en_revision). */
  pendientes: number;
  /** Cantidad de pedidos en conflicto. */
  enConflicto: number;
  /** Ticket promedio (facturado / entregados). */
  ticketPromedio?: number;
}

/**
 * Reporte simple para el chat privado de Juan.
 */
export function formatAdminMetrics(snap: AdminMetricsSnapshot): string {
  const ticket = snap.ticketPromedio ?? (snap.entregados > 0 ? snap.facturado / snap.entregados : 0);
  return [
    `📊 <b>Métricas — ${esc(snap.periodo)}</b>`,
    ``,
    `💰 <b>Facturado:</b> ${formatCurrency(snap.facturado)}`,
    `✅ <b>Entregados:</b> ${snap.entregados}`,
    `📊 <b>Ticket promedio:</b> ${formatCurrency(ticket)}`,
    `⏳ <b>Pendientes:</b> ${snap.pendientes}`,
    `⚠️ <b>En conflicto:</b> ${snap.enConflicto}`,
  ].join('\n');
}
