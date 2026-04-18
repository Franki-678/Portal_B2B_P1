'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import { getSupabaseClient } from '@/lib/supabase/client';

// ─── Tipos de resultado de upload ────────────────────────────

interface UploadResult {
  ok: boolean;
  inserted?: number;
  error?: string;
}

export default function AdminConfiguracionPage() {
  const { user } = useAuth();
  const router = useRouter();

  // ── Catálogo de repuestos ─────────────────────────────────
  const partsFileRef = useRef<HTMLInputElement>(null);
  const [uploadingParts, setUploadingParts] = useState(false);
  const [partsResult, setPartsResult] = useState<UploadResult | null>(null);

  // ── Catálogo de vehículos ─────────────────────────────────
  const vehiclesFileRef = useRef<HTMLInputElement>(null);
  const [uploadingVehicles, setUploadingVehicles] = useState(false);
  const [vehiclesResult, setVehiclesResult] = useState<UploadResult | null>(null);

  // ── Contacto de la empresa ────────────────────────────────
  const [whatsapp, setWhatsapp] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactMsg, setContactMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const sb = getSupabaseClient();
    void (sb as any)
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()
      .then(({ data }: any) => {
        if (data?.phone) setWhatsapp(data.phone);
      });
  }, [user?.id]);

  // Sólo admin puede usar esta página
  if (user && user.role !== 'admin') {
    router.replace('/vendedor/configuracion');
    return null;
  }

  // ── Handler: Catálogo de repuestos (CSV / JSON plano) ─────

  const handlePartsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingParts(true);
    setPartsResult(null);

    try {
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
        setPartsResult({ ok: false, error: 'Formato no soportado. Usá .json o .csv' });
        return;
      }

      if (rows.length === 0) {
        setPartsResult({ ok: false, error: 'El archivo está vacío o no tiene datos válidos.' });
        return;
      }

      const sb = getSupabaseClient();
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
      setPartsResult({ ok: true, inserted: total });
    } catch (err) {
      setPartsResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Error desconocido al procesar el archivo.',
      });
    } finally {
      setUploadingParts(false);
      if (partsFileRef.current) partsFileRef.current.value = '';
    }
  };

  // ── Handler: Catálogo de vehículos (JSON anidado) ─────────
  // Formato esperado: { "Audi": { "A3": ["A3 02/04", "A3 05/08"], ... }, ... }

  const handleVehiclesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setVehiclesResult({ ok: false, error: 'Solo se acepta formato .json para vehículos.' });
      return;
    }

    setUploadingVehicles(true);
    setVehiclesResult(null);

    try {
      const text = await file.text();
      const nested: Record<string, Record<string, string[]>> = JSON.parse(text);

      // Validar estructura mínima
      if (typeof nested !== 'object' || Array.isArray(nested)) {
        throw new Error('El JSON debe ser un objeto: { "Marca": { "Modelo": ["version"] } }');
      }

      // Aplanar a filas (marca, modelo, version)
      const rows: { marca: string; modelo: string; version: string }[] = [];
      for (const [marca, modelos] of Object.entries(nested)) {
        if (typeof modelos !== 'object' || Array.isArray(modelos)) continue;
        for (const [modelo, versiones] of Object.entries(modelos)) {
          if (!Array.isArray(versiones)) continue;
          for (const version of versiones) {
            if (typeof version === 'string' && version.trim()) {
              rows.push({ marca: marca.trim(), modelo: modelo.trim(), version: version.trim() });
            }
          }
        }
      }

      if (rows.length === 0) {
        throw new Error('No se encontraron registros válidos en el JSON.');
      }

      // Upsert en lotes de 500 con conflicto en (marca, modelo, version)
      const sb = getSupabaseClient();
      const BATCH = 500;
      let total = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await (sb as any)
          .from('vehiculos')
          .upsert(batch, { onConflict: 'marca,modelo,version' });
        if (error) throw new Error(error.message);
        total += batch.length;
      }
      setVehiclesResult({ ok: true, inserted: total });
    } catch (err) {
      setVehiclesResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Error desconocido al procesar el archivo.',
      });
    } finally {
      setUploadingVehicles(false);
      if (vehiclesFileRef.current) vehiclesFileRef.current.value = '';
    }
  };

  // ── Handler: Contacto ─────────────────────────────────────

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSavingContact(true);
    setContactMsg(null);
    const sb = getSupabaseClient();
    const digits = whatsapp.replace(/\D/g, '');
    const { error } = await (sb as any)
      .from('profiles')
      .update({ phone: digits.length >= 8 ? digits : null })
      .eq('id', user.id);
    setSavingContact(false);
    if (error) setContactMsg({ type: 'err', text: error.message });
    else setContactMsg({ type: 'ok', text: 'Número guardado correctamente.' });
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      <TopBar
        title="Configuración"
        subtitle="Catálogos de datos y ajustes del sistema."
      />

      <div className="p-6 space-y-6 max-w-3xl">

        {/* ── Catálogo de vehículos (JSON anidado) ── */}
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-lg">
              🚗
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Catálogo de vehículos</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Alimenta los selectores de Marca → Modelo → Versión en el formulario de nuevo pedido.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400 space-y-1.5">
            <p>
              <span className="text-zinc-300 font-semibold">Formato:</span>{' '}
              JSON anidado — <span className="font-mono text-orange-400/80">{'{ "Audi": { "A3": ["A3 02/04", "A3 05/08"] } }'}</span>
            </p>
            <p>
              <span className="text-zinc-300 font-semibold">Modo:</span>{' '}
              Upsert por (marca, modelo, versión) — actualiza existentes e inserta nuevos. No borra los anteriores.
            </p>
            <p>
              <span className="text-zinc-300 font-semibold">Nota:</span>{' '}
              Podés cargar múltiples archivos para diferentes marcas; los datos se acumulan.
            </p>
          </div>

          {vehiclesResult && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              vehiclesResult.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}>
              {vehiclesResult.ok
                ? `✅ Catálogo de vehículos cargado — ${vehiclesResult.inserted?.toLocaleString()} versiones procesadas.`
                : `❌ Error: ${vehiclesResult.error}`}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              ref={vehiclesFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleVehiclesUpload}
            />
            <Button
              onClick={() => vehiclesFileRef.current?.click()}
              loading={uploadingVehicles}
              className="bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-md shadow-orange-500/20"
            >
              {uploadingVehicles ? 'Procesando…' : '🚗 Cargar catálogo de vehículos (.json)'}
            </Button>
            {uploadingVehicles && (
              <span className="text-xs text-zinc-500">Procesando versiones…</span>
            )}
          </div>
        </section>

        {/* ── Catálogo de repuestos (CSV / JSON plano) ── */}
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-lg">
              📦
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Catálogo de repuestos</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Piezas disponibles para el autocompletado en el formulario de pedido.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400 space-y-1">
            <p><span className="text-zinc-300 font-semibold">Formatos aceptados:</span> JSON (array) o CSV</p>
            <p><span className="text-zinc-300 font-semibold">Columnas esperadas:</span> codigo, descripcion, marca, modelo, categoria (opcional: año_desde, año_hasta)</p>
            <p><span className="text-zinc-300 font-semibold">Modo:</span> Upsert por código — los registros existentes se actualizan, los nuevos se insertan.</p>
          </div>

          {partsResult && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              partsResult.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}>
              {partsResult.ok
                ? `✅ Dataset cargado exitosamente — ${partsResult.inserted?.toLocaleString()} registros procesados.`
                : `❌ Error: ${partsResult.error}`}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              ref={partsFileRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={handlePartsUpload}
            />
            <Button
              onClick={() => partsFileRef.current?.click()}
              loading={uploadingParts}
              className="bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-md shadow-orange-500/20"
            >
              {uploadingParts ? 'Procesando…' : '📂 Cargar catálogo de repuestos'}
            </Button>
            {uploadingParts && (
              <span className="text-xs text-zinc-500">Esto puede tardar unos segundos…</span>
            )}
          </div>
        </section>

        {/* ── Contacto de la empresa ── */}
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-lg">
              📲
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Contacto de la empresa</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Número de WhatsApp visible para los talleres al contactar con soporte.
              </p>
            </div>
          </div>
          <form onSubmit={handleSaveContact} className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="WhatsApp / Teléfono de la empresa"
                type="tel"
                inputMode="tel"
                value={whatsapp}
                onChange={e => setWhatsapp(e.target.value)}
                hint="Con código de área, sin espacios ni guiones"
              />
            </div>
            <Button
              type="submit"
              loading={savingContact}
              className="mb-0.5 bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-md shadow-orange-500/20"
            >
              Guardar
            </Button>
          </form>
          {contactMsg && (
            <p className={`text-sm font-medium ${contactMsg.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {contactMsg.text}
            </p>
          )}
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
