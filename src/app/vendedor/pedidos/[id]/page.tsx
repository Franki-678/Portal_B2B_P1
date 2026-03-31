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

      <div className="p-6 space-y-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 mb-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <StatusBadge status={order.status} />
                <QualityBadge quality={order.quality} />
                <span className="text-[11px] text-zinc-500 font-mono font-medium bg-zinc-800/50 px-2 py-0.5 rounded-md border border-zinc-700/50">{order.id.split('-')[0].toUpperCase()}</span>
              </div>
              <h2 className="text-2xl font-extrabold text-zinc-100 tracking-tight">{order.partName}</h2>
              <p className="text-sm font-medium text-zinc-400 mt-1">
                🚗 {order.vehicleBrand} {order.vehicleModel} — <span className="text-zinc-500">Año {order.vehicleYear}</span>
              </p>
              <p className="text-sm font-semibold text-orange-500 mt-2 bg-orange-500/10 inline-flex items-center px-2 py-1 rounded-md border border-orange-500/20">🏭 {order.workshop?.name}</p>
            </div>
            <div className="flex flex-col sm:items-end gap-1 text-xs font-medium text-zinc-500">
              <div>Creado: {formatDate(order.createdAt)}</div>
              <div>Actualizado: {formatDate(order.updatedAt)}</div>
            </div>
          </div>

          {order.description && (
            <div className="bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/80 shadow-inner">
              <p className="text-sm font-medium text-zinc-300 leading-relaxed max-w-2xl">{order.description}</p>
            </div>
          )}

          {order.images.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">📷 Fotos del taller</p>
              <div className="flex gap-4 flex-wrap">
                {order.images.map(img => (
                  <img key={img.id} src={img.url} alt="Referencia" className="w-32 h-24 object-cover rounded-xl border border-zinc-700/50 shadow-sm" />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 flex items-center gap-3 flex-wrap">
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
          <form onSubmit={handleSubmitQuote} className="bg-zinc-900 border border-orange-500/30 rounded-3xl overflow-hidden shadow-orange-500/5 shadow-xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500 opacity-50" />
            <div className="p-6 border-b border-zinc-800/80 bg-orange-500/5">
              <h3 className="text-lg font-bold text-orange-100 flex items-center gap-2 tracking-tight">
                <span className="text-xl">💰</span> Nueva cotización
              </h3>
              <p className="text-sm font-medium text-orange-400/80 mt-1">Agregá los ítems y precios para cotizarle al taller</p>
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
              <div className="space-y-5">
                {items.map((item, idx) => (
                  <div key={item.tempId} className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-6 space-y-4 shadow-sm relative group">
                    <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3">
                      <span className="text-sm font-bold text-orange-500 bg-orange-500/10 px-3 py-1 rounded-md uppercase tracking-widest">Ítem {idx + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.tempId)}
                          className="text-xs font-semibold text-rose-500 hover:text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-md hover:bg-rose-500/20 transition-colors"
                        >
                          🗑️ Eliminar
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <div className="text-right text-lg font-black text-orange-400 tracking-tight pt-2">
                        {formatCurrency(item.price)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-center md:justify-start pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                  ➕ Agregar otro ítem
                </Button>
              </div>

              {/* Total */}
              <div className="bg-orange-500/10 rounded-2xl p-5 border border-orange-500/20 flex items-center justify-between shadow-inner mt-4">
                <span className="text-sm font-bold text-orange-400 uppercase tracking-widest">Total cotización</span>
                <span className="text-2xl font-black text-white tracking-tight">
                  {formatCurrency(items.reduce((s, i) => s + (i.price || 0), 0))}
                </span>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800/80 bg-zinc-950/50 flex flex-col md:flex-row items-center justify-end gap-4">
              <Button type="button" variant="ghost" onClick={() => setShowQuoteForm(false)} className="w-full md:w-auto">
                Cancelar
              </Button>
              <Button type="submit" loading={loading} size="lg" className="w-full md:w-auto">
                📤 Enviar cotización al taller
              </Button>
            </div>
          </form>
        )}

        {/* COTIZACIÓN EXISTENTE */}
        {order.quote && (
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-lg shadow-black/20">
            <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/50">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                <span className="text-xl drop-shadow-sm">💰</span> Cotización enviada
              </h3>
              {order.quote.sentAt && (
                <p className="text-xs font-medium text-zinc-500 mt-1">Enviada el {formatDate(order.quote.sentAt)}</p>
              )}
              {order.quote.notes && (
                <div className="mt-4 bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/80 shadow-inner">
                  <p className="text-sm font-medium text-zinc-400">📝 {order.quote.notes}</p>
                </div>
              )}
            </div>
            <div className="divide-y divide-zinc-800/80">
              {order.quote.items.map(item => (
                <div key={item.id} className="p-6 flex flex-col md:flex-row gap-5 hover:bg-zinc-800/30 transition-colors">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.partName} className="w-full md:w-24 md:h-20 object-cover rounded-xl border border-zinc-700/50 shadow-sm flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="font-bold text-zinc-100 text-base">{item.partName}</h4>
                        <p className="text-sm font-medium text-zinc-400">{item.description}</p>
                      </div>
                      <div className="text-left md:text-right flex-shrink-0 space-y-2">
                        <div className="text-xl font-extrabold text-zinc-100 tracking-tight">{formatCurrency(item.price)}</div>
                        <QualityBadge quality={item.quality} />
                        {item.approved === true && <div className="text-xs font-bold text-emerald-400 bg-emerald-500/10 inline-block px-2 py-1 rounded-md border border-emerald-500/20 shadow-sm">✅ Aprobado</div>}
                        {item.approved === false && <div className="text-xs font-bold text-rose-400 bg-rose-500/10 inline-block px-2 py-1 rounded-md border border-rose-500/20 shadow-sm">❌ Rechazado</div>}
                        {item.approved === null && order.status === 'cotizado' && <div className="text-xs font-bold text-amber-400 bg-amber-500/10 inline-block px-2 py-1 rounded-md border border-amber-500/20 shadow-sm">⏳ Pendiente</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-semibold text-zinc-500">
                      {item.manufacturer && <span className="bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-700/50">🏭 {item.manufacturer}</span>}
                      {item.supplier && <span className="bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-700/50">📦 {item.supplier}</span>}
                      {item.notes && <span className="bg-zinc-950/30 px-2 py-1 rounded-md border border-zinc-800/50 italic text-zinc-400">💬 {item.notes}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between shadow-inner">
              <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{order.quote.items.length} ítem(s)</span>
              <span className="text-2xl font-black text-white tracking-tight">
                {formatCurrency(order.quote.items.reduce((s, i) => s + i.price, 0))}
              </span>
            </div>
          </div>
        )}

        {/* Historial */}
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-zinc-100 mb-6 flex items-center gap-2 tracking-tight">
            📜 Historial del pedido
          </h3>
          <OrderTimeline events={order.events} />
        </div>
      </div>
    </>
  );
}
