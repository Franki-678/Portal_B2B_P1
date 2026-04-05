import { NextRequest, NextResponse } from 'next/server';
import type { Order, Quote, Workshop } from '@/lib/types';
import type { EmailQuoteResponsePayload } from '@/lib/types';
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

/**
 * POST /api/notify
 * Body: { event, orderId, data }
 * `data` incluye objetos serializables (order, workshop, quote, tallerEmail, response, etc.)
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

  if (!event) {
    return NextResponse.json({ ok: false, error: 'Falta event' }, { status: 400 });
  }

  try {
    switch (event) {
      case 'vendor_new_order': {
        const order = data.order as Order | undefined;
        const workshop = data.workshop as Workshop | undefined;
        if (!order || !workshop) {
          return NextResponse.json({ ok: false, error: 'Faltan order o workshop' }, { status: 400 });
        }
        const r = await notifyVendorNewOrder(order, workshop);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error });
      }
      case 'taller_order_in_review': {
        const order = data.order as Order | undefined;
        const tallerEmail = String(data.tallerEmail ?? '').trim();
        if (!order || !tallerEmail) {
          return NextResponse.json({ ok: false, error: 'Faltan order o tallerEmail' }, { status: 400 });
        }
        const r = await notifyTallerOrderInReview(order, tallerEmail);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error });
      }
      case 'taller_quote_received': {
        const order = data.order as Order | undefined;
        const quote = data.quote as Quote | undefined;
        const tallerEmail = String(data.tallerEmail ?? '').trim();
        if (!order || !quote || !tallerEmail) {
          return NextResponse.json({ ok: false, error: 'Faltan order, quote o tallerEmail' }, { status: 400 });
        }
        const r = await notifyTallerQuoteReceived(order, quote, tallerEmail);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error });
      }
      case 'vendor_quote_response': {
        const order = data.order as Order | undefined;
        const workshop = data.workshop as Workshop | undefined;
        const response = data.response as EmailQuoteResponsePayload | undefined;
        if (!order || !workshop || !response?.kind) {
          return NextResponse.json({ ok: false, error: 'Faltan order, workshop o response' }, { status: 400 });
        }
        const r = await notifyVendorQuoteResponse(order, workshop, response);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error });
      }
      case 'taller_order_closed': {
        const order = data.order as Order | undefined;
        const tallerEmail = String(data.tallerEmail ?? '').trim();
        if (!order || !tallerEmail) {
          return NextResponse.json({ ok: false, error: 'Faltan order o tallerEmail' }, { status: 400 });
        }
        const r = await notifyTallerOrderClosed(order, tallerEmail);
        return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error });
      }
      default:
        return NextResponse.json({ ok: false, error: `Evento desconocido: ${event}` }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    console.error('[api/notify]', e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
