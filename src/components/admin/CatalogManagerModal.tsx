'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

// ─── Constants ────────────────────────────────────────────────

const BATCH_SIZE = 500;

const REPUESTO_DB_COLS = [
  { key: 'codigo',      label: 'Código único',              required: true  },
  { key: 'descripcion', label: 'Descripción del repuesto',  required: true  },
  { key: 'marca',       label: 'Marca del repuesto',        required: false },
  { key: 'anios',       label: 'Años aplicables',           required: false },
  { key: 'tipo_pieza',  label: 'Tipo de pieza',             required: false },
  { key: 'origen',      label: 'Origen (nacional/importado)',required: false },
  { key: 'precio',      label: 'Precio (numérico)',          required: false },
  { key: 'stock_cba',   label: 'Stock CBA (true/false)',     required: false },
] as const;

// ─── Types ────────────────────────────────────────────────────

type TabId = 'vehiculos' | 'repuestos';

interface VehiculoRow {
  marca: string;
  modelo: string;
  year: string;
  version: string;
}

interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

// ─── CSV Parser (lightweight, no external deps) ───────────────

function parseCSVText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const sep = /[;|\t]/.exec(lines[0])?.[0] ?? ',';

  function parseLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        out.push(cur.trim().replace(/^"(.*)"$/, '$1'));
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim().replace(/^"(.*)"$/, '$1'));
    return out;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

// ─── Auto-detect column mapping ──────────────────────────────

function autoDetectMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '_');

  const ALIASES: Record<string, string> = {
    codigo: 'codigo', code: 'codigo', 'código': 'codigo',
    descripcion: 'descripcion', description: 'descripcion', desc: 'descripcion', 'descripción': 'descripcion',
    marca: 'marca', brand: 'marca',
    anios: 'anios', 'años': 'anios', years: 'anios', 'año': 'anios',
    tipo_pieza: 'tipo_pieza', tipo: 'tipo_pieza', part_type: 'tipo_pieza',
    origen: 'origen', origin: 'origen',
    precio: 'precio', price: 'precio', importe: 'precio', costo: 'precio',
    stock_cba: 'stock_cba', stock: 'stock_cba', stock_cordoba: 'stock_cba',
  };

  for (const h of headers) {
    const norm = normalize(h);
    const dbCol = ALIASES[norm];
    if (dbCol && !map[dbCol]) map[dbCol] = h;
  }
  return map;
}

// ─── Shared: ProgressBar ──────────────────────────────────────

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-300 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ─── Shared: TableStats ───────────────────────────────────────

function TableStats({ table }: { table: 'vehiculos' | 'catalogo_repuestos' }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const sb = getSupabaseClient();
    void (sb as any)
      .from(table)
      .select('*', { count: 'exact', head: true })
      .then(({ count: c }: { count: number | null }) => setCount(c ?? 0));
  }, [table]);

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
      <span className="text-xs text-zinc-500">Registros en DB:</span>
      <span className="text-sm font-bold text-zinc-200 tabular-nums">
        {count === null ? '…' : count.toLocaleString('es-AR')}
      </span>
    </div>
  );
}

// ─── Shared: DangerZone ───────────────────────────────────────

function DangerZone({
  table,
  onCleared,
}: {
  table: 'vehiculos' | 'catalogo_repuestos';
  onCleared: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'confirm1' | 'confirm2' | 'working'>('idle');
  const [err, setErr] = useState('');

  const tableLabel = table === 'vehiculos' ? 'vehiculos' : 'catalogo_repuestos';

  const handleClick = async () => {
    if (phase === 'idle')    { setPhase('confirm1'); return; }
    if (phase === 'confirm1') { setPhase('confirm2'); return; }
    if (phase === 'confirm2') {
      setPhase('working');
      setErr('');
      try {
        const sb = getSupabaseClient();
        const q = table === 'vehiculos'
          ? (sb as any).from('vehiculos').delete().gte('id', 0)
          : (sb as any).from('catalogo_repuestos').delete().not('id', 'is', null);
        const { error } = await q;
        if (error) throw new Error(error.message);
        setPhase('idle');
        onCleared();
      } catch (e: any) {
        setErr(e.message ?? 'Error desconocido');
        setPhase('idle');
      }
    }
  };

  const LABELS: Record<typeof phase, string> = {
    idle:     `🗑️ Vaciar tabla "${tableLabel}"`,
    confirm1: '⚠️ ¿Seguro? Se borrará TODO',
    confirm2: '🔴 Confirmar — acción irreversible',
    working:  '⏳ Borrando...',
  };

  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2.5">
      <p className="text-xs font-semibold text-rose-400 leading-relaxed">
        ⚠️ Zona peligrosa — vaciá la tabla antes de una reimportación para evitar duplicados
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleClick}
          disabled={phase === 'working'}
          className={[
            'px-4 py-2 rounded-lg text-sm font-semibold transition-all border',
            phase === 'idle'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50'
              : phase === 'working'
              ? 'border-zinc-700 bg-zinc-800 text-zinc-500 cursor-not-allowed'
              : 'border-rose-500 bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/20',
          ].join(' ')}
        >
          {LABELS[phase]}
        </button>
        {(phase === 'confirm1' || phase === 'confirm2') && (
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            Cancelar
          </button>
        )}
      </div>
      {err && (
        <p className="text-xs text-rose-400 font-mono">Error: {err}</p>
      )}
    </div>
  );
}

// ─── VehiculosTab ─────────────────────────────────────────────

type VehStatus = 'idle' | 'parsing' | 'uploading' | 'done' | 'error';

function VehiculosTab() {
  const [status, setStatus] = useState<VehStatus>('idle');
  const [progress, setProgress]   = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [doneRows, setDoneRows]   = useState(0);
  const [errMsg, setErrMsg]       = useState('');
  const [statsKey, setStatsKey]   = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setTotalRows(0);
    setDoneRows(0);
    setErrMsg('');
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    reset();
    setStatus('parsing');

    try {
      const text = await file.text();

      let data: unknown;
      try { data = JSON.parse(text); }
      catch { throw new Error('El archivo no es JSON válido.'); }

      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('El JSON debe ser un objeto con marcas como claves.');
      }

      // Flatten 4-level structure: { MARCA: { modelos: { MODELO: { YEAR: [versions] } } } }
      const rows: VehiculoRow[] = [];
      for (const [marca, marcaData] of Object.entries(data as Record<string, unknown>)) {
        const modelos = (marcaData as any)?.modelos;
        if (!modelos || typeof modelos !== 'object') continue;
        for (const [modelo, yearMap] of Object.entries(modelos as Record<string, unknown>)) {
          if (!yearMap || typeof yearMap !== 'object') continue;
          for (const [year, versions] of Object.entries(yearMap as Record<string, unknown>)) {
            if (Array.isArray(versions) && versions.length > 0) {
              for (const v of versions) {
                rows.push({ marca, modelo, year, version: String(v) });
              }
            } else {
              // Year with no versions: insert a placeholder row
              rows.push({ marca, modelo, year, version: '' });
            }
          }
        }
      }

      if (rows.length === 0) {
        throw new Error('No se encontraron vehículos. Verificá que el JSON tenga la estructura correcta.');
      }

      setTotalRows(rows.length);
      setStatus('uploading');

      const sb = getSupabaseClient();
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const { error } = await (sb as any).from('vehiculos').insert(chunk);
        if (error) throw new Error(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
        const done = Math.min(i + BATCH_SIZE, rows.length);
        setDoneRows(done);
        setProgress(Math.round((done / rows.length) * 100));
      }

      setStatus('done');
      setStatsKey(k => k + 1);
    } catch (e: any) {
      setErrMsg(e.message ?? 'Error desconocido');
      setStatus('error');
    }
  };

  const inProgress = status === 'parsing' || status === 'uploading';

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="flex items-center justify-between">
        <TableStats key={statsKey} table="vehiculos" />
        {(status === 'done' || status === 'error') && (
          <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            ↩ Cargar otro archivo
          </button>
        )}
      </div>

      {/* Format reference */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5">
          📋 Formato JSON esperado — InfoAuto (4 niveles)
        </p>
        <pre className="text-[11px] leading-relaxed text-emerald-400 overflow-x-auto select-all">{`{
  "TOYOTA": {
    "descripcion": "...",
    "modelos": {
      "COROLLA": {
        "2022": ["COROLLA XEI 2.0 AT", "COROLLA SE-G 2.0 AT"],
        "2023": ["COROLLA XEI 2.0 AT"]
      },
      "HILUX": {
        "2023": ["HILUX SRX 4x4 AT", "HILUX SR 4x2 MT"]
      }
    }
  },
  "VOLKSWAGEN": { ... }
}`}</pre>
      </div>

      {/* File drop zone */}
      {status === 'idle' && (
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer group rounded-2xl border-2 border-dashed border-zinc-700 hover:border-orange-500/50 bg-zinc-900/40 hover:bg-zinc-900/70 p-10 text-center transition-all duration-200"
          >
            <div className="text-4xl mb-3 transition-transform group-hover:scale-110">📂</div>
            <p className="text-sm font-medium text-zinc-400">
              Hacé click o arrastrá el archivo{' '}
              <code className="text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-md">.json</code>
            </p>
            <p className="text-xs text-zinc-600 mt-1.5">
              El parseo y la carga en lotes se realizan en el navegador. Compatible con InfoAuto.
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
        </div>
      )}

      {/* Parsing */}
      {status === 'parsing' && (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="w-4 h-4 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin shrink-0" />
          <span className="text-sm text-zinc-400">Parseando JSON y aplanando 4 niveles...</span>
        </div>
      )}

      {/* Upload progress */}
      {status === 'uploading' && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <ProgressBar
            value={progress}
            label={`${doneRows.toLocaleString('es-AR')} / ${totalRows.toLocaleString('es-AR')} vehículos`}
          />
          <p className="text-xs text-zinc-500">
            Lote {Math.ceil((doneRows || 1) / BATCH_SIZE)} de {Math.ceil(totalRows / BATCH_SIZE)} —
            no cerrés esta ventana hasta que finalice
          </p>
        </div>
      )}

      {/* Done */}
      {status === 'done' && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-bold text-emerald-400">
              {totalRows.toLocaleString('es-AR')} vehículos importados correctamente
            </p>
            <p className="text-xs text-zinc-500">
              {Math.ceil(totalRows / BATCH_SIZE)} lotes de {BATCH_SIZE} filas procesados
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-1.5">
          <p className="text-sm font-semibold text-rose-400">❌ Error de importación</p>
          <p className="text-xs text-rose-400/80 font-mono break-all">{errMsg}</p>
          <p className="text-xs text-zinc-500 mt-1">
            Tip: si hay datos existentes, vacíar la tabla antes de reimportar evita conflictos de clave.
          </p>
        </div>
      )}

      {/* Danger Zone — only when not actively importing */}
      {!inProgress && (
        <>
          <hr className="border-zinc-800" />
          <DangerZone
            table="vehiculos"
            onCleared={() => setStatsKey(k => k + 1)}
          />
        </>
      )}
    </div>
  );
}

// ─── RepuestosTab ─────────────────────────────────────────────

type RepPhase = 'idle' | 'parsed' | 'uploading' | 'done' | 'error';

function RepuestosTab() {
  const [phase, setPhase]         = useState<RepPhase>('idle');
  const [parsed, setParsed]       = useState<ParsedFile | null>(null);
  const [mapping, setMapping]     = useState<Record<string, string>>({});
  const [progress, setProgress]   = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [doneRows, setDoneRows]   = useState(0);
  const [errMsg, setErrMsg]       = useState('');
  const [statsKey, setStatsKey]   = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setParsed(null);
    setMapping({});
    setProgress(0);
    setTotalRows(0);
    setDoneRows(0);
    setErrMsg('');
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    reset();

    try {
      const name = file.name.toLowerCase();
      let headers: string[] = [];
      let rows: Record<string, string>[] = [];

      if (name.endsWith('.csv')) {
        const text = await file.text();
        const res = parseCSVText(text);
        headers = res.headers;
        rows = res.rows;
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        headers = data.length > 0 ? Object.keys(data[0]) : [];
        rows = data.map(r =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))
        );
      } else if (name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) {
          throw new Error('El JSON de repuestos debe ser un array de objetos: [{ ... }, { ... }]');
        }
        headers = data.length > 0 ? Object.keys(data[0]) : [];
        rows = data.map((r: Record<string, unknown>) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))
        );
      } else {
        throw new Error('Formato no soportado. Usá .csv, .xlsx o .json');
      }

      if (rows.length === 0) throw new Error('El archivo está vacío o no tiene filas válidas.');

      setParsed({ headers, rows });
      setTotalRows(rows.length);
      setMapping(autoDetectMapping(headers));
      setPhase('parsed');
    } catch (e: any) {
      setErrMsg(e.message ?? 'Error al leer el archivo');
      setPhase('error');
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    if (!mapping.descripcion) {
      setErrMsg('El campo "descripcion" es obligatorio. Asignale una columna del archivo.');
      return;
    }

    setPhase('uploading');
    setProgress(0);
    setDoneRows(0);
    setErrMsg('');

    try {
      // Build mapped objects
      const mapped: Record<string, unknown>[] = parsed.rows.map((row, idx) => {
        const obj: Record<string, unknown> = {};
        for (const [dbCol, fileCol] of Object.entries(mapping)) {
          if (!fileCol) continue;
          const raw = row[fileCol];
          if (raw === '' || raw === undefined) { obj[dbCol] = null; continue; }
          if (dbCol === 'precio') {
            const n = parseFloat(String(raw).replace(/[^\d.,]/g, '').replace(',', '.'));
            obj[dbCol] = isNaN(n) ? null : n;
          } else if (dbCol === 'stock_cba') {
            const s = String(raw).toLowerCase();
            obj[dbCol] = s === '1' || s === 'true' || s === 'si' || s === 'sí' || s === 'yes';
          } else {
            obj[dbCol] = String(raw).trim() || null;
          }
        }
        // Auto-generate codigo when not mapped
        if (!obj.codigo) {
          obj.codigo = `IMP-${idx.toString(36).toUpperCase().padStart(5, '0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
        }
        return obj;
      });

      const sb = getSupabaseClient();
      for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
        const chunk = mapped.slice(i, i + BATCH_SIZE);
        const { error } = await (sb as any)
          .from('catalogo_repuestos')
          .upsert(chunk, { onConflict: 'codigo', ignoreDuplicates: false });
        if (error) throw new Error(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
        const done = Math.min(i + BATCH_SIZE, mapped.length);
        setDoneRows(done);
        setProgress(Math.round((done / mapped.length) * 100));
      }

      setPhase('done');
      setStatsKey(k => k + 1);
    } catch (e: any) {
      setErrMsg(e.message ?? 'Error durante la importación');
      setPhase('error');
    }
  };

  const inProgress = phase === 'uploading';

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="flex items-center justify-between">
        <TableStats key={statsKey} table="catalogo_repuestos" />
        {phase !== 'idle' && !inProgress && (
          <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            ↩ Cargar otro archivo
          </button>
        )}
      </div>

      {/* DB columns reference */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
          📋 Columnas de la tabla catalogo_repuestos
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {REPUESTO_DB_COLS.map(col => (
            <div key={col.key} className="flex items-baseline gap-1.5 text-[11px]">
              <code className="text-orange-400 font-mono shrink-0">{col.key}</code>
              {col.required && <span className="text-rose-400 shrink-0">*</span>}
              <span className="text-zinc-600 truncate">{col.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Idle: Drop zone */}
      {phase === 'idle' && (
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer group rounded-2xl border-2 border-dashed border-zinc-700 hover:border-orange-500/50 bg-zinc-900/40 hover:bg-zinc-900/70 p-10 text-center transition-all duration-200"
          >
            <div className="text-4xl mb-3 transition-transform group-hover:scale-110">📋</div>
            <p className="text-sm font-medium text-zinc-400">
              Hacé click o arrastrá el archivo
            </p>
            <p className="text-xs text-zinc-600 mt-1.5 space-x-2">
              <code className="text-orange-400">.csv</code>
              <span className="text-zinc-700">·</span>
              <code className="text-orange-400">.xlsx</code>
              <span className="text-zinc-700">·</span>
              <code className="text-orange-400">.json</code>
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" className="hidden" onChange={handleFile} />
        </div>
      )}

      {/* Parsed: Column mapping UI */}
      {phase === 'parsed' && parsed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-200">
              Mapeo de columnas{' '}
              <span className="font-normal text-zinc-500">
                — {totalRows.toLocaleString('es-AR')} filas detectadas
              </span>
            </p>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              ← Cambiar archivo
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            {REPUESTO_DB_COLS.map(col => (
              <div key={col.key} className="flex items-center gap-3">
                {/* DB column */}
                <div className="w-36 shrink-0 flex items-center gap-1">
                  <code className="text-xs text-orange-400 font-mono">{col.key}</code>
                  {col.required && <span className="text-rose-400 text-xs">*</span>}
                </div>
                {/* Arrow */}
                <span className="text-zinc-700 shrink-0 text-xs">→</span>
                {/* File column select */}
                <select
                  value={mapping[col.key] ?? ''}
                  onChange={e => setMapping(prev => ({ ...prev, [col.key]: e.target.value }))}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 focus:border-orange-500 focus:outline-none transition"
                >
                  <option value="">— No mapear —</option>
                  {parsed.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                {/* Checkmark */}
                <span className={`text-[10px] shrink-0 w-3 ${mapping[col.key] ? 'text-emerald-500' : 'text-transparent'}`}>
                  ✓
                </span>
              </div>
            ))}
          </div>

          {!mapping.descripcion && (
            <p className="text-xs text-amber-400">
              ⚠️ El campo <code className="text-orange-400">descripcion</code> es obligatorio. Asignale la columna correspondiente para continuar.
            </p>
          )}

          <button
            type="button"
            onClick={handleImport}
            disabled={!mapping.descripcion}
            className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-md shadow-orange-500/10"
          >
            Importar {totalRows.toLocaleString('es-AR')} repuestos →
          </button>
        </div>
      )}

      {/* Uploading */}
      {phase === 'uploading' && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <ProgressBar
            value={progress}
            label={`${doneRows.toLocaleString('es-AR')} / ${totalRows.toLocaleString('es-AR')} repuestos`}
          />
          <p className="text-xs text-zinc-500">
            Lote {Math.ceil((doneRows || 1) / BATCH_SIZE)} de {Math.ceil(totalRows / BATCH_SIZE)} —
            no cerrés esta ventana hasta que finalice
          </p>
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-bold text-emerald-400">
              {totalRows.toLocaleString('es-AR')} repuestos importados correctamente
            </p>
            <p className="text-xs text-zinc-500">
              {Math.ceil(totalRows / BATCH_SIZE)} lotes de {BATCH_SIZE} filas procesados
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-1.5">
          <p className="text-sm font-semibold text-rose-400">❌ Error</p>
          <p className="text-xs text-rose-400/80 font-mono break-all">{errMsg}</p>
        </div>
      )}

      {/* Danger Zone */}
      {!inProgress && (
        <>
          <hr className="border-zinc-800" />
          <DangerZone
            table="catalogo_repuestos"
            onCleared={() => setStatsKey(k => k + 1)}
          />
        </>
      )}
    </div>
  );
}

// ─── CatalogManagerModal (exported) ──────────────────────────

export function CatalogManagerModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('vehiculos');

  const TABS: Array<{ id: TabId; icon: string; label: string }> = [
    { id: 'vehiculos', icon: '🚗', label: 'Vehículos' },
    { id: 'repuestos', icon: '🔧', label: 'Repuestos' },
  ];

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:border-orange-500/40 hover:bg-zinc-700 text-sm font-semibold text-zinc-200 transition-all shadow-sm"
      >
        <span className="text-base">🗄️</span>
        <span>Gestionar Base de Datos</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/70">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-lg">
                  🗄️
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-100">Gestionar Base de Datos</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Importación de catálogos y mantenimiento de tablas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 px-6 shrink-0">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                    activeTab === tab.id
                      ? 'border-orange-500 text-orange-400'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700',
                  ].join(' ')}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-6 py-5">
              {activeTab === 'vehiculos' ? <VehiculosTab /> : <RepuestosTab />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
