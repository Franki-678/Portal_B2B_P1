/**
 * Telegram Bot — Service Layer.
 *
 * Cliente delgado de la Bot API. Usa fetch directo (sin SDK) para mantener
 * el bundle chico en Vercel y evitar dependencias innecesarias.
 *
 * Ningún wrapper acá tira excepciones: todos devuelven `{ ok, error }` para
 * que el caller decida cómo reaccionar (logear, reintentar, swallow).
 */

import { getTelegramConfig } from './config';
import { formatAdminMetrics, type AdminMetricsSnapshot } from './formatters';

const TELEGRAM_API = 'https://api.telegram.org';

/** Resultado estándar de un envío. */
export interface SendResult {
  ok: boolean;
  error?: string;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: unknown;
}

/**
 * Envío genérico. parse_mode HTML y sin preview de URLs.
 */
async function sendMessage(
  chatId: string,
  text: string,
  options?: { silent?: boolean }
): Promise<SendResult> {
  const { botToken } = getTelegramConfig();

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:                 chatId,
        text,
        parse_mode:              'HTML',
        disable_web_page_preview: true,
        disable_notification:    options?.silent ?? false,
      }),
    });

    const data = (await res.json()) as TelegramApiResponse;
    if (!data.ok) {
      console.error('[Telegram] sendMessage:', data.error_code, data.description);
      return { ok: false, error: data.description ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[Telegram] fetch failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Despacha un mensaje al grupo de ventas.
 */
export async function sendToGroup(text: string, opts?: { silent?: boolean }): Promise<SendResult> {
  const { groupId } = getTelegramConfig();
  return sendMessage(groupId, text, opts);
}

/**
 * Despacha un mensaje privado al admin (Juan).
 */
export async function sendToAdmin(text: string, opts?: { silent?: boolean }): Promise<SendResult> {
  const { adminId } = getTelegramConfig();
  return sendMessage(adminId, text, opts);
}

/**
 * Envía el reporte de métricas al chat privado del admin.
 * Diseñada para ser llamada desde:
 *   - Vercel Cron Job (ej: cada día a las 19:00)
 *   - Comando `/metricas` del propio bot
 *   - Endpoint manual /api/admin/send-metrics
 */
export async function sendAdminMetricsReport(snap: AdminMetricsSnapshot): Promise<SendResult> {
  const text = formatAdminMetrics(snap);
  return sendToAdmin(text);
}

/**
 * Health-check: pide info del bot a la API. Útil para confirmar que el token
 * está bien configurado y que el bot tiene permisos.
 */
export async function pingBot(): Promise<SendResult & { botUsername?: string }> {
  const { botToken } = getTelegramConfig();
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`);
    const data = (await res.json()) as TelegramApiResponse & { result?: { username?: string } };
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, botUsername: data.result?.username };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}
