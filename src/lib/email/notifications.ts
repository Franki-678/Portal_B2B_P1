/**
 * notifications.ts — STUB
 *
 * Las notificaciones al equipo se entregan exclusivamente via Telegram
 * (bot configurado con triggers en Supabase).
 * La recuperación de contraseñas usa el Auth nativo de Supabase.
 *
 * Este módulo mantiene las firmas de función para no romper imports existentes,
 * pero no envía emails. La dependencia `resend` fue eliminada de package.json.
 */

import type { Order, Quote, Workshop } from '@/lib/types';
import type { EmailQuoteResponsePayload } from '@/lib/types';
import { formatVendorOrderLabel } from '@/lib/utils';

export function getAppBaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (v) return v.replace(/\/$/, '');
  return 'http://localhost:3000';
}

// Mantiene la firma pública para compatibilidad con api/notify/route.ts
export type SendEmailResult = {
  ok: boolean;
  error?: string;
  skipped?: string;
  emailId?: string;
};

const DISABLED: SendEmailResult = { ok: false, skipped: 'email_disabled' };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function notifyVendorNewOrder(_order: Order, _workshop: Workshop): Promise<SendEmailResult> {
  return DISABLED;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function notifyTallerOrderInReview(_order: Order, _tallerEmail: string): Promise<SendEmailResult> {
  return DISABLED;
}

export async function notifyTallerQuoteReceived(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _order: Order,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _quote: Quote,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _tallerEmail: string
): Promise<SendEmailResult> {
  return DISABLED;
}

export async function notifyVendorQuoteResponse(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _order: Order,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _workshop: Workshop,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _response: EmailQuoteResponsePayload
): Promise<SendEmailResult> {
  return DISABLED;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function notifyTallerOrderClosed(_order: Order, _tallerEmail: string): Promise<SendEmailResult> {
  return DISABLED;
}

// Silencia el warning de "imported but never used" del helper que ya no se necesita
void formatVendorOrderLabel;
