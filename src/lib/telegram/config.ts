/**
 * Telegram Bot — Configuración.
 *
 * Solo maneja variables de entorno. El mapeo de vendedores → @usuario
 * de Telegram vive en la tabla `profiles.telegram_username` y se consulta
 * en runtime (ver `service.ts → lookupVendorTelegramUsername`).
 *
 * Variables de entorno requeridas (configurar en Vercel):
 *   TELEGRAM_BOT_TOKEN          → Token del bot creado con @BotFather
 *   TELEGRAM_GROUP_ID           → ID del grupo de ventas (negativo, ej: -1001234567890)
 *   TELEGRAM_ADMIN_ID           → Chat ID privado de Juan (positivo)
 *   SUPABASE_WEBHOOK_SECRET     → Secreto compartido para validar webhooks
 *   SUPABASE_SERVICE_ROLE_KEY   → Service-role key para queries internas
 */

export interface TelegramConfig {
  readonly botToken: string;
  readonly groupId: string;
  readonly adminId: string;
}

/**
 * Lee y valida la config en tiempo de ejecución.
 * Tira si falta una variable requerida (evita cold-start silencioso).
 */
export function getTelegramConfig(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId  = process.env.TELEGRAM_GROUP_ID;
  const adminId  = process.env.TELEGRAM_ADMIN_ID;

  if (!botToken) throw new Error('[Telegram] TELEGRAM_BOT_TOKEN no configurado');
  if (!groupId)  throw new Error('[Telegram] TELEGRAM_GROUP_ID no configurado');
  if (!adminId)  throw new Error('[Telegram] TELEGRAM_ADMIN_ID no configurado');

  return { botToken, groupId, adminId };
}

/**
 * Secreto compartido que Supabase envía en el header `x-supabase-signature`
 * para validar que el webhook viene de nuestra instancia y no de un tercero.
 */
export function getWebhookSecret(): string {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) throw new Error('[Telegram] SUPABASE_WEBHOOK_SECRET no configurado');
  return secret;
}
