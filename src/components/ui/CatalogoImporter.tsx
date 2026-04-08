'use client';

import { useState, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

// ─── Tipos ────────────────────────────────────────────────────

interface ImportResult {
  imported: number;
  errors: number;
  errorDetails: string[];
}

interface CatalogoRow {
  codigo: string;
  descripcion: string;
  marca?: string | null;
  anios?: string | null;
  tipo_pieza?: string | null;
  origen?: string | null;
  precio?: number | null;
  stock_cba?: boolean;
}

// ─── Normalización de headers ─────────────────────────────────

/**
 * Convierte "Código de Repuesto" → "codigo_de_repuesto"
 * Elimina tildes, convierte a minúsculas y reemplaza espacios por guiones bajos.
 */
function normalizeKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar tildes
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

/** Mapea la clave normalizada al campo de la tabla. */
function mapKey(normalized: string): keyof CatalogoRow | null {
  const MAP: Record<string, keyof CatalogoRow> = {
    codigo:          'codigo',
    code:            'codigo',
    descripcion:     'descripcion',
    description:     'descripcion',
    desc:            'descripcion',
    marca:           'marca',
    brand:           'marca',
    anios:           'anios',
    años:            'anios',
    years:           'anios',
    año:             'anios',
    tipo_pieza:      'tipo_pieza',
    tipo:            'tipo_pieza',
    part_type:       'tipo_pieza',
    origen:          'origen',
    origin:          'origen',
    precio:          'precio',
    price:           'precio',
    stock_cba:       'stock_cba',
    stock:           'stock_cba',
    stock_cordoba:   'stock_cba',
    stock_cba_:      'stock_cba',
  };
  return MAP[normalized] ?? null;
}

// ─── Parseo CSV ───────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const rawHeaders = lines[0].split(/[,;|\t]/).map(h => h.trim().replace(/^["']|["']$/g, ''));

  return lines.slice(1).map(line => {
    // Soporte básico para valores entre comillas
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    const sep = /[,;|\t]/.exec(line)?.[0] ?? ',';

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    rawHeaders.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

// ─── Parseo XLSX ──────────────────────────────────────────────

async function parseXLSX(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return (XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, string>[]);
}

// ─── Transformación de filas ──────────────────────────────────

function transformRow(raw: Record<string, string>): CatalogoRow | null {
  const mapped: Partial<CatalogoRow> = {};

  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const norm = normalizeKey(rawKey);
    const field = mapKey(norm);
    if (!field) continue;

    const val = String(rawVal).trim();

    if (field === 'precio') {
      const n = parseFloat(val.replace(/[^\d.,]/g, '').replace(',', '.'));
      mapped.precio = isNaN(n) ? null : n;
    } else if (field === 'stock_cba') {
      mapped.stock_cba =
        val === '1' ||
        val.toLowerCase() === 'true' ||
        val.toLowerCase() === 'sí' ||
        val.toLowerCase() === 'si' ||
        val.toLowerCase() === 'yes';
    } else {
      (mapped as Record<string, string | null>)[field] = val || null;
    }
  }

  if (!mapped.codigo || !mapped.descripcion) return null;

  return {
    codigo: mapped.codigo,
    descripcion: mapped.descripcion,
    marca: mapped.marca ?? null,
    anios: mapped.anios ?? null,
    tipo_pieza: mapped.tipo_pieza ?? null,
    origen: mapped.origen ?? null,
    precio: mapped.precio ?? null,
    stock_cba: mapped.stock_cba ?? false,
  };
}

// ─── Upsert en lotes ─────────────────────────────────────────

const BATCH_SIZE = 500;

async function upsertBatch(rows: CatalogoRow[]): Promise<{ ok: number; err: number; details: string[] }> {
  const sb = getSupabaseClient();
  const { error } = await (sb as any)
    .from('catalogo_repuestos')
    .upsert(rows, { onConflict: 'codigo' });

  if (error) {
    console.error('[Catálogo] Upsert error:', error.message);
    return { ok: 0, err: rows.length, details: [error.message] };
  }

  return { ok: rows.length, err: 0, details: [] };
}

// ─── Componente ───────────────────────────────────────────────

export function CatalogoImporter() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'reading' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0); // 0–100
  const [result, setResult] = useState<ImportResult | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const handleFile = async (file: File) => {
    setResult(null);
    setProgress(0);

    // ── Lectura ──────────────────────────────────────────
    setState('reading');
    setStatusMsg('Leyendo archivo…');

    let rawRows: Record<string, string>[] = [];

    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        rawRows = parseCSV(text);
      } else {
        rawRows = await parseXLSX(file);
      }
    } catch (e) {
      setState('error');
      setStatusMsg(`Error al leer el archivo: ${e instanceof Error ? e.message : 'desconocido'}`);
      return;
    }

    // ── Transformación ───────────────────────────────────
    const validRows: CatalogoRow[] = [];
    const parseErrors: string[] = [];

    rawRows.forEach((raw, i) => {
      const row = transformRow(raw);
      if (row) {
        validRows.push(row);
      } else {
        parseErrors.push(`Fila ${i + 2}: código o descripción vacíos`);
      }
    });

    if (validRows.length === 0) {
      setState('error');
      setStatusMsg('No se encontraron filas válidas. Verificá las columnas del archivo.');
      setResult({ imported: 0, errors: parseErrors.length, errorDetails: parseErrors });
      return;
    }

    // ── Upsert en lotes ──────────────────────────────────
    setState('uploading');
    const totalBatches = Math.ceil(validRows.length / BATCH_SIZE);
    let totalOk = 0;
    const allErrors = [...parseErrors];

    for (let b = 0; b < totalBatches; b++) {
      const batch = validRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      setStatusMsg(`Importando lote ${b + 1} de ${totalBatches} (${batch.length} filas)…`);

      const res = await upsertBatch(batch);
      totalOk += res.ok;
      allErrors.push(...res.details);

      setProgress(Math.round(((b + 1) / totalBatches) * 100));
    }

    setState('done');
    setStatusMsg('');
    setResult({
      imported: totalOk,
      errors: allErrors.length,
      errorDetails: allErrors.slice(0, 20),
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleFile(file);
    // Resetear el input para permitir reimportar el mismo archivo
    e.target.value = '';
  };

  const isWorking = state === 'reading' || state === 'uploading';

  return (
    <div className="space-y-4">
      {/* Botón principal */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={isWorking}
          onClick={() => fileInputRef.current?.click()}
        >
          {isWorking ? '⏳ Importando…' : '📥 Importar CSV / Excel'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleInputChange}
        />
        <p className="text-xs text-zinc-500 font-medium">
          Columnas esperadas: <span className="font-mono text-zinc-400">codigo, descripcion, marca, anios, tipo_pieza, origen, precio, stock_cba</span>
        </p>
      </div>

      {/* Progreso */}
      {isWorking && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium text-zinc-400">
            <span>{statusMsg}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error de lectura */}
      {state === 'error' && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-400 font-medium">
          ⚠️ {statusMsg}
        </div>
      )}

      {/* Resultado final */}
      {result && state === 'done' && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-2xl font-black text-emerald-400">{result.imported}</p>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Importados</p>
            </div>
            {result.errors > 0 && (
              <div className="text-center">
                <p className="text-2xl font-black text-rose-400">{result.errors}</p>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Errores</p>
              </div>
            )}
          </div>
          {result.errorDetails.length > 0 && (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300 font-medium">
                Ver detalle de errores
              </summary>
              <ul className="mt-2 space-y-0.5 font-mono pl-2 border-l border-zinc-700">
                {result.errorDetails.map((d, i) => (
                  <li key={i} className="text-rose-400/80">{d}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
