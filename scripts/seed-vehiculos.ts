/**
 * scripts/seed-vehiculos.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Seed script: carga el catálogo de vehículos (JSON 4 niveles) a Supabase.
 *
 * FORMATO JSON ESPERADO:
 *   {
 *     "HONDA": {
 *       "descripcion": "Honda",          ← opcional, se ignora
 *       "modelos": {
 *         "CITY": {
 *           "2009": ["CITY 1.5 EXL", "CITY 1.5 LX"],
 *           "2010": ["CITY 1.5 EXL"]
 *         }
 *       }
 *     }
 *   }
 *
 * USO:
 *   npm run seed:vehiculos -- /ruta/al/vehiculos.json
 *
 * VARIABLES DE ENTORNO (en .env.local):
 *   SUPABASE_SERVICE_ROLE_KEY   → recomendado (bypasea RLS)
 *   NEXT_PUBLIC_SUPABASE_URL    → siempre requerida
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY → fallback si no hay service role key
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ─── Cargar .env.local manualmente (tsx no carga dotenv automáticamente) ─────

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

// ─── Tipos ────────────────────────────────────────────────────────────────────

type VehicleRow = {
  marca: string;
  modelo: string;
  year: string;
  version: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

function pluralize(n: number, singular: string, plural = singular + 's') {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

function fmt(label: string, value: string | number) {
  console.log(`  ${label.padEnd(24)} ${value}`);
}

// ─── Parseo del JSON ──────────────────────────────────────────────────────────

function parseJsonCatalog(raw: unknown): VehicleRow[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('El JSON debe ser un objeto con las marcas como claves.');
  }

  const catalog = raw as Record<string, unknown>;
  const rows: VehicleRow[] = [];
  let skipped = 0;

  for (const [marcaKey, marcaData] of Object.entries(catalog)) {
    const marca = marcaKey.trim();
    if (!marca) { skipped++; continue; }

    // Soporte para { descripcion?, modelos: {...} } o directo { Modelo: { Año: [...] } }
    let modelosMap: Record<string, unknown>;

    if (
      typeof marcaData === 'object' &&
      marcaData !== null &&
      !Array.isArray(marcaData) &&
      'modelos' in marcaData
    ) {
      modelosMap = (marcaData as { modelos: Record<string, unknown> }).modelos;
    } else if (typeof marcaData === 'object' && marcaData !== null && !Array.isArray(marcaData)) {
      modelosMap = marcaData as Record<string, unknown>;
    } else {
      skipped++;
      continue;
    }

    for (const [modeloKey, yearsData] of Object.entries(modelosMap)) {
      const modelo = modeloKey.trim();
      if (!modelo) { skipped++; continue; }

      if (typeof yearsData !== 'object' || yearsData === null || Array.isArray(yearsData)) {
        skipped++;
        continue;
      }

      const years = yearsData as Record<string, unknown>;

      for (const [yearKey, versions] of Object.entries(years)) {
        const year = yearKey.trim();
        if (!year) { skipped++; continue; }
        if (!Array.isArray(versions)) { skipped++; continue; }

        for (const version of versions) {
          if (typeof version !== 'string' || !version.trim()) { skipped++; continue; }
          rows.push({ marca, modelo, year, version: version.trim() });
        }
      }
    }
  }

  if (skipped > 0) {
    console.warn(`  ⚠️  Se ignoraron ${skipped} entradas con estructura inválida.`);
  }

  return rows;
}

// ─── Upsert en batches ────────────────────────────────────────────────────────

async function upsertBatches(
  sb: ReturnType<typeof createClient>,
  rows: VehicleRow[]
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(
      `\r  Lote ${batchNum}/${totalBatches} — ${pluralize(i + batch.length, 'fila')} procesadas...`
    );

    const { error } = await sb
      .from('vehiculos')
      .upsert(batch, { onConflict: 'marca,modelo,year,version' });

    if (error) {
      console.error(`\n  ❌ Error en lote ${batchNum}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  process.stdout.write('\n');
  return { inserted, errors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚗  Portal B2B — Seed Catálogo de Vehículos');
  console.log('═'.repeat(50));

  // ── Supabase credentials ──────────────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey ?? anonKey;

  if (!url || !key) {
    console.error('❌  Faltan variables de entorno:');
    if (!url) console.error('   NEXT_PUBLIC_SUPABASE_URL');
    if (!key) console.error('   SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY)');
    process.exit(1);
  }

  const keyType = serviceKey ? 'service_role (RLS bypassed ✓)' : 'anon (RLS activo ⚠)';
  fmt('Supabase URL:', url.replace(/^https?:\/\//, '').split('.')[0] + '.supabase.co');
  fmt('Auth key:', keyType);

  // ── Archivo JSON ──────────────────────────────────────────
  const jsonPath = process.argv[2] ?? resolve(process.cwd(), 'data', 'vehiculos.json');
  const resolvedPath = resolve(jsonPath);

  fmt('JSON path:', resolvedPath);

  if (!existsSync(resolvedPath)) {
    console.error(`\n❌  Archivo no encontrado: ${resolvedPath}`);
    console.error('   Uso: npm run seed:vehiculos -- /ruta/al/vehiculos.json');
    process.exit(1);
  }

  // ── Parsear JSON ──────────────────────────────────────────
  console.log('\n📂  Leyendo archivo...');
  const raw = JSON.parse(readFileSync(resolvedPath, 'utf-8'));

  console.log('🔍  Parseando estructura JSON...');
  const rows = parseJsonCatalog(raw);

  if (rows.length === 0) {
    console.error('❌  No se encontraron filas válidas. Revisá la estructura del JSON.');
    process.exit(1);
  }

  // Estadísticas previas al upsert
  const marcas = new Set(rows.map(r => r.marca));
  const modelos = new Set(rows.map(r => `${r.marca}::${r.modelo}`));

  console.log('\n📊  Resumen del catálogo a cargar:');
  fmt('  Marcas:', marcas.size);
  fmt('  Modelos únicos:', modelos.size);
  fmt('  Filas totales:', rows.length.toLocaleString());

  // ── Upsert ────────────────────────────────────────────────
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n⚡  Inserting en lotes de ${BATCH_SIZE}...`);
  const startMs = Date.now();
  const { inserted, errors } = await upsertBatches(sb, rows);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  // ── Resultado ─────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  if (errors === 0) {
    console.log(`✅  Seed completado en ${elapsed}s`);
    fmt('  Filas upserted:', inserted.toLocaleString());
  } else {
    console.log(`⚠️   Seed completado con errores en ${elapsed}s`);
    fmt('  Filas OK:', inserted.toLocaleString());
    fmt('  Filas con error:', errors.toLocaleString());
  }

  // Verificar conteo real en la tabla
  const { count, error: countErr } = await sb
    .from('vehiculos')
    .select('*', { count: 'exact', head: true });

  if (!countErr && count !== null) {
    fmt('  Total en tabla:', count.toLocaleString());
  }

  console.log('');
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥  Error inesperado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
