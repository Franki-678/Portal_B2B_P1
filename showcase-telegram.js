#!/usr/bin/env node
/**
 * showcase-telegram.js — Showcase completo de todas las plantillas del bot.
 *
 * Envía secuencialmente al GRUPO cada tipo de notificación, y al final
 * dispara el reporte privado de métricas al Admin (TELEGRAM_ADMIN_ID).
 *
 * USO:
 *   node showcase-telegram.js
 *
 * REQUISITOS — Agregar estas vars a .env.local (o exportar antes de correr):
 *   TELEGRAM_BOT_TOKEN=123456789:AAH...
 *   TELEGRAM_GROUP_ID=-1001234567890
 *   TELEGRAM_ADMIN_ID=987654321
 *
 * Estas vars solo están en Vercel Dashboard → Settings → Env Variables.
 * Para este showcase, copialas temporalmente en .env.local.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── 1. Cargar .env.local ────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env.local');

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
  console.log('✅ .env.local cargado\n');
} else {
  console.warn('⚠️  .env.local no encontrado — usando variables de entorno del sistema\n');
}

// ─── 2. Validar vars de Telegram ────────────────────────────────────────────

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID   = process.env.TELEGRAM_GROUP_ID;
const ADMIN_ID   = process.env.TELEGRAM_ADMIN_ID;
const TELEGRAM   = 'https://api.telegram.org';

if (!BOT_TOKEN || !GROUP_ID || !ADMIN_ID) {
  console.error('❌ Faltan variables de Telegram. Agregá en .env.local:\n');
  if (!BOT_TOKEN)  console.error('   TELEGRAM_BOT_TOKEN=<valor de Vercel>');
  if (!GROUP_ID)   console.error('   TELEGRAM_GROUP_ID=<valor de Vercel>');
  if (!ADMIN_ID)   console.error('   TELEGRAM_ADMIN_ID=<valor de Vercel>');
  console.error('\n   Las encontrás en: Vercel Dashboard → Tu proyecto → Settings → Environment Variables\n');
  process.exit(1);
}

// ─── 3. Helpers ──────────────────────────────────────────────────────────────

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://rcrepuestos.vercel.app').replace(/\/$/, '');

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatCurrency(n) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n);
}

function formatLabel(order) {
  if (order.workshop_order_number != null) {
    return `PED-${String(order.workshop_order_number).padStart(4, '0')}`;
  }
  return order.id.replace(/-/g, '').slice(0, 12).toUpperCase();
}

/** Deep link al detalle del pedido en la vista vendedor. */
function deepLink(label) {
  return `${APP_URL}/vendedor/pedidos/${encodeURIComponent(label)}`;
}

function vendorMention(telegramUsername, fallbackName) {
  if (telegramUsername && telegramUsername.trim()) {
    return `@${telegramUsername.trim().replace(/^@+/, '')}`;
  }
  return fallbackName ? `<b>${esc(fallbackName)}</b>` : '<b>el vendedor</b>';
}

async function sendTelegram(chatId, text) {
  const res = await fetch(`${TELEGRAM}/bot${BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:                  chatId,
      text,
      parse_mode:               'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  return data;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── 4. Datos mock realistas ──────────────────────────────────────────────────

const ORDER = {
  id: 'showcase-0001',
  workshop_id: 'wks-001',
  workshop_order_number: 142,
  status: 'aprobado',
  assigned_vendor_id: 'v-001',
  vehicle_brand: 'Ford',
  vehicle_model: 'Ranger',
  vehicle_year: 2021,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const TALLER     = 'Mecánica San Martín';
const VENDOR_TG  = 'Franco_San_Martin';   // con ping real
const VENDOR_NAME = 'Franco San Martín';
const LABEL      = formatLabel(ORDER);

// ─── 5. Generadores de mensajes (mirrors exactos de formatters.ts) ────────────

const MESSAGES = {

  pedido_creado() {
    const vehicle = `${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`;
    const link = deepLink(LABEL);
    return [
      `🆕 <b>[NUEVO PEDIDO]</b>`,
      `🏢 <b>Taller:</b> ${esc(TALLER)}`,
      `📦 <b>Pedido:</b> <a href="${link}"><code>#${LABEL}</code></a>`,
      `🚗 ${esc(vehicle)}`,
    ].join('\n');
  },

  pedido_tomado() {
    const link = deepLink(LABEL);
    return [
      `🙋 <b>[TOMADO]</b>`,
      `👤 <b>${esc(VENDOR_NAME)}</b> tomó <a href="${link}"><code>#${LABEL}</code></a>`,
      `🏢 ${esc(TALLER)} · 🚗 ${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`,
    ].join('\n');
  },

  cotizacion_enviada() {
    const link = deepLink(LABEL);
    return [
      `📝 <b>[COTIZADO]</b>`,
      `👤 <b>${esc(VENDOR_NAME)}</b> envió cotización para <a href="${link}"><code>#${LABEL}</code></a>`,
      `🏢 ${esc(TALLER)} · 🚗 ${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`,
    ].join('\n');
  },

  cotizacion_aprobada() {
    const mention = vendorMention(VENDOR_TG, VENDOR_NAME);
    const monto   = formatCurrency(17_800_000);
    const link    = deepLink(LABEL);
    return [
      `🟢 <b>[APROBADO]</b>`,
      `🏢 <b>Taller:</b> ${esc(TALLER)}`,
      `📦 <b>Pedido:</b> <a href="${link}"><code>#${LABEL}</code></a>`,
      `🚗 ${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`,
      `💰 <b>Monto:</b> ${monto}`,
      ``,
      `🔔 ${mention}, coordiná el cobro y la entrega.`,
    ].join('\n');
  },

  cotizacion_aprobada_parcial() {
    const mention = vendorMention(VENDOR_TG, VENDOR_NAME);
    const monto   = formatCurrency(9_400_000);
    const link    = deepLink(LABEL);
    return [
      `🟡 <b>[APROBADO PARCIAL]</b>`,
      `🏢 <b>Taller:</b> ${esc(TALLER)}`,
      `📦 <b>Pedido:</b> <a href="${link}"><code>#${LABEL}</code></a>`,
      `🚗 ${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`,
      `💰 <b>Monto:</b> ${monto}`,
      `💬 <i>Solo aprobamos los ítems de frenos, el resto lo cotizamos aparte.</i>`,
      ``,
      `🔔 ${mention}, coordiná el cobro y la entrega.`,
    ].join('\n');
  },

  cotizacion_rechazada() {
    const mention = vendorMention(VENDOR_TG, VENDOR_NAME);
    const link    = deepLink(LABEL);
    return [
      `🔴 <b>[RECHAZADO]</b>`,
      `🏢 <b>Taller:</b> ${esc(TALLER)}`,
      `📦 <b>Pedido:</b> <a href="${link}"><code>#${LABEL}</code></a>`,
      `🚗 ${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`,
      `💬 <i>Los precios estuvieron muy altos para este mes.</i>`,
      ``,
      `🔔 ${mention}, el taller rechazó tu cotización.`,
    ].join('\n');
  },

  pedido_marcado_pagado() {
    const link = deepLink(LABEL);
    return [
      `💰 <b>[PAGO REGISTRADO]</b>`,
      `👤 <b>${esc(VENDOR_NAME)}</b> registró el pago de <a href="${link}"><code>#${LABEL}</code></a>`,
      `🏢 ${esc(TALLER)} · 🚗 ${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`,
      `⏳ Mercadería pendiente de entrega.`,
    ].join('\n');
  },

  pedido_entregado() {
    const monto = formatCurrency(17_800_000);
    const link  = deepLink(LABEL);
    return [
      `📦 <b>[ENTREGADO Y COBRADO]</b>`,
      `👤 <b>${esc(VENDOR_NAME)}</b> entregó <a href="${link}"><code>#${LABEL}</code></a>`,
      `🏢 ${esc(TALLER)} · 🚗 ${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`,
      `✅ <b>Total facturado:</b> ${monto}`,
    ].join('\n');
  },

  reclamo_iniciado() {
    const mention = vendorMention(VENDOR_TG, VENDOR_NAME);
    const link    = deepLink(LABEL);
    return [
      `⚠️ <b>[CONFLICTO INICIADO]</b>`,
      `🏢 <b>Taller:</b> ${esc(TALLER)}`,
      `📦 <b>Pedido:</b> <a href="${link}"><code>#${LABEL}</code></a>`,
      `🚗 ${ORDER.vehicle_brand} ${ORDER.vehicle_model} ${ORDER.vehicle_year}`,
      `💬 <i>Los amortiguadores llegaron en mal estado, necesitamos reposición.</i>`,
      ``,
      `🔔 ${mention}, el taller inició un reclamo. Requiere atención inmediata.`,
    ].join('\n');
  },

  conflicto_resuelto() {
    const link = deepLink(LABEL);
    return [
      `🤝 <b>[CONFLICTO RESUELTO]</b>`,
      `👤 <b>Admin</b> resolvió <a href="${link}"><code>#${LABEL}</code></a>`,
      `🏢 ${esc(TALLER)}`,
      `💬 <i>Se acordó reenvío de los amortiguadores sin costo. Cliente conforme.</i>`,
    ].join('\n');
  },

  adminMetrics() {
    const facturado = 18_500_000;
    const entregados = 25;
    const ticket = Math.round(facturado / entregados);
    return [
      `📊 <b>Métricas — Hoy (Showcase)</b>`,
      ``,
      `💰 <b>Facturado:</b> ${formatCurrency(facturado)}`,
      `✅ <b>Entregados:</b> ${entregados}`,
      `📊 <b>Ticket promedio:</b> ${formatCurrency(ticket)}`,
      `⏳ <b>Pendientes:</b> 7`,
      `⚠️ <b>En conflicto:</b> 1`,
    ].join('\n');
  },
};

// ─── 6. Showcase runner ───────────────────────────────────────────────────────

const GROUP_EVENTS = [
  'pedido_creado',
  'pedido_tomado',
  'cotizacion_enviada',
  'cotizacion_aprobada',
  'cotizacion_aprobada_parcial',
  'cotizacion_rechazada',
  'pedido_marcado_pagado',
  'pedido_entregado',
  'reclamo_iniciado',
  'conflicto_resuelto',
];

async function run() {
  console.log('═'.repeat(60));
  console.log('🚀 SHOWCASE — Portal B2B Telegram Bot');
  console.log('═'.repeat(60));
  console.log(`📡 Grupo:  ${GROUP_ID}`);
  console.log(`👤 Admin:  ${ADMIN_ID}`);
  console.log(`🤖 Token:  ${BOT_TOKEN.slice(0, 8)}${'*'.repeat(12)}`);
  console.log('═'.repeat(60));
  console.log('');

  // ── Mensajes al grupo ─────────────────────────────────────────────────────
  console.log(`📢 Enviando ${GROUP_EVENTS.length} mensajes al grupo...\n`);

  let groupOk = 0;
  let groupFail = 0;

  for (const event of GROUP_EVENTS) {
    const msg = MESSAGES[event]();
    process.stdout.write(`  ↗  ${event.padEnd(30)}`);

    const result = await sendTelegram(GROUP_ID, msg);

    if (result.ok) {
      console.log(`✅ enviado (msg_id: ${result.result?.message_id ?? '?'})`);
      groupOk++;
    } else {
      console.log(`❌ ERROR: ${result.description ?? JSON.stringify(result)}`);
      groupFail++;
    }

    // 1.2s entre mensajes para respetar el rate-limit de Telegram (20 msg/min/grupo)
    await sleep(1200);
  }

  console.log('');
  console.log('─'.repeat(60));

  // ── Reporte privado al Admin ───────────────────────────────────────────────
  console.log('\n📊 Enviando reporte de métricas al Admin (privado)...');
  const metricMsg = MESSAGES.adminMetrics();
  const metricResult = await sendTelegram(ADMIN_ID, metricMsg);

  if (metricResult.ok) {
    console.log(`  ✅ Reporte enviado a ${ADMIN_ID} (msg_id: ${metricResult.result?.message_id ?? '?'})\n`);
  } else {
    console.log(`  ❌ Error al enviar reporte: ${metricResult.description ?? JSON.stringify(metricResult)}\n`);
    groupFail++;
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log(`📋 RESULTADO FINAL`);
  console.log(`   Grupo:   ${groupOk}/${GROUP_EVENTS.length} enviados correctamente`);
  console.log(`   Admin:   ${metricResult.ok ? '✅' : '❌'} reporte privado`);
  console.log(`   Fallos:  ${groupFail}`);
  console.log('═'.repeat(60));

  if (groupFail === 0) {
    console.log('\n🎉 ¡Showcase completo! Todos los mensajes llegaron a Telegram.\n');
  } else {
    console.log('\n⚠️  Algunos mensajes fallaron. Revisá los errores arriba.\n');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('\n❌ Error inesperado:', err.message);
  process.exit(1);
});
