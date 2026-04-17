'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function AdminConfiguracionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    ok: boolean;
    inserted?: number;
    error?: string;
  } | null>(null);

  // Sólo admin puede usar esta página
  if (user && user.role !== 'admin') {
    router.replace('/vendedor/configuracion');
    return null;
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      // Leer el archivo CSV/JSON
      const text = await file.text();
      let rows: Record<string, unknown>[] = [];

      if (file.name.endsWith('.json')) {
        rows = JSON.parse(text);
      } else if (file.name.endsWith('.csv')) {
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
        });
      } else {
        setUploadResult({ ok: false, error: 'Formato no soportado. Usá .json o .csv' });
        setUploading(false);
        return;
      }

      if (rows.length === 0) {
        setUploadResult({ ok: false, error: 'El archivo está vacío o no tiene datos válidos.' });
        setUploading(false);
        return;
      }

      const sb = getSupabaseClient();

      // Upsert en lotes de 500
      const BATCH = 500;
      let total = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await (sb as any)
          .from('catalogo_repuestos')
          .upsert(batch, { onConflict: 'codigo' });
        if (error) throw new Error(error.message);
        total += batch.length;
      }

      setUploadResult({ ok: true, inserted: total });
    } catch (err) {
      setUploadResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Error desconocido al procesar el archivo.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <TopBar
        title="Configuración"
        subtitle="Gestión del catálogo de repuestos y ajustes del sistema."
      />

      <div className="p-6 space-y-6 max-w-3xl">

        {/* ── Cargar Dataset ── */}
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-lg">
              📦
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Catálogo de repuestos</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Cargá o actualizá el catálogo de piezas disponible para el autocompletado del portal.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400 space-y-1">
            <p><span className="text-zinc-300 font-semibold">Formatos aceptados:</span> JSON o CSV</p>
            <p><span className="text-zinc-300 font-semibold">Columnas esperadas:</span> codigo, descripcion, marca, modelo, categoria (opcional: año_desde, año_hasta)</p>
            <p><span className="text-zinc-300 font-semibold">Modo:</span> Upsert por código — los registros existentes se actualizan, los nuevos se insertan.</p>
          </div>

          {uploadResult && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              uploadResult.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}>
              {uploadResult.ok
                ? `✅ Dataset cargado exitosamente — ${uploadResult.inserted?.toLocaleString()} registros procesados.`
                : `❌ Error: ${uploadResult.error}`}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
              className="bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-md shadow-orange-500/20"
            >
              {uploading ? 'Procesando…' : '📂 Cargar Dataset (Catálogo)'}
            </Button>
            {uploading && (
              <span className="text-xs text-zinc-500">Esto puede tardar unos segundos…</span>
            )}
          </div>
        </section>

        {/* ── Info de entorno ── */}
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-3">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Entorno</h2>
          <div className="grid gap-2 text-sm">
            <InfoRow label="Rol actual" value="Administrador" />
            <InfoRow label="Base de datos" value="Supabase PostgreSQL" />
            <InfoRow label="Autenticación" value="Supabase Auth (JWT)" />
            <InfoRow label="Almacenamiento" value="Supabase Storage · order-images / quote-images" />
          </div>
        </section>

      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2.5">
      <span className="text-zinc-500 font-medium">{label}</span>
      <span className="text-zinc-300 font-semibold text-xs font-mono">{value}</span>
    </div>
  );
}
