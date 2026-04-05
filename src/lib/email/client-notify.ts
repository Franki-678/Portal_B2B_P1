'use client';

export type NotifyEventName =
  | 'vendor_new_order'
  | 'taller_order_in_review'
  | 'taller_quote_received'
  | 'vendor_quote_response'
  | 'taller_order_closed';

/**
 * Dispara notificación por email vía API (no bloquea UI).
 */
export function postNotify(
  event: NotifyEventName,
  orderId: string,
  data: Record<string, unknown>
): void {
  void fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, orderId, data }),
  }).catch(err => {
    console.warn('[postNotify]', event, err);
  });
}
