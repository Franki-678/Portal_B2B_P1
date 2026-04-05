import { NextRequest, NextResponse } from 'next/server';
import type { EmailQuoteResponsePayload, Order, Quote, Workshop } from '@/lib/types';
import {
  notifyTallerOrderClosed,
  notifyTallerOrderInReview,
  notifyTallerQuoteReceived,
  notifyVendorNewOrder,
  notifyVendorQuoteResponse,
} from '@/lib/email/notifications';

export const runtime = 'nodejs';

type NotifyEvent =
  | 'vendor_new_order'
  | 'taller_order_in_review'
  | 'taller_quote_received'
  | 'vendor_quote_response'
  | 'taller_order_closed';

function logSendResult(r: { ok: boolean; error?: string; skipped?: string; emailId?: string }) {
  if (!r.ok) {
    console.error('[Notify] Error al enviar:', r.error ?? r.skipped ?? 'unknown');
  } else {
    console.log('[Notify] Email enviado OK, id:', r.emailId);
  }
}

/**
 * POST /api/notify
 * Body: { event, orderId, data }
 * `data` incluye objetos serializables (order, workshop, quote, tallerEmail, response, etc.)
 *
 * Los fallos de email no deben romper el flujo del portal: respondemos JSON con ok:false.
 */
export async function POST(req: NextRequest) {
  let body: { event?: string; orderId?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const event = body.event as NotifyEvent | undefined;
  const data = body.data ?? {};
  const orderId = body.orderId;

  if (!event) {
    return NextResponse.json({ ok: false, error: 'Falta event' }, { status: 400 });
  }

  console.log('[Notify] Evento recibido:', event, 'orderId:', orderId);

  try {
    switch (event) {
      case 'vendor_new_order': {
        const order = data.order as Order | undefined;
        const workshop = data.workshop as Workshop | undefined;
        if (!order || !workshop) {
          return NextResponse.json({ ok: false, error: 'Faltan order o workshop' }, { status: 400 });
        }
        const destinatario =
          process.env.NOTIFICATION_VENDOR_EMAIL?.trim() || '(NOTIFICATION_VENDOR_EMAIL no definido)';
        console.log('[Notify] Enviando email a:', destinatario);
        const r = await notifyVendorNewOrder(order, workshop);
        logSendResult(r);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error, emailId: r.emailId });
      }
      case 'taller_order_in_review': {
        const order = data.order as Order | undefined;
        const tallerEmail = String(data.tallerEmail ?? '').trim();
        if (!order || !tallerEmail) {
          return NextResponse.json({ ok: false, error: 'Faltan order o tallerEmail' }, { status: 400 });
        }
        console.log('[Notify] Enviando email a:', tallerEmail);
        const r = await notifyTallerOrderInReview(order, tallerEmail);
        logSendResult(r);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error, emailId: r.emailId });
      }
      case 'taller_quote_received': {
        const order = data.order as Order | undefined;
        const quote = data.quote as Quote | undefined;
        const tallerEmail = String(data.tallerEmail ?? '').trim();
        if (!order || !quote || !tallerEmail) {
          return NextResponse.json({ ok: false, error: 'Faltan order, quote o tallerEmail' }, { status: 400 });
        }
        console.log('[Notify] Enviando email a:', tallerEmail);
        const r = await notifyTallerQuoteReceived(order, quote, tallerEmail);
        logSendResult(r);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error, emailId: r.emailId });
      }
      case 'vendor_quote_response': {
        const order = data.order as Order | undefined;
        const workshop = data.workshop as Workshop | undefined;
        const response = data.response as EmailQuoteResponsePayload | undefined;
        if (!order || !workshop || !response?.kind) {
          return NextResponse.json({ ok: false, error: 'Faltan order, workshop o response' }, { status: 400 });
        }
        const destinatario =
          process.env.NOTIFICATION_VENDOR_EMAIL?.trim() || '(NOTIFICATION_VENDOR_EMAIL no definido)';
        console.log('[Notify] Enviando email a:', destinatario);
        const r = await notifyVendorQuoteResponse(order, workshop, response);
        logSendResult(r);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error, emailId: r.emailId });
      }
      case 'taller_order_closed': {
        const order = data.order as Order | undefined;
        const tallerEmail = String(data.tallerEmail ?? '').trim();
        if (!order || !tallerEmail) {
          return NextResponse.json({ ok: false, error: 'Faltan order o tallerEmail' }, { status: 400 });
        }
        console.log('[Notify] Enviando email a:', tallerEmail);
        const r = await notifyTallerOrderClosed(order, tallerEmail);
        logSendResult(r);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error, emailId: r.emailId });
      }
      default:
        return NextResponse.json({ ok: false, error: `Evento desconocido: ${event}` }, { status: 400 });
    }
  } catch (e) {
    console.error('[Notify] Excepción no esperada:', e);
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
