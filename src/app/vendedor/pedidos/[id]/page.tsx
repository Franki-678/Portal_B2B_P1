'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/FormFields';
import { StatusBadge, QualityBadge } from '@/components/ui/Badge';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { formatDate, formatCurrency, canVendorQuote, generateId } from '@/lib/utils';
import { QUALITY_OPTIONS } from '@/lib/constants';
import { OrderQuality, QuoteItem } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface QuoteItemDraft extends Omit<QuoteItem, 'id' | 'quoteId' | 'approved'> {
  tempId: string;
}

const emptyItem = (): QuoteItemDraft => ({
  tempId: generateId(),
  partName: '',
  description: '',
  quality: 'media',
  manufacturer: '',
  supplier: '',
  price: 0,
  imageUrl: '',
  notes: '',
});

export default function VendedorPedidoDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const { user } = useAuth();
  const { getOrderById, setOrderInReview, submitQuote, closeOrder } = useDataStore();
  const router = useRouter();

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [items, setItems] = useState<QuoteItemDraft[]>([emptyItem()]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const order = getOrderById(id);

  if (!order) {
    return (
      <>
        <TopBar title="Pedido no encontrado" />
        <div className="p-6">
          <EmptyState
            icon="🔍"
            title="Pedido no encontrado"
            description="El pedido que buscás no existe."
            action={<Button onClick={() => router.push('/vendedor/pedidos')}>← Volver a pedidos</Button>}
          />
        </div>
      </>
    );
  }

  const canQuote = canVendorQuote(order.status);
  const hasQuote = !!order.quote;

  const handleSetInReview = async () => {
    setActionLoading(true);
    await setOrderInReview(order.id, user!.id, user!.name, 'Pedido tomado para revisión.');
    setActionLoading(false);
  };

  const handleCloseOrder = async () => {
    if (!confirm('¿Confirmar cierre del pedido?')) return;
    setActionLoading(true);
    await closeOrder(order.id, user!.id, user!.name, 'Pedido cerrado por el vendedor.');
    setActionLoading(false);
  };

  const updateItem = (tempId: string, field: keyof QuoteItemDraft, value: string | number | OrderQuality) => {
    setItems(prev => prev.map(item =>
      item.tempId === tempId ? { ...item, [field]: value } : item
    ));
    setErrors(prev => {
      const next = { ...prev };
      delete next[`${tempId}-${field}`];
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (tempId: string) => setItems(prev => prev.filter(i => i.tempId !== tempId));

  const validateQuote = (): boolean => {
    const errs: Record<string, string> = {};
    items.forEach(item => {
      if (!item.partName.trim()) errs[`${item.tempId}-partName`] = 'Requerido';
      if (!item.description.trim()) errs[`${item.tempId}-description`] = 'Requerido';
      if (!item.price || item.price <= 0) errs[`${item.tempId}-price`] = 'Precio inválido';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateQuote()) return;
    setLoading(true);

    await new Promise(r => setTimeout(r, 600));

    await submitQuote(order.id, {
      notes: quoteNotes,
      vendorId: user!.id,
      vendorName: user!.name,
      items: items.map(({ tempId, ...item }) => ({
        ...item,
        approved: null,
      })),
    });

    setLoading(false);
    setShowQuoteForm(false);
  };

  return (
    <>
      <TopBar
        title={order.partName}
        subtitle={`${order.vehicleBrand} ${order.vehicleModel} ${order.vehicleYear} · ${order.workshop?.name}`}
        action={
          <Button variant="ghost" onClick={() => router.push('/vendedor/pedidos')}>
            ← Pedidos
          </Button>
        }
      />

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <StatusBadge status={order.status} />
                <QualityBadge quality={order.quality} />
                <span className="text-xs text-slate-500 font-mono">{order.id.toUpperCase()}</span>
              </div>
              <h2 className="text-xl font-bold text-white">{order.partName}</h2>
              <p className="text-sm text-slate-400 mt-1">
                🚗 {order.vehicleBrand} {order.vehicleModel} — Año {order.vehicleYear}
              </p>
              <p className="text-sm text-orange-400 mt-1">🏭 {order.workshop?.name}</p>
            </div>
            <div className="flex flex-col items-end gap-2 text-xs text-slate-500">
              <div>Creado: {formatDate(order.createdAt)}</div>
              <div>Actualizado: {formatDate(order.updatedAt)}</div>
            </div>
          </div>

          {order.description && (
            <div className="bg-[#0f1117] rounded-lg p-4 border border-white/5">
              <p className="text-sm text-slate-300 leading-relaxed">{order.description}</p>
            </div>
          )}

          {order.images.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-2">📷 Fotos del taller</p>
              <div className="flex gap-3 flex-wrap">
                {order.images.map(img => (
                  <img key={img.id} src={img.url} alt="Referencia" className="w-32 h-24 object-cover rounded-lg border border-white/8" />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 pt-4 border-t border-white/8 flex items-center gap-2 flex-wrap">
            {order.status === 'pendiente' && (
              <Button size="sm" variant="secondary" onClick={handleSetInReview} loading={actionLoading}>
                🔍 Marcar en revisión
              </Button>
            )}
            {canQuote && !hasQuote && (
              <Button size="sm" onClick={() => setShowQuoteForm(!showQuoteForm)}>
                💰 {showQuoteForm ? 'Cerrar formulario' : 'Cargar cotización'}
              </Button>
            )}
            {(order.status === 'aprobado' || order.status === 'aprobado_parcial') && (
              <Button size="sm" variant="secondary" onClick={handleCloseOrder} loading={actionLoading}>
                🔒 Cerrar pedido
              </Button>
            )}
            {hasQuote && canQuote && (
              <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 rounded-lg">
                Ya existe una cotización enviada
              </div>
            )}
          </div>
        </div>

        {/* FORMULARIO DE COTIZACIÓN */}
        {showQuoteForm && (
          <form onSubmit={handleSubmitQuote} className="bg-[#1A1D27] border border-orange-500/20 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-white/8 bg-orange-500/5">
              <h3 className="font-semibold text-white flex items-center gap-2">
                💰 Nueva cotización
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Agregá los ítems que querés cotizar para este pedido</p>
            </div>

            <div className="p-5 space-y-6">
              <Textarea
                label="Observaciones generales"
                value={quoteNotes}
                onChange={e => setQuoteNotes(e.target.value)}
                placeholder="Notas generales sobre la cotización, disponibilidad, plazos de entrega, etc."
                rows={2}
              />

              {/* Items */}
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={item.tempId} className="bg-[#0f1117] border border-white/8 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-orange-400">Ítem {idx + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.tempId)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          🗑️ Eliminar
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Nombre del repuesto"
                        required
                        value={item.partName}
                        onChange={e => updateItem(item.tempId, 'partName', e.target.value)}
                        placeholder="Ej: Paragolpe trasero original"
                        error={errors[`${item.tempId}-partName`]}
                      />
                      <Input
                        label="Precio (ARS)"
                        required
                        type="number"
                        min="0"
                        value={item.price || ''}
                        onChange={e => updateItem(item.tempId, 'price', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        error={errors[`${item.tempId}-price`]}
                      />
                    </div>

                    <Textarea
                      label="Descripción"
                      required
                      value={item.description}
                      onChange={e => updateItem(item.tempId, 'description', e.target.value)}
                      placeholder="Descripción del repuesto, compatibilidades, estado, etc."
                      rows={2}
                      error={errors[`${item.tempId}-description`]}
                    />

                    <div className="grid grid-cols-3 gap-3">
                      <Select
                        label="Calidad"
                        value={item.quality}
                        onChange={e => updateItem(item.tempId, 'quality', e.target.value as OrderQuality)}
                        options={QUALITY_OPTIONS.map(q => ({ value: q.value, label: q.label }))}
                      />
                      <Input
                        label="Fabricante"
                        value={item.manufacturer || ''}
                        onChange={e => updateItem(item.tempId, 'manufacturer', e.target.value)}
                        placeholder="Ej: Toyota, TecMax..."
                      />
                      <Input
                        label="Proveedor"
                        value={item.supplier || ''}
                        onChange={e => updateItem(item.tempId, 'supplier', e.target.value)}
                        placeholder="Ej: Dist. Norte..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="URL imagen de referencia"
                        value={item.imageUrl || ''}
                        onChange={e => updateItem(item.tempId, 'imageUrl', e.target.value)}
                        placeholder="https://..."
                        hint="Link a foto del repuesto"
                      />
                      <Input
                        label="Observaciones"
                        value={item.notes || ''}
                        onChange={e => updateItem(item.tempId, 'notes', e.target.value)}
                        placeholder="Tiempo de entrega, garantía, etc."
                      />
                    </div>

                    {item.price > 0 && (
                      <div className="text-right text-sm font-bold text-orange-400">
                        {formatCurrency(item.price)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                ➕ Agregar otro ítem
              </Button>

              {/* Total */}
              <div className="bg-[#0f1117] rounded-xl p-4 border border-white/8 flex items-center justify-between">
                <span className="text-sm text-slate-400">Total cotización</span>
                <span className="text-xl font-bold text-white">
                  {formatCurrency(items.reduce((s, i) => s + (i.price || 0), 0))}
                </span>
              </div>
            </div>

            <div className="p-5 border-t border-white/8 flex items-center justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setShowQuoteForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={loading} size="lg">
                📤 Enviar cotización al taller
              </Button>
            </div>
          </form>
        )}

        {/* COTIZACIÓN EXISTENTE */}
        {order.quote && (
          <div className="bg-[#1A1D27] border border-white/8 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-white/8">
              <h3 className="font-semibold text-white flex items-center gap-2">
                💰 Cotización enviada
              </h3>
              {order.quote.sentAt && (
                <p className="text-xs text-slate-500 mt-0.5">Enviada el {formatDate(order.quote.sentAt)}</p>
              )}
              {order.quote.notes && (
                <div className="mt-3 bg-[#0f1117] rounded-lg p-3 border border-white/5">
                  <p className="text-xs text-slate-400">📝 {order.quote.notes}</p>
                </div>
              )}
            </div>
            <div className="divide-y divide-white/5">
              {order.quote.items.map(item => (
                <div key={item.id} className="p-5 flex gap-4">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.partName} className="w-20 h-16 object-cover rounded-lg border border-white/8 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-medium text-white text-sm">{item.partName}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-white">{formatCurrency(item.price)}</div>
                        <QualityBadge quality={item.quality} />
                        {item.approved === true && <div className="text-xs text-green-400 mt-1">✅ Aprobado</div>}
                        {item.approved === false && <div className="text-xs text-red-400 mt-1">❌ Rechazado</div>}
                        {item.approved === null && order.status === 'cotizado' && <div className="text-xs text-yellow-400 mt-1">⏳ Pendiente</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      {item.manufacturer && <span>🏭 {item.manufacturer}</span>}
                      {item.supplier && <span>📦 {item.supplier}</span>}
                      {item.notes && <span>💬 {item.notes}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-white/8 bg-[#0f1117]/50 flex items-center justify-between">
              <span className="text-sm text-slate-400">{order.quote.items.length} ítem(s)</span>
              <span className="text-lg font-bold text-white">
                {formatCurrency(order.quote.items.reduce((s, i) => s + i.price, 0))}
              </span>
            </div>
          </div>
        )}

        {/* Historial */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-xl p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            📜 Historial del pedido
          </h3>
          <OrderTimeline events={order.events} />
        </div>
      </div>
    </>
  );
}
