'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/FormFields';
import { StatusBadge, QualityBadge } from '@/components/ui/Badge';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { formatDate, formatCurrency, canVendorQuote } from '@/lib/utils';
import { QUALITY_OPTIONS } from '@/lib/constants';
import { OrderQuality, QuoteItem } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface QuoteItemDraft extends Omit<QuoteItem, 'id' | 'quoteId' | 'approved'> {
  tempId: string;
  isAvailable: boolean;
  imageFile?: File;
  imagePreview?: string;
}

export default function VendedorPedidoDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const { user } = useAuth();
  const { getOrderById, setOrderInReview, submitQuote, closeOrder } = useDataStore();
  const router = useRouter();

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [items, setItems] = useState<QuoteItemDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const order = getOrderById(id);

  // Inicializar los ítems cuando se abre o detecta el pedido
  useEffect(() => {
    if (order && items.length === 0) {
      setItems(
        order.items.map(i => ({
          tempId: i.id,
          orderItemId: i.id,
          partName: i.partName,
          description: '', 
          quality: i.quality,
          manufacturer: '',
          supplier: '',
          price: 0,
          imageUrl: '',
          notes: '',
          isAvailable: true,
        }))
      );
    }
  }, [order, items.length]);

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

  const updateItem = (tempId: string, field: keyof QuoteItemDraft, value: any) => {
    setItems(prev => prev.map(item =>
      item.tempId === tempId ? { ...item, [field]: value } : item
    ));
    setErrors(prev => {
      const next = { ...prev };
      delete next[`${tempId}-${field as string}`];
      return next;
    });
  };

  const handleImageUpload = (tempId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setItems(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;
      return {
        ...item,
        imageFile: file,
        imagePreview: URL.createObjectURL(file),
      };
    }));
  };

  const removeImage = (tempId: string) => {
    setItems(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;
      return { ...item, imageFile: undefined, imagePreview: undefined };
    }));
  };

  const validateQuote = (): boolean => {
    const errs: Record<string, string> = {};
    items.filter(i => i.isAvailable).forEach(item => {
      if (!item.price || item.price <= 0) errs[`${item.tempId}-price`] = 'Ingresá un precio válido';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateQuote()) return;
    setLoading(true);

    try {
      const finalItems = items
        .filter(i => i.isAvailable)
        .map(({ tempId, isAvailable, imagePreview, ...rest }) => ({
          ...rest,
          approved: null,
        }));
        
      if (finalItems.length === 0) {
        alert("Debes cotizar al menos un ítem.");
        setLoading(false);
        return;
      }

      await submitQuote(order.id, {
        notes: quoteNotes,
        vendorId: user!.id,
        vendorName: user!.name,
        items: finalItems,
      });

      setShowQuoteForm(false);
    } catch (err: any) {
      console.error(err);
      alert('Hubo un error al enviar la cotización: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TopBar
        title={`Pedido ${order.id.split('-')[0].toUpperCase()}`}
        subtitle={`${order.vehicleBrand} ${order.vehicleModel} ${order.vehicleYear} · ${order.workshop?.name}`}
        action={
          <Button variant="ghost" onClick={() => router.push('/vendedor/pedidos')}>
            ← Pedidos
          </Button>
        }
      />

      <div className="p-6 space-y-8 max-w-4xl mx-auto">
        {/* Header Detalle Pedido */}
        <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 mb-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <StatusBadge status={order.status} />
                <span className="text-[11px] text-zinc-500 font-mono font-medium bg-zinc-800/50 px-2 py-0.5 rounded-md border border-zinc-700/50">{order.id.split('-')[0].toUpperCase()}</span>
              </div>
              <h2 className="text-2xl font-extrabold text-zinc-100 tracking-tight">Pedido del Taller</h2>
              <p className="text-sm font-medium text-zinc-400 mt-1">
                🚗 {order.vehicleBrand} {order.vehicleModel} <span className="text-sky-400 font-bold">{order.vehicleVersion}</span> — {order.vehicleYear}
              </p>
              <p className="text-sm font-semibold text-orange-500 mt-2 bg-orange-500/10 inline-flex items-center px-2 py-1 rounded-md border border-orange-500/20">🏭 {order.workshop?.name}</p>
            </div>
            <div className="flex flex-col sm:items-end gap-1 text-xs font-medium text-zinc-500">
              <div>Creado: {formatDate(order.createdAt)}</div>
              <div>Actualizado: {formatDate(order.updatedAt)}</div>
            </div>
          </div>

          {/* Listado de ítems pedidos por el taller */}
          <div className="mt-8 space-y-4">
            <h3 className="text-sm font-bold tracking-widest text-zinc-500 uppercase">Ítems Solicitados</h3>
            <div className="divide-y divide-zinc-800 border border-zinc-800/80 rounded-2xl bg-zinc-950/30 overflow-hidden">
              {order.items.map((it, idx) => (
                 <div key={it.id} className="p-5 flex flex-col md:flex-row gap-5">
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-3 mb-1">
                       <span className="text-xs font-bold bg-sky-500/10 text-sky-400 px-2 rounded">#{idx+1}</span>
                       <h4 className="font-bold text-zinc-100 text-lg">{it.partName}</h4>
                     </div>
                     <div className="flex items-center gap-2 mt-2">
                       <QualityBadge quality={it.quality} />
                       <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-bold">Cant: {it.quantity}</span>
                     </div>
                     {it.description && <p className="text-sm text-zinc-400 mt-2">{it.description}</p>}
                   </div>
                   
                   {it.images && it.images.length > 0 && (
                     <div className="flex-shrink-0 flex gap-2 overflow-x-auto pb-2 md:pb-0">
                       {it.images.map(img => (
                         <img key={img.id} src={img.url} alt="Referencia" className="w-24 h-20 object-cover rounded-xl border border-zinc-700/50 shadow-sm" />
                       ))}
                     </div>
                   )}
                 </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 pt-5 flex items-center gap-3 flex-wrap">
            {order.status === 'pendiente' && (
              <Button size="sm" variant="secondary" onClick={handleSetInReview} loading={actionLoading}>
                🔍 Marcar en revisión
              </Button>
            )}
            {canQuote && !hasQuote && (
              <Button size="sm" onClick={() => setShowQuoteForm(!showQuoteForm)}>
                💰 {showQuoteForm ? 'Cerrar formulario' : 'Armar cotización'}
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
              <p className="text-sm font-medium text-orange-400/80 mt-1">
                Completá los datos de los ítems para cotizarle al taller
              </p>
            </div>

            <div className="p-5 space-y-6">
              <Textarea
                label="Observaciones generales"
                value={quoteNotes}
                onChange={e => setQuoteNotes(e.target.value)}
                placeholder="Notas generales, tiempo estimado de preparación, etc."
                rows={2}
              />

              <div className="space-y-5">
                {items.map((item, idx) => (
                  <div key={item.tempId} className={`border border-zinc-800/80 rounded-2xl p-6 transition-all ${!item.isAvailable ? 'bg-zinc-950/80 opacity-60 grayscale-[30%]' : 'bg-zinc-950/40 shadow-sm relative group'}`}>
                    <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3 mb-4">
                      <div>
                        <span className="text-sm font-bold text-orange-500 bg-orange-500/10 px-3 py-1 rounded-md uppercase tracking-widest">
                          Ítem {idx + 1}
                        </span>
                        <span className="text-zinc-300 font-bold ml-3">{item.partName}</span>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-orange-500 focus:ring-orange-500/20"
                          checked={!item.isAvailable}
                          onChange={(e) => updateItem(item.tempId, 'isAvailable', !e.target.checked)}
                        />
                        <span className="text-zinc-400">Sin stock</span>
                      </label>
                    </div>

                    {item.isAvailable && (
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          <Select
                            label="Calidad Ofrecida"
                            value={item.quality}
                            onChange={e => updateItem(item.tempId, 'quality', e.target.value as OrderQuality)}
                            options={QUALITY_OPTIONS.map(q => ({ value: q.value, label: q.label }))}
                          />
                        </div>

                        <Textarea
                          label="Descripción adicional (tu repuesto)"
                          value={item.description}
                          onChange={e => updateItem(item.tempId, 'description', e.target.value)}
                          placeholder="Compatibilidades, estado..."
                          rows={2}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Fabricante / Marca"
                            value={item.manufacturer || ''}
                            onChange={e => updateItem(item.tempId, 'manufacturer', e.target.value)}
                            placeholder="Ej: Toyota, XYZ..."
                          />
                          <Input
                            label="Proveedor"
                            value={item.supplier || ''}
                            onChange={e => updateItem(item.tempId, 'supplier', e.target.value)}
                            placeholder="Ej: Dist. Norte..."
                          />
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-5">
                           <div className="flex-1">
                             <Input
                               label="URL imagen alternativa (opcional)"
                               value={item.imageUrl || ''}
                               onChange={e => updateItem(item.tempId, 'imageUrl', e.target.value)}
                               placeholder="https://..."
                               disabled={!!item.imageFile}
                               hint="O subí un archivo real a la derecha"
                              />
                           </div>
                           <div className="w-full sm:w-auto">
                              <p className="block text-sm font-semibold text-zinc-300 mb-2">Foto real</p>
                              {item.imagePreview ? (
                                <div className="relative group/img inline-block">
                                  <img src={item.imagePreview} alt="preview" className="w-20 h-20 object-cover rounded-xl border border-zinc-700/50" />
                                  <button
                                    type="button"
                                    onClick={() => removeImage(item.tempId)}
                                    className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg"
                                  >✕</button>
                                </div>
                              ) : (
                                <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-zinc-700/50 rounded-xl bg-zinc-950/30 hover:bg-zinc-900/50 hover:border-orange-500/30 transition-all cursor-pointer">
                                  <span className="text-xl mb-1">📷</span>
                                  <span className="text-[9px] uppercase font-bold text-zinc-500">Subir</span>
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(item.tempId, e)} />
                                </label>
                              )}
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="bg-orange-500/10 rounded-2xl p-5 border border-orange-500/20 flex items-center justify-between shadow-inner mt-4">
                <span className="text-sm font-bold text-orange-400 uppercase tracking-widest">Total cotización</span>
                <span className="text-2xl font-black text-white tracking-tight">
                  {formatCurrency(items.filter(i => i.isAvailable).reduce((s, i) => s + (i.price || 0), 0))}
                </span>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800/80 bg-zinc-950/50 flex flex-col md:flex-row items-center justify-end gap-4">
              <Button type="button" variant="ghost" onClick={() => setShowQuoteForm(false)} className="w-full md:w-auto">
                Cancelar
              </Button>
              <Button type="submit" loading={loading} size="lg" className="w-full md:w-auto">
                📤 Enviar cotización
              </Button>
            </div>
          </form>
        )}

        {/* COTIZACIÓN ENVÍADA EXISTENTE */}
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
                  </div>
                </div>
              ))}
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
