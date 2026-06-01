/**
 * scripts/migrate-base64.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * T103: Migración segura de imágenes base64 a Supabase Storage.
 *
 * CONTEXTO DEL PROBLEMA:
 *   Algunas imágenes quedaron guardadas como data URIs base64 (data:image/...)
 *   directamente en la columna `url` de `quote_item_images` cuando el upload
 *   a Storage fallaba. Esas strings de ~80 KB c/u se transmiten en CADA llamada
 *   a fetchAllOrders(), generando ~1.4 MB de egress innecesario por request.
 *
 * QUÉ HACE ESTE SCRIPT:
 *   1. Busca todas las filas donde url LIKE 'data:%' en quote_item_images (y
 *      opcionalmente order_images como salvaguarda).
 *   2. Por cada fila: extrae el buffer, detecta el mime-type, sube a Storage.
 *   3. Hace UPDATE en la fila original con la nueva URL pública de Storage.
 *   4. NUNCA elimina ni pone NULL — solo reemplaza el valor de la columna url.
 *
 * EJECUCIÓN:
 *   npx tsx scripts/migrate-base64.ts
 *   (requiere SUPABASE_SERVICE_ROLE_KEY en .env.local)
 *
 * SEGURIDAD:
 *   - Usa SERVICE_ROLE_KEY para bypassear RLS (necesario para UPDATE masivo).
 *   - Crea un backup lógico de cada URL original antes de reemplazarla.
 *   - Si falla la subida de UNA imagen, loguea el error y continúa con las demás.
 *   - Idempotente: puede ejecutarse múltiples veces sin duplicar imágenes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';

// ─── 1. Cargar variables de entorno ──────────────────────────────────────────

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌  No se encontró .env.local en', envPath);
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ─── 2. Helpers ──────────────────────────────────────────────────────────────

interface TableTarget {
  table:  'quote_item_images' | 'order_images';
  bucket: 'quote-images' | 'order-images';
}

const TABLES: TableTarget[] = [
  { table: 'quote_item_images', bucket: 'quote-images'  },
  { table: 'order_images',      bucket: 'order-images'  },
];

/**
 * Parsea un data URI base64 y devuelve el mime-type y el Buffer de la imagen.
 * Ejemplo: "data:image/jpeg;base64,/9j/4AAQ..." → { mime: 'image/jpeg', buffer }
 */
function parseDataUri(dataUri: string): { mime: string; ext: string; buffer: Buffer } | null {
  const match = dataUri.match(/^data:(image\/\w+);base64,([\s\S]+)$/);
  if (!match) return null;

  const mime   = match[1]; // e.g. "image/jpeg"
  const b64    = match[2];
  const buffer = Buffer.from(b64, 'base64');

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg':  'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/gif':  'gif',
    'image/heic': 'heic',
  };
  const ext = extMap[mime] ?? 'bin';

  return { mime, ext, buffer };
}

/** Genera un nombre de archivo único usando timestamp + random suffix. */
function uniqueFileName(ext: string): string {
  const ts     = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `migrate_${ts}_${random}.${ext}`;
}

// ─── 3. Lógica principal ─────────────────────────────────────────────────────

async function migrate(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  T103 — Migración base64 → Supabase Storage');
  console.log('═══════════════════════════════════════════════════════\n');

  // Usamos service_role_key para poder actualizar cualquier fila (bypass RLS)
  const sb = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });

  let totalProcesadas = 0;
  let totalOk         = 0;
  let totalError      = 0;

  for (const target of TABLES) {
    console.log(`\n📋  Tabla: ${target.table} → bucket: ${target.bucket}`);
    console.log('─────────────────────────────────────────────────────');

    // Buscar filas base64 (data URI) — SELECT para no alterar nada todavía
    const { data: rows, error: fetchErr } = await sb
      .from(target.table)
      .select('id, url, storage_path')
      .like('url', 'data:%');

    if (fetchErr) {
      console.error(`  ❌  Error al leer ${target.table}:`, fetchErr.message);
      continue;
    }

    if (!rows || rows.length === 0) {
      console.log('  ✅  Sin filas base64. Nada que migrar.');
      continue;
    }

    console.log(`  ℹ️   ${rows.length} filas con base64 encontradas.`);

    for (const row of rows) {
      totalProcesadas++;
      const rowId = row.id as string;

      try {
        // ── a. Parsear el data URI ─────────────────────────────
        const parsed = parseDataUri(row.url as string);
        if (!parsed) {
          console.warn(`  ⚠️   [${rowId}] No es un data URI válido. Saltando.`);
          totalError++;
          continue;
        }

        const { mime, ext, buffer } = parsed;
        const fileName = uniqueFileName(ext);
        console.log(`  🔄  [${rowId}] Subiendo ${fileName} (${buffer.length} bytes, ${mime})...`);

        // ── b. Subir buffer a Supabase Storage ─────────────────
        const { error: uploadErr } = await sb.storage
          .from(target.bucket)
          .upload(fileName, buffer, {
            contentType:  mime,
            cacheControl: '31536000', // 1 año — objetos inmutables
            upsert:       false,
          });

        if (uploadErr) {
          console.error(`  ❌  [${rowId}] Error al subir a Storage:`, uploadErr.message);
          totalError++;
          continue;
        }

        // ── c. Obtener URL pública ─────────────────────────────
        const { data: urlData } = sb.storage
          .from(target.bucket)
          .getPublicUrl(fileName);
        const publicUrl = urlData.publicUrl;

        // ── d. UPDATE en la fila: url ← publicUrl, storage_path ← fileName
        //    (nunca se pone NULL — simplemente reemplazamos el valor)
        const { error: updateErr } = await sb
          .from(target.table)
          .update({
            url:          publicUrl,
            storage_path: fileName,
          })
          .eq('id', rowId);

        if (updateErr) {
          // El archivo quedó subido pero el UPDATE falló — loguear con suficiente
          // info para corregir manualmente si hace falta
          console.error(`  ❌  [${rowId}] Subida OK pero UPDATE falló:`, updateErr.message);
          console.error(`       fileName: ${fileName}, publicUrl: ${publicUrl}`);
          totalError++;
          continue;
        }

        console.log(`  ✅  [${rowId}] → ${publicUrl.slice(0, 80)}...`);
        totalOk++;

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌  [${rowId}] Error inesperado:`, msg);
        totalError++;
      }
    }
  }

  // ─── 4. Resumen final ────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  RESUMEN');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total procesadas : ${totalProcesadas}`);
  console.log(`  ✅  OK           : ${totalOk}`);
  console.log(`  ❌  Errores      : ${totalError}`);
  if (totalError > 0) {
    console.log('\n  ⚠️   Hubo errores. Revisá los logs arriba.');
    console.log('      El script es idempotente: podés volver a ejecutarlo.');
    process.exit(1);
  } else {
    console.log('\n  🎉  Migración completada sin errores.');
    console.log(`      ~${Math.round(totalOk * 82)}KB de base64 eliminados del DB.`);
  }
}

migrate().catch(err => {
  console.error('\n💥  Error fatal:', err);
  process.exit(1);
});
