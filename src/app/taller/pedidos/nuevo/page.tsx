'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/FormFields';
import { ModelAutocomplete } from '@/components/ui/ModelAutocomplete';
import { PartsAutocomplete } from '@/components/ui/PartsAutocomplete';
import { VEHICLE_BRANDS, QUALITY_OPTIONS } from '@/lib/constants';
import { NewOrderItemForm } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => ({
  value: String(CURRENT_YEAR - i),
  label: String(CURRENT_YEAR - i),
}));

const BRAND_OPTIONS = VEHICLE_BRANDS.map(b => ({ value: b, label: b }));

type FormErrors = Partial<Record<string, string>>;

const emptyItem = (): NewOrderItemForm => ({
  tempId: generateId(),
  partName: '',
  codigoCatalogo: null,
  description: '',
  quality: 'media',
  quantity: 1,
  images: [],
  imagePreviews: [],
});

export default function NuevoPedidoPage() {
  const { user } = useAuth();
  const { createOrder } = useDataStore();
  const router = useRouter();

  // ── Estado del vehículo ───────────────────────────────────
  const [vehicleBrand, setVehicleBrand] = useState('');
  // Modelo: sólo el valor confirmado desde el dropdown (ModelAutocomplete gestiona el texto internamente)
  const [vehicleModelSelected, setVehicleModelSelected] = useState('');
  // Versión: opcional, sólo el valor confirmado desde el dropdown
  const [vehicleVersionSelected, setVehicleVersionSelected] = useState('');

  const [vehicleYear, setVehicleYear] = useState(String(CURRENT_YEAR));
  const [internalOrderNumber, setInternalOrderNumber] = useState('');
  const [items, setItems] = useState<NewOrderItemForm[]>([emptyItem()]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  // ── Consultas Supabase para autocompletados ───────────────

  const fetchModels = useCallback(async (text: string): Promise<string[]> => {
    try {
      const sb = getSupabaseClient();
      const { data, error } = await (sb as any)
        .from('catalogo_repuestos')
        .select('marca')
        .ilike('marca', `%${text}%`)
        .limit(50); // traemos más para deduplicar
      if (error || !data) return [];
      const unique = [...new Set((data as { marca: string }[]).map(r => r.marca).filter(Boolean))];
      return unique.slice(0, 10);
    } catch {
      return [];
    }
  }, []);

  const fetchVersions = useCallback(
    async (text: string): Promise<string[]> => {
      if (!vehicleModelSelected) return [];
      try {
        const sb = getSupabaseClient();
        const { data, error } = await (sb as any)
          .from('catalogo_repuestos')
          .select('anios')
          .eq('marca', vehicleModelSelected)
          .ilike('anios', `%${text}%`)
          .limit(50);
        if (error || !data) return [];
        const unique = [...new Set((data as { anios: string }[]).map(r => r.anios).filter(Boolean))];
        return unique.slice(0, 10);
      } catch {
        return [];
      }
    },
    [vehicleModelSelected]
  );

  // ── Validación ────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: FormErrors = {};

    if (!vehicleBrand) errs.vehicleBrand = 'Seleccioná la marca';

    // Modelo: requiere selección válida del dropdown
    if (!vehicleModelSelected) {
      errs.vehicleModel = 'Ingresá y elegí el modelo de la lista';
    }

    if (!vehicleYear) errs.vehicleYear = 'Seleccioná el año';

    items.forEach((item) => {
      const hasPartName = !!item.partName.trim();
      const hasCode = !!item.codigoCatalogo;
      const hasNote = !!item.description.trim();

      // Texto libre sin selección del catálogo
      if (hasPartName && !hasCode) {
        errs[`item_${item.tempId}_partName`] =
          'Elegí un repuesto del catálogo o dejá el campo vacío y describilo en la nota';
      }
      // Sin repuesto Y sin nota
      if (!hasPartName && !hasNote) {
        errs[`item_${item.tempId}_partName`] =
          'Describí el repuesto o agregá una nota';
      }
      if (item.quantity < 1) errs[`item_${item.tempId}_quantity`] = 'Mínimo 1';
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setShowSlowMessage(false);
    const timer = setTimeout(() => setShowSlowMessage(true), 10_000);

    try {
      const newOrder = await createOrder({
        workshopId: user?.workshopId || '',
        vehicleBrand,
        vehicleModel: vehicleModelSelected,
        vehicleVersion: vehicleVersionSelected,
        vehicleYear: parseInt(vehicleYear),
        internalOrderNumber: internalOrderNumber.trim() || undefined,
        items: items.map(i => ({
          partName: i.partName,
          codigoCatalogo: i.codigoCatalogo ?? null,
          description: i.description,
          quality: i.quality,
          quantity: i.quantity,
          images: i.images,
        })),
      });

      setSuccess(true);
      setTimeout(() => {
        router.push(`/taller/pedidos/${newOrder.id}`);
      }, 1000);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert('Hubo un error al crear el pedido: ' + msg);
      setLoading(false);
    } finally {
      clearTimeout(timer);
    }
  };

  // ── Items helpers ─────────────────────────────────────────

  const updateItem = (tempId: string, field: keyof NewOrderItemForm, value: any) => {
    setItems(prev =>
      prev.map(i => (i.tempId === tempId ? { ...i, [field]: value } : i))
    );
    setErrors(prev => {
      const next = { ...prev };
      delete next[`item_${tempId}_${String(field)}`];
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (tempId: string) => {
    if (items.length > 1) {
      setItems(prev => prev.filter(i => i.tempId !== tempId));
    }
  };

  const handleImageUpload = (tempId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setItems(prev =>
      prev.map(item => {
        if (item.tempId !== tempId) return item;
        const newImages = [...item.images, ...files].slice(0, 2);
        const newPreviews = newImages.map(file => URL.createObjectURL(file));
        return { ...item, images: newImages, imagePreviews: newPreviews };
      })
    );
  };

  const removeImage = (tempId: string, idxToRemove: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.tempId !== tempId) return item;
        const newImages = item.images.filter((_, i) => i !== idxToRemove);
        const newPreviews = item.imagePreviews.filter((_, i) => i !== idxToRemove);
        return { ...item, images: newImages, imagePreviews: newPreviews };
      })
    );
  };

  // ── Render ────────────────────────────────────────────────

  if (success) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-white mb-2">¡Pedido enviado!</h2>
          <p className="text-sm text-slate-400">Redirigiendo al detalle...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <TopBar
        title="Nuevo pedido"
        subtitle="Completá los datos del repuesto que necesitás"
        action={
          <Button variant="ghost" type="button" onClick={() => router.back()}>
            ← Volver
          </Button>
        }
      />

      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">

            {/* ── Sección 1: Datos del vehículo ── */}
            <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 space-y-5 shadow-sm">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                <span className="text-xl">🚗</span> Datos del vehículo
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Marca — lista desplegable, sin cambios */}
                <Select
                  label="Marca"
                  required
                  value={vehicleBrand}
                  onChange={(e) => setVehicleBrand(e.target.value)}
                  options={BRAND_OPTIONS}
                  placeholder="Seleccioná marca..."
                  error={errors.vehicleBrand}
                />

                {/* Modelo — autocompletado obligatorio desde catalogo_repuestos.marca */}
                <ModelAutocomplete
                  label="Modelo"
                  required
                  value={vehicleModelSelected}
                  onSelect={(val) => {
                    setVehicleModelSelected(val);
                    // Al cambiar modelo, limpiar la versión elegida
                    setVehicleVersionSelected('');
                    setErrors(prev => ({ ...prev, vehicleModel: undefined }));
                  }}
                  onClear={() => {
                    setVehicleModelSelected('');
                    setVehicleVersionSelected('');
                  }}
                  fetchOptions={fetchModels}
                  placeholder="Ej: FIESTA, RANGER, CORSA..."
                  noResultsMessage="No encontrado. Podés describirlo en el campo de notas del repuesto."
                  error={errors.vehicleModel}
                />

                {/* Versión — autocompletado opcional, habilitado solo tras elegir modelo */}
                <ModelAutocomplete
                  label="Versión (opcional)"
                  value={vehicleVersionSelected}
                  onSelect={(val) => {
                    setVehicleVersionSelected(val);
                  }}
                  onClear={() => {
                    setVehicleVersionSelected('');
                  }}
                  disabled={!vehicleModelSelected}
                  fetchOptions={fetchVersions}
                  placeholder="Ej: 02/07, XL, Sport..."
                  noResultsMessage="No encontrado. Podés dejarlo vacío."
                />

                {/* Año — lista desplegable, sin cambios */}
                <Select
                  label="Año"
                  required
                  value={vehicleYear}
                  onChange={(e) => setVehicleYear(e.target.value)}
                  options={YEARS}
                  error={errors.vehicleYear}
                />

                {/* Número de orden interno — texto libre, sin cambios */}
                <div className="space-y-1.5 w-full">
                  <label className="block text-xs font-semibold text-zinc-300 tracking-wide">
                    N° Orden Interna (Opcional)
                  </label>
                  <input
                    type="text"
                    value={internalOrderNumber}
                    onChange={(e) => setInternalOrderNumber(e.target.value)}
                    placeholder="Secreto, interno para tu taller"
                    autoComplete="off"
                    className="w-full px-4 py-2.5 bg-zinc-950/50 border border-zinc-800 hover:border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-200 shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* ── Sección 2+: Repuestos ── */}
            <div className="space-y-6">
              {items.map((item, idx) => (
                <div
                  key={item.tempId}
                  className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 shadow-sm relative group transition-all"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4 mb-5">
                    <h2 className="text-sm font-bold text-sky-400 bg-sky-400/10 px-3 py-1.5 rounded-lg flex items-center gap-2 tracking-tight uppercase">
                      Repuesto {idx + 1}
                    </h2>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.tempId)}
                        className="text-xs font-semibold text-rose-500 hover:text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 transition-colors"
                      >
                        🗑️ Eliminar
                      </button>
                    )}
                  </div>

                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-3">
                        {/* Repuesto — autocompletado con selección obligatoria del catálogo */}
                        <PartsAutocomplete
                          label="Pieza / Repuesto solicitado"
                          required
                          value={item.partName}
                          onChange={(val) => updateItem(item.tempId, 'partName', val)}
                          onSelect={(codigo, descripcion) => {
                            updateItem(item.tempId, 'partName', descripcion);
                            updateItem(item.tempId, 'codigoCatalogo', codigo);
                          }}
                          vehicleModel={vehicleModelSelected}
                          error={errors[`item_${item.tempId}_partName`]}
                        />
                      </div>
                      <div className="md:col-span-1">
                        <div className="space-y-1.5 w-full">
                          <label className="block text-xs font-semibold text-zinc-300 tracking-wide">
                            Cantidad <span className="text-orange-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(item.tempId, 'quantity', parseInt(e.target.value) || 1)
                            }
                            className={[
                              'w-full px-4 py-2.5 bg-zinc-950/50 border rounded-xl text-sm text-zinc-100',
                              'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-200 shadow-sm',
                              errors[`item_${item.tempId}_quantity`]
                                ? 'border-rose-500/50'
                                : 'border-zinc-800 hover:border-zinc-700',
                            ].join(' ')}
                          />
                          {errors[`item_${item.tempId}_quantity`] && (
                            <p className="text-xs font-medium text-rose-500">
                              {errors[`item_${item.tempId}_quantity`]}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Nota / descripción — opcional, pero usada como fallback cuando no hay repuesto del catálogo */}
                    <Textarea
                      label="Notas (opcional)"
                      value={item.description}
                      onChange={(e) => {
                        updateItem(item.tempId, 'description', e.target.value);
                        // Si el usuario agrega una nota, limpiar error de partName vacío
                        if (e.target.value.trim()) {
                          setErrors(prev => {
                            const next = { ...prev };
                            delete next[`item_${item.tempId}_partName`];
                            return next;
                          });
                        }
                      }}
                      placeholder="Si no encontrás el repuesto en el catálogo, describilo aquí. También podés agregar especificaciones de calidad, estado, etc."
                      rows={2}
                    />

                    {/* Calidad deseada */}
                    <div>
                      <p className="block text-sm font-semibold text-zinc-300 mb-2">
                        Calidad deseada <span className="text-xs text-rose-500 font-bold">*</span>
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {QUALITY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateItem(item.tempId, 'quality', opt.value)}
                            className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                              item.quality === opt.value
                                ? 'border-sky-500 bg-sky-500/10 shadow-inner'
                                : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-600'
                            }`}
                          >
                            <div className="text-sm font-bold text-zinc-200">{opt.label}</div>
                            <div className="text-[10px] font-medium text-zinc-500 mt-0.5">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fotos opcionales */}
                    <div className="pt-2">
                      <p className="block text-sm font-semibold text-zinc-300 mb-2">
                        Fotos de referencia (opcional - máx. 2)
                      </p>
                      <div className="flex items-center gap-4 flex-wrap">
                        {item.imagePreviews.map((preview, i) => (
                          <div key={i} className="relative group/img">
                            <img
                              src={preview}
                              alt="preview"
                              className="w-24 h-24 object-cover rounded-xl border border-zinc-700/50"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(item.tempId, i)}
                              className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {item.images.length < 2 && (
                          <label className="w-24 h-24 flex flex-col items-center justify-center border-2 border-dashed border-zinc-700/50 rounded-xl bg-zinc-950/30 hover:bg-zinc-900/50 hover:border-sky-500/30 transition-all cursor-pointer">
                            <span className="text-2xl text-zinc-500 mb-1">📷</span>
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Subir foto</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              autoComplete="off"
                              onChange={(e) => handleImageUpload(item.tempId, e)}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center border-t border-zinc-800/80 pt-6">
              <Button type="button" variant="secondary" onClick={addItem}>
                ➕ Agregar otro repuesto
              </Button>
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 justify-end pt-6">
              {loading && showSlowMessage && (
                <span className="text-xs text-zinc-400 mr-auto">
                  Procesando... esto puede tardar unos segundos.
                </span>
              )}
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                Cancelar
              </Button>
              <Button type="submit" loading={loading} size="lg">
                🚀 Enviar pedido
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
