#!/usr/bin/env node
/**
 * test-webhook.js — Script de diagnóstico para el puente Supabase → Vercel → Telegram.
 *
 * USO:
 *   node test-webhook.js <SUPABASE_WEBHOOK_SECRET> [opciones]
 *
 * OPCIONES:
 *   --mode=real         Envía payload con formato exacto de Supabase (default)
 *   --mode=test-ping    Usa el test-mode interno del endpoint (ping solo)
 *   --mode=test-group   Usa el test-mode interno del endpoint (mensaje al grupo)
 *   --mode=test-mock    Usa el test-mode interno (simula cotizacion_aprobada mock)
 *   --bypass=TOKEN      Agrega ?x-vercel-protection-bypass=TOKEN a la URL
 *   --local             Apunta a http://localhost:3000 en vez de producción
 *
 * EJEMPLOS:
 *   node test-webhook.js miSecretoCopiadoDeVercel
 *   node test-webhook.js miSecreto --mode=test-group
 *   node test-webhook.js miSecreto --bypass=miBypassToken
 *   node test-webhook.js miSecreto --local
 *
 * Si el endpoint devuelve 401 con body HTML (login page de Vercel) → necesitás
 * configurar el bypass token. Ver sección de Troubleshooting al final del script.
 */

// ─── Config ───────────────────────────────────────────────────────────────

const PROD_BASE_URL =
  'https://portal-b2-b-p1-git-master-fransanmartinies-1066s-projects.vercel.app';
const LOCAL_BASE_URL = 'http://localhost:3000';
const ENDPOINT_PATH = '/api/webhooks/supabase/telegram';

// IDs de los pedidos de simulación creados en la sesión de debugging.
// Si no existen en tu DB, el endpoint devuelve { ok: false, reason: 'order_not_found' }
// pero NO crashea — eso sigue siendo útil para verificar que el código llega hasta ese punto.
const MOCK_ORDER_ID   = '11111111-aaaa-4000-8000-000000000001';
const MOCK_EVENT_ID   = 'eeeeeeee-0001-4000-8000-000000000001';
const MOCK_USER_ID    = 'aa000002-0000-4000-8000-000000000000'; // vendor UUID

// ─── Parse args ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
  Uso: node test-webhook.js <SUPABASE_WEBHOOK_SECRET> [--mode=...] [--bypass=TOKEN] [--local]

  Modos:
    real          Payload exacto de Supabase → prueba el flujo completo (default)
    test-ping     Usa x-test-mode del endpoint (solo pingea el bot)
    test-group    Usa x-test-mode del endpoint (manda "hola" al grupo)
    test-mock     Usa x-test-mode del endpoint (simula cotizacion_aprobada con datos fake)
  `);
  process.exit(0);
}

const secret   = args[0];
const modeArg  = args.find(a => a.startsWith('--mode='));
const mode     = modeArg ? modeArg.split('=')[1] : 'real';
const bypassArg = args.find(a => a.startsWith('--bypass='));
const bypassToken = bypassArg ? bypassArg.split('=')[1] : null;
const isLocal  = args.includes('--local');

const baseUrl  = isLocal ? LOCAL_BASE_URL : PROD_BASE_URL;
let endpointUrl = `${baseUrl}${ENDPOINT_PATH}`;
if (bypassToken) {
  endpointUrl += `?x-vercel-protection-bypass=${encodeURIComponent(bypassToken)}`;
}

// ─── Payloads ─────────────────────────────────────────────────────────────

/**
 * Payload exacto que Supabase envía al disparar un webhook en order_events → INSERT.
 * NOTA: `user_name` NO está en el payload — el endpoint lo resuelve via lookupUserName().
 */
function buildRealPayload() {
  return {
    type: 'INSERT',
    table: 'order_events',
    schema: 'public',
    record: {
      id: MOCK_EVENT_ID,
      order_id: MOCK_ORDER_ID,
      user_id: MOCK_USER_ID,
      action: 'cotizacion_aprobada',
      comment: 'Test desde test-webhook.js — debugging puente Supabase→Vercel',
      created_at: new Date().toISOString(),
      // user_name deliberadamente AUSENTE — el endpoint debe resolverlo desde profiles
    },
    old_record: null,
  };
}

function buildTestPayload(testCmd) {
  return { test: testCmd };
}

// ─── Headers ──────────────────────────────────────────────────────────────

function buildHeaders(isTestMode) {
  const h = {
    'Content-Type': 'application/json',
    'x-supabase-signature': secret,
  };
  if (isTestMode) h['x-test-mode'] = 'true';
  return h;
}

// ─── Runner ───────────────────────────────────────────────────────────────

async function run() {
  let body, headers, description;

  switch (mode) {
    case 'real':
      body = buildRealPayload();
      headers = buildHeaders(false);
      description = 'Payload REAL Supabase (order_events INSERT, cotizacion_aprobada)';
      break;
    case 'test-ping':
      body = buildTestPayload('ping');
      headers = buildHeaders(true);
      description = 'TEST MODE: ping bot';
      break;
    case 'test-group':
      body = buildTestPayload('group-hello');
      headers = buildHeaders(true);
      description = 'TEST MODE: manda mensaje al grupo';
      break;
    case 'test-mock':
      body = buildTestPayload('approved-mock');
      headers = buildHeaders(true);
      description = 'TEST MODE: cotizacion_aprobada con datos fake';
      break;
    default:
      console.error(`❌ Modo desconocido: "${mode}". Opciones: real | test-ping | test-group | test-mock`);
      process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`🧪 test-webhook.js — ${description}`);
  console.log('═'.repeat(60));
  console.log(`📡 URL:      ${endpointUrl}`);
  console.log(`🔑 Secret:   ${secret.slice(0, 6)}${'*'.repeat(Math.max(0, secret.length - 6))}`);
  console.log(`📦 Body:`);
  console.log(JSON.stringify(body, null, 2));
  console.log('─'.repeat(60));
  console.log('⏳ Enviando request...\n');

  let status, responseText, responseJson;

  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    status = res.status;
    responseText = await res.text();

    try {
      responseJson = JSON.parse(responseText);
    } catch {
      // No es JSON — probablemente el HTML de login de Vercel
      responseJson = null;
    }
  } catch (err) {
    console.error('❌ Error de red (fetch falló):', err.message);
    console.error('   → ¿El servidor está levantado? Si usás --local, corré `npm run dev` primero.');
    process.exit(1);
  }

  // ─── Interpretar resultado ─────────────────────────────────────────────

  const icon = status >= 200 && status < 300 ? '✅' : status === 401 ? '🔒' : '❌';
  console.log(`${icon} HTTP ${status}`);
  console.log('');

  if (responseJson) {
    console.log('📋 Respuesta JSON:');
    console.log(JSON.stringify(responseJson, null, 2));
  } else {
    console.log('⚠️  Respuesta NO es JSON (probablemente HTML):');
    console.log(responseText.slice(0, 500));
  }

  console.log('\n' + '─'.repeat(60));
  diagnose(status, responseJson, responseText, mode);
  console.log('═'.repeat(60) + '\n');
}

// ─── Diagnóstico automático ────────────────────────────────────────────────

function diagnose(status, json, rawText, mode) {
  console.log('🔎 DIAGNÓSTICO:');

  if (status === 401) {
    if (rawText && rawText.includes('<html')) {
      console.log(`
  ❌ Vercel Deployment Protection está bloqueando el request.
     Supabase recibe esta página HTML como respuesta → falla silencioso.

  SOLUCIÓN:
  1. Ir a Vercel Dashboard → Tu proyecto → Settings → Deployment Protection
  2. Activar "Protection Bypass for Automation"
  3. Copiar el token generado
  4. Volver a ejecutar:
     node test-webhook.js <secret> --bypass=<token_copiado>
  5. Una vez que funcione, agregar ese token a la URL del webhook en Supabase:
     https://TU_DOMINIO.vercel.app/api/webhooks/supabase/telegram?x-vercel-protection-bypass=TOKEN
      `);
    } else if (json && json.error === 'unauthorized') {
      console.log(`
  ❌ El endpoint respondió 401 "unauthorized".
     El header x-supabase-signature no coincide con SUPABASE_WEBHOOK_SECRET en Vercel.

  DIAGNÓSTICO:
  → El secret que pasaste como argumento ("${json.hint || ''}") no coincide
    con la variable SUPABASE_WEBHOOK_SECRET configurada en Vercel.

  SOLUCIÓN:
  1. Vercel Dashboard → Tu proyecto → Settings → Environment Variables
  2. Copiar el valor exacto de SUPABASE_WEBHOOK_SECRET
  3. Volver a ejecutar: node test-webhook.js <valor_exacto_copiado>
      `);
    }
    return;
  }

  if (status === 500) {
    console.log(`
  ❌ Error interno del servidor (500).
     Hay un bug en route.ts o formatters.ts que crashea antes de responder.

  SIGUIENTE PASO:
  → Revisar los logs de Vercel: Dashboard → Tu proyecto → Deployments → Functions → Logs
  → Filtrar por "[TG-WH]" para ver el stack trace exacto.
    `);
    return;
  }

  if (status === 200 && json) {
    if (json.ok === true) {
      if (json.reason === 'order_not_found') {
        console.log(`
  ✅ El endpoint respondió correctamente — el código es sano.
  ⚠️  El pedido de prueba (${MOCK_ORDER_ID}) NO existe en la DB de producción.
     Esto es esperado si solo creaste los pedidos de simulación en la sesión de debugging.

  CONCLUSIÓN:
  → El código llega hasta el punto de consultar la DB → el puente funciona.
  → Para una prueba completa, podés:
     a) Crear un pedido real en el CRM y ejecutar el flujo
     b) Usar --mode=test-mock para un mensaje con datos fake (no consulta DB)
        node test-webhook.js <secret> --mode=test-mock
        `);
      } else if (json.reason === 'silenced_event') {
        console.log(`
  ✅ El endpoint respondió OK — el código es sano.
  ℹ️  El evento fue "silenciado" (silenced_event). Significa que el formatter
     devolvió null para esa acción — no es un error.
        `);
      } else if (json.msgSnippet) {
        console.log(`
  🎉 ¡ÉXITO TOTAL! El mensaje fue formateado y enviado a Telegram.
  📝 Preview del mensaje: "${json.msgSnippet}"

  → El puente Supabase→Vercel→Telegram está 100% funcional.
  → Solo falta que los webhooks de Supabase estén configurados correctamente.
        `);
      } else if (json.bot && json.bot.ok === true) {
        console.log(`
  🎉 Bot ping exitoso. El bot "${json.bot.username || json.botUsername}" responde correctamente.
        `);
      } else if (json.ok && json.step === 'sendToGroup') {
        console.log(`
  🎉 Mensaje enviado al grupo de Telegram con éxito (modo test).
  → Si no ves el mensaje, verificar que el bot sea admin del grupo.
        `);
      }
    } else {
      // ok: false
      if (json.telegramError) {
        console.log(`
  ⚠️  El endpoint llegó hasta Telegram pero falló el envío.
  Error de Telegram: ${json.telegramError}

  CAUSAS COMUNES:
  → TELEGRAM_GROUP_ID incorrecto (el bot no pertenece a ese grupo)
  → El bot fue removido del grupo
  → El bot no es admin del grupo (en algunos casos Telegram silencia los bots)
        `);
      }
    }
    return;
  }

  // Fallback
  console.log(`  HTTP ${status} — Revisar la respuesta completa arriba.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

run().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
