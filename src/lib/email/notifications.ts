import { Resend } from 'resend';
import type { EmailQuoteResponsePayload, Order, Quote, Workshop } from '@/lib/types';
import { calculateQuoteTotal, formatCurrency, formatDateTime, formatVendorOrderLabel } from '@/lib/utils';

// ============================================================
// Config (servidor)
// ============================================================

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
}

export function getAppBaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (v) return v.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function orderLabel(order: Order): string {
  return formatVendorOrderLabel(order);
}

function vendorOrderUrl(orderId: string): string {
  return `${getAppBaseUrl()}/vendedor/pedidos/${orderId}`;
}

function tallerOrderUrl(orderId: string): string {
  return `${getAppBaseUrl()}/taller/pedidos/${orderId}`;
}

// ============================================================
// Plantilla HTML
// ============================================================

function layoutHtml(opts: {
  title: string;
  bodyHtml: string;
  ctaUrl: string;
  ctaLabel?: string;
}): string {
  const footer = process.env.EMAIL_FOOTER_TEXT ?? 'Portal B2B · Autopartes · Notificación automática';
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#0c0c0f;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0c0c0f;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#18181b;border-radius:16px;overflow:hidden;border:1px solid #27272a;">
          <tr>
            <td style="padding:28px 24px 20px;text-align:center;border-bottom:1px solid #27272a;">
              <div style="font-size:22px;font-weight:800;color:#f97316;letter-spacing:-0.02em;">Portal B2B</div>
              <div style="font-size:12px;color:#a1a1aa;margin-top:4px;">Gestión de pedidos y cotizaciones</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;color:#e4e4e7;font-size:15px;line-height:1.55;">
              <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#fafafa;">${escapeHtml(opts.title)}</h1>
              ${opts.bodyHtml}
              <div style="margin-top:28px;text-align:center;">
                <a href="${escapeAttr(opts.ctaUrl)}" style="display:inline-block;background:#ea580c;color:#fff;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;">${escapeHtml(opts.ctaLabel ?? 'Abrir en el portal')}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#09090b;font-size:11px;color:#71717a;line-height:1.5;">
              ${escapeHtml(footer)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function rowHtml(label: string, value: string): string {
  return `<p style="margin:12px 0 0;"><span style="color:#a1a1aa;font-size:13px;">${escapeHtml(label)}</span><br/><strong style="color:#fafafa;">${escapeHtml(value)}</strong></p>`;
}

async function send(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, skipped: 'no_resend_key', error: 'RESEND_API_KEY no configurada' };
  }
  if (!opts.to?.trim()) {
    return { ok: false, skipped: 'no_recipient', error: 'Sin destinatario' };
  }
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: [opts.to.trim()],
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ============================================================
// Notificaciones públicas (server)
// ============================================================

export async function notifyVendorNewOrder(order: Order, workshop: Workshop): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const num = orderLabel(order);
  const taller = workshop.name || 'Taller';
  const itemsCount = order.items?.length ?? 0;
  const fecha = formatDateTime(order.createdAt);
  const body =
    `<p style="margin:0;">Hay un nuevo pedido que requiere tu atención.</p>` +
    rowHtml('Número de pedido', num) +
    rowHtml('Taller', taller) +
    rowHtml('Cantidad de ítems', String(itemsCount)) +
    rowHtml('Fecha', fecha);
  const html = layoutHtml({
    title: `Nuevo pedido ${num}`,
    bodyHtml: body,
    ctaUrl: vendorOrderUrl(order.id),
    ctaLabel: 'Ver pedido',
  });
  const vendorEmail = process.env.NOTIFICATION_VENDOR_EMAIL?.trim();
  if (!vendorEmail) {
    return { ok: false, skipped: 'no_vendor_email', error: 'NOTIFICATION_VENDOR_EMAIL no configurada' };
  }
  return send({
    to: vendorEmail,
    subject: `Nuevo pedido ${num} de ${taller}`,
    html,
  });
}

export async function notifyTallerOrderInReview(
  order: Order,
  tallerEmail: string
): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const num = orderLabel(order);
  const body =
    `<p style="margin:0;">El vendedor está revisando tu pedido y consultando disponibilidad con sus proveedores.</p>` +
    `<p style="margin:16px 0 0;color:#a1a1aa;font-size:14px;">Te avisaremos cuando haya novedades.</p>` +
    rowHtml('Pedido', num);
  const html = layoutHtml({
    title: `Tu pedido ${num} está en revisión`,
    bodyHtml: body,
    ctaUrl: tallerOrderUrl(order.id),
    ctaLabel: 'Ver mi pedido',
  });
  return send({ to: tallerEmail, subject: `Tu pedido ${num} está en revisión`, html });
}

export async function notifyTallerQuoteReceived(
  order: Order,
  quote: Quote,
  tallerEmail: string
): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const num = orderLabel(order);
  const total = calculateQuoteTotal(quote.items);
  const nItems = quote.items?.length ?? 0;
  const body =
    `<p style="margin:0;">Recibiste una cotización para tu pedido. Revisá los precios y aprobá total o parcialmente desde el portal.</p>` +
    rowHtml('Total cotizado', formatCurrency(total)) +
    rowHtml('Ítems cotizados', String(nItems));
  const html = layoutHtml({
    title: `Cotización para ${num}`,
    bodyHtml: body,
    ctaUrl: tallerOrderUrl(order.id),
    ctaLabel: 'Ver y responder cotización',
  });
  return send({ to: tallerEmail, subject: `Recibiste una cotización para ${num}`, html });
}

export async function notifyVendorQuoteResponse(
  order: Order,
  workshop: Workshop,
  response: EmailQuoteResponsePayload
): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const num = orderLabel(order);
  const taller = workshop.name || 'Taller';
  const kindLabel =
    response.kind === 'aprobado'
      ? 'aprobó la cotización completa'
      : response.kind === 'aprobado_parcial'
        ? 'aprobó parcialmente la cotización'
        : 'rechazó la cotización';
  const body =
    `<p style="margin:0;"><strong>${escapeHtml(taller)}</strong> ${kindLabel}.</p>` +
    rowHtml('Total aprobado / relevante', formatCurrency(response.totalApproved)) +
    rowHtml('Pedido', num);
  const html = layoutHtml({
    title: `${taller} respondió la cotización`,
    bodyHtml: body,
    ctaUrl: vendorOrderUrl(order.id),
    ctaLabel: 'Ver pedido',
  });
  const vendorEmail = process.env.NOTIFICATION_VENDOR_EMAIL?.trim();
  if (!vendorEmail) {
    return { ok: false, skipped: 'no_vendor_email', error: 'NOTIFICATION_VENDOR_EMAIL no configurada' };
  }
  return send({
    to: vendorEmail,
    subject: `${taller} respondió la cotización ${num}`,
    html,
  });
}

export async function notifyTallerOrderClosed(
  order: Order,
  tallerEmail: string
): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const num = orderLabel(order);
  const body =
    `<p style="margin:0;">Tu pedido fue marcado como cerrado en el sistema.</p>` +
    rowHtml('Pedido', num) +
    `<p style="margin:16px 0 0;color:#a1a1aa;font-size:14px;">Si tenés dudas, contactá al vendedor desde el portal.</p>`;
  const html = layoutHtml({
    title: `Pedido ${num} cerrado`,
    bodyHtml: body,
    ctaUrl: tallerOrderUrl(order.id),
    ctaLabel: 'Ver pedido',
  });
  return send({ to: tallerEmail, subject: `Tu pedido ${num} fue cerrado`, html });
}
