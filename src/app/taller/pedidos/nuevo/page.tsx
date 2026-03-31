'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/FormFields';
import { VEHICLE_BRANDS, QUALITY_OPTIONS } from '@/lib/constants';
import { OrderQuality } from '@/lib/types';
import { MOCK_WORKSHOPS } from '@/lib/mock-data';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => ({
  value: String(CURRENT_YEAR - i),
  label: String(CURRENT_YEAR - i),
}));

const BRAND_OPTIONS = VEHICLE_BRANDS.map(b => ({ value: b, label: b }));

type FormErrors = Partial<Record<string, string>>;

export default function NuevoPedidoPage() {
  const { user } = useAuth();
  const { createOrder } = useDataStore();
  const router = useRouter();

  const [form, setForm] = useState({
    vehicleBrand: '',
    vehicleModel: '',
    vehicleYear: String(CURRENT_YEAR),
    partName: '',
    description: '',
    quality: 'media' as OrderQuality,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.vehicleBrand) errs.vehicleBrand = 'Seleccioná la marca';
    if (!form.vehicleModel.trim()) errs.vehicleModel = 'Ingresá el modelo';
    if (!form.vehicleYear) errs.vehicleYear = 'Seleccioná el año';
    if (!form.partName.trim()) errs.partName = 'Ingresá la pieza/repuesto';
    if (!form.description.trim()) errs.description = 'Describí el pedido';
    if (form.description.trim().length < 20) errs.description = 'Describí un poco más el pedido (mínimo 20 caracteres)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    await new Promise(r => setTimeout(r, 500)); // simulate async

    const workshop = MOCK_WORKSHOPS.find(w => w.id === user?.workshopId);
    const newOrder = await createOrder({
      workshopId: user?.workshopId || '',
      workshop,
      vehicleBrand: form.vehicleBrand,
      vehicleModel: form.vehicleModel,
      vehicleYear: parseInt(form.vehicleYear),
      partName: form.partName,
      description: form.description,
      quality: form.quality,
    });

    setSuccess(true);
    await new Promise(r => setTimeout(r, 1000));
    router.push(`/taller/pedidos/${newOrder.id}`);
  };

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
          <Button variant="ghost" onClick={() => router.back()}>
            ← Volver
          </Button>
        }
      />

      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Vehículo */}
            <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 space-y-5 shadow-sm">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                <span className="text-xl">🚗</span> Datos del vehículo
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Select
                  label="Marca"
                  required
                  value={form.vehicleBrand}
                  onChange={set('vehicleBrand')}
                  options={BRAND_OPTIONS}
                  placeholder="Seleccioná marca..."
                  error={errors.vehicleBrand}
                />
                <Input
                  label="Modelo"
                  required
                  value={form.vehicleModel}
                  onChange={set('vehicleModel')}
                  placeholder="Ej: Ranger XL 4x4"
                  error={errors.vehicleModel}
                />
              </div>
              <div className="w-full md:w-1/3">
                <Select
                  label="Año"
                  required
                  value={form.vehicleYear}
                  onChange={set('vehicleYear')}
                  options={YEARS}
                  error={errors.vehicleYear}
                />
              </div>
            </div>

            {/* Repuesto */}
            <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 space-y-5 shadow-sm">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                <span className="text-xl">🔧</span> Repuesto solicitado
              </h2>
              <Input
                label="Pieza / Repuesto"
                required
                value={form.partName}
                onChange={set('partName')}
                placeholder="Ej: Paragolpe delantero, Capot, Óptica derecha..."
                error={errors.partName}
              />
              <Textarea
                label="Descripción adicional"
                required
                value={form.description}
                onChange={set('description')}
                placeholder="Describí el problema, el estado del vehículo, observaciones del cliente, etc."
                rows={4}
                error={errors.description}
                hint="Cuanto más detallado, mejor podremos cotizarte. Mín. 20 caracteres."
              />
            </div>

            {/* Calidad */}
            <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 space-y-5 shadow-sm">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                <span className="text-xl">⭐</span> Calidad deseada
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {QUALITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, quality: opt.value }))}
                    className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                      form.quality === opt.value
                        ? 'border-orange-500 bg-orange-500/10 shadow-inner'
                        : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-sm font-bold text-zinc-200 mb-1">{opt.label}</div>
                    <div className="text-xs font-medium text-zinc-500">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Imágenes (placeholder) */}
            <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2 mb-4 tracking-tight">
                <span className="text-xl">📷</span> Fotos de referencia
                <span className="text-xs font-medium text-zinc-500 ml-2">(opcional)</span>
              </h2>
              <div className="border-2 border-dashed border-zinc-700/50 rounded-xl p-10 text-center bg-zinc-950/30 hover:bg-zinc-900/50 hover:border-orange-500/30 transition-all duration-200">
                <div className="text-4xl mb-3 opacity-60 drop-shadow-sm">📷</div>
                <p className="text-sm font-bold text-zinc-300">
                  La carga de imágenes estará disponible próximamente
                </p>
                <p className="text-xs font-medium text-zinc-600 mt-2 max-w-sm mx-auto">
                  Preparado para integración con Supabase Storage (Drag & Drop múltiple)
                </p>
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 justify-end pt-2">
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
