'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { StatusBadge, QualityBadge } from '@/components/ui/Badge';
import { OrderStatusTracker } from '@/components/orders/OrderStatusTracker';
import { formatDate, formatCurrency, canWorkshopRespond } from '@/lib/utils';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TallerPedidoDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const { user } = useAuth();
  const { getOrderById, approveQuote, rejectQuote, approveQuotePartial } = useDataStore();
  const router = useRouter();

  const [rejecting, setRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [partialMode, setPartialMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const order = getOrderById(id);

  if (!order) {
    return (
      <>
        <TopBar title="Pedido no encontrado" />
        <div className="p-6">
          <EmptyState
            icon="🔍"
            title="Pedido no encontrado"
            description="El pedido que buscás no existe o fue eliminado."
            action={<Button onClick={() => router.push('/taller/pedidos')}>← Volver a pedidos</Button>}
          />
        </div>
      </>
    );
  }

  const quote = order.quote;
  const canRespond = canWorkshopRespond(order.status);

  const handleApprove = async () => {
    setLoading(true);
    await approveQuote(order.id, user!.id, user!.name);
    setLoading(false);
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) return;
    setLoading(true);
    await rejectQuote(order.id, user!.id, user!.name, rejectComment);
    setLoading(false);
    setRejecting(false);
  };

  const handlePartialApprove = async () => {
    const allIds = quote?.items.map(i => i.id) ?? [];
    const rejectedIds = allIds.filter(id => !selectedItems.has(id));
    setLoading(true);
    await approveQuotePartial(order.id, user!.id, user!.name, Array.from(selectedItems), rejectedIds);
    setLoading(false);
    setPartialMode(false);
  };

  const quoteItems = quote?.items ?? [];
  const subtotalOriginal = quoteItems.reduce((acc, item) => acc + item.price, 0);

  const montoRechazado = partialMode
    ? quoteItems.filter(i => !selectedItems.has(i.id)).reduce((s, i) => s + i.price, 0)
    : order.status === 'aprobado_parcial' || order.status === 'cerrado'
      ? quoteItems.filter(i => i.approved === false).reduce((s, i) => s + i.price, 0)
      : order.status === 'rechazado'
        ? subtotalOriginal
        : 0;

  const totalAPagar = partialMode
    ? quoteItems.filter(i => selectedItems.has(i.id)).reduce((s, i) => s + i.price, 0)
    : order.status === 'aprobado'
      ? subtotalOriginal
      : order.status === 'aprobado_parcial' || order.status === 'cerrado'
        ? quoteItems.filter(i => i.approved === true).reduce((s, i) => s + i.price, 0)
        : order.status === 'rechazado'
          ? 0
          : subtotalOriginal;

  const mostrarDesglose =
    partialMode ||
    montoRechazado > 0 ||
    order.status === 'aprobado_parcial' ||
    (order.status === 'cerrado' && quoteItems.some(i => i.approved === false));

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  return (
    <>
      <TopBar
        title={`Pedido ${order.workshopOrderNumber ? `PED-${String(order.workshopOrderNumber).padStart(4, '0')}` : order.id.split('-')[0].toUpperCase()}`}
        subtitle={`${order.vehicleBrand} ${order.vehicleModel} ${order.vehicleYear}`}
        action={
          <Button variant="ghost" onClick={() => router.push('/taller/pedidos')}>
            ← Mis pedidos
          </Button>
        }
      />

      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        {/* Header info */}
        <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <StatusBadge status={order.status} />
                <span className="text-[11px] text-zinc-100 font-mono font-bold bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-700/50 uppercase tracking-widest">
                  {order.workshopOrderNumber ? `PED-${String(order.workshopOrderNumber).padStart(4, '0')}` : order.id.split('-')[0].toUpperCase()}
                </span>
              </div>
              <h2 className="text-2xl font-extrabold text-zinc-100 tracking-tight">Vehículo y Pedido</h2>
              <p className="text-sm font-medium text-zinc-400 mt-2">
                🚗 {order.vehicleBrand} {order.vehicleModel} <span className="text-sky-400 font-bold">{order.vehicleVersion}</span> — {order.vehicleYear}
              </p>
              {order.internalOrderNumber && (
                <p className="text-xs font-semibold text-sky-400 mt-3 inline-flex items-center bg-sky-400/10 px-2.5 py-1 rounded-md border border-sky-400/20 shadow-sm">
                  🏷️ Ref. Interna: {order.internalOrderNumber}
                </p>
              )}
            </div>
            <div className="text-left sm:text-right text-xs font-medium text-zinc-500 space-y-1">
              <div>Creado: {formatDate(order.createdAt)}</div>
              <div>Actualizado: {formatDate(order.updatedAt)}</div>
            </div>
          </div>
        </div>

        {/* COMPARATIVA Y COTIZACIÓN */}
        {quote && (
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-lg shadow-black/20">
            <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/50 pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                    <span className="text-xl drop-shadow-sm">💰</span> Cotización del Vendedor
                  </h3>
                  {quote.sentAt && (
                    <p className="text-xs font-medium text-zinc-500 mt-1">Recibida el {formatDate(quote.sentAt)}</p>
                  )}
                </div>
                {canRespond && !partialMode && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPartialMode(true);
                        setSelectedItems(new Set(quote.items.map(i => i.id)));
                      }}
                    >
                      ⚡ Aprobación parcial
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRejecting(true)}>
                      ❌ Rechazar Todo
                    </Button>
                    <Button size="sm" variant="success" onClick={handleApprove} loading={loading}>
                      ✅ Aprobar Todo
                    </Button>
                  </div>
                )}
                {partialMode && (
                  <div className="flex items-center gap-3">
                    <Button size="sm" variant="ghost" onClick={() => setPartialMode(false)}>
                      Cancelar parcial
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={handlePartialApprove}
                      loading={loading}
                      disabled={selectedItems.size === 0}
                    >
                      ✅ Seleccionar ({selectedItems.size})
                    </Button>
                  </div>
                )}
              </div>

              {partialMode && (
                <div className="mt-4 text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-3 shadow-inner">
                  💡 Seleccioná usando las cajas de la derecha qué ítems querés aprobar. Los no seleccionados se rechazarán.
                </div>
              )}

              {quote.notes && (
                <div className="mt-4 bg-amber-500/5 rounded-xl p-4 border border-amber-500/20 shadow-inner">
                  <p className="text-sm font-medium text-amber-200/80 tracking-wide">📝 <span className="font-bold text-amber-300">Nota del vendedor:</span> {quote.notes}</p>
                </div>
              )}
            </div>

            {/* Comparativa: Ítems pedidos vs Ítems cotizados */}
            <div className="divide-y divide-zinc-800/80 bg-zinc-950/30">
              {order.items.map((orderItem, idx) => {
                const quoteItem = quote.items.find(qi => qi.orderItemId === orderItem.id);
                
                // Si estamos en Approval Parcial
                const isSelected = partialMode && quoteItem ? selectedItems.has(quoteItem.id) : null;
                const wasApproved = !partialMode && quoteItem?.approved === true;
                const wasRejected = !partialMode && quoteItem?.approved === false;

                return (
                  <div 
                    key={orderItem.id} 
                    className={`p-6 transition-all relative ${partialMode && quoteItem ? 'cursor-pointer hover:bg-zinc-900/30' : ''} ${partialMode && !isSelected && quoteItem ? 'opacity-40 grayscale-[40%]' : ''}`}
                    onClick={() => {
                      if (partialMode && quoteItem) {
                        toggleItem(quoteItem.id);
                      }
                    }}
                  >
                    {/* Header Item */}
                    <div className="flex items-center gap-3 mb-4">
                       <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded uppercase tracking-widest">
                         Repuesto {idx + 1}
                       </span>
                    </div>

                    {/* Grid Comparativa */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 relative items-start">
                      {/* Línea divisoria en desktop */}
                      <div className="hidden md:block absolute top-0 bottom-0 left-1/2 w-px bg-zinc-800/50 -translate-x-1/2 rounded-full" />

                      {/* Izqda: Lo que pidió el taller */}
                      <div className="space-y-4 min-w-0">
                        <div className="inline-block px-3 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 uppercase">
                          Lo que pediste
                        </div>
                        
                        <div>
                          <h4 className="font-bold text-zinc-200 text-lg">{orderItem.partName}</h4>
                          <p className="text-sm text-zinc-400 mt-1">{orderItem.description || 'Sin descripción adicional'}</p>
                          <div className="flex items-center gap-2 mt-3">
                            <QualityBadge quality={orderItem.quality} />
                            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-bold">Cant: {orderItem.quantity}</span>
                          </div>
                        </div>

                        {orderItem.images && orderItem.images.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {orderItem.images.map(img => (
                              <div key={img.id} className="relative group">
                                <img src={img.url} alt="Referencia" className="w-24 h-20 object-cover rounded-xl border border-zinc-700/50 opacity-80" />
                                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-[2px]">
                                   <span className="text-[10px] font-bold text-white uppercase tracking-widest leading-none">Tu foto</span>
                                   <span className="text-xl">🔍</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Dcha: Lo que cotizó el vendedor */}
                      <div className="space-y-4 pt-4 md:pt-0 border-t md:border-t-0 border-zinc-800/50 relative min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-block px-3 py-1 rounded-md bg-orange-500/10 border border-orange-500/20 text-xs font-bold text-orange-400 uppercase">
                            Cotización del vendedor
                          </div>
                          {!quoteItem && (
                            <span className="inline-flex items-center rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-400">
                              Sin stock
                            </span>
                          )}
                        </div>

                        {quoteItem ? (
                          <div className="flex flex-col h-full justify-between">
                            <div className="space-y-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-bold text-white text-xl">{formatCurrency(quoteItem.price)}</h4>
                                  <div className="flex gap-2 flex-wrap mt-2">
                                    <QualityBadge quality={quoteItem.quality} />
                                  </div>
                                </div>

                                <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-1.5 flex-shrink-0 self-start sm:self-auto">
                                  {partialMode && (
                                    <div
                                      className={`order-first sm:order-none w-7 h-7 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors shadow-sm ${
                                        isSelected
                                          ? 'border-emerald-500 bg-emerald-500/20'
                                          : 'border-zinc-600 bg-zinc-900 border-dashed'
                                      }`}
                                    >
                                      {isSelected && <span className="text-emerald-400 text-sm font-bold">✓</span>}
                                    </div>
                                  )}
                                  {!partialMode && wasApproved && (
                                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 inline-block px-2 py-1 rounded-md border border-emerald-500/20 shadow-sm whitespace-nowrap">
                                      ✅ Aprobado
                                    </span>
                                  )}
                                  {!partialMode && wasRejected && (
                                    <span className="text-xs font-bold text-rose-400 bg-rose-500/10 inline-block px-2 py-1 rounded-md border border-rose-500/20 shadow-sm whitespace-nowrap">
                                      ❌ Rechazado
                                    </span>
                                  )}
                                  {!partialMode && quoteItem.approved === null && order.status === 'cotizado' && (
                                    <span className="text-xs font-bold text-amber-400 bg-amber-500/10 inline-block px-2 py-1 rounded-md border border-amber-500/20 shadow-sm whitespace-nowrap">
                                      ⏳ Pendiente
                                    </span>
                                  )}
                                </div>
                              </div>

                              {quoteItem.description && (
                                <p className="text-sm text-zinc-400 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/50 shadow-inner">
                                  {quoteItem.description}
                                </p>
                              )}
                              
                              {quoteItem.imageUrl && (
                                <div className="mt-3 relative group w-fit">
                                  <img src={quoteItem.imageUrl} alt="Repuesto cotizado" className="h-32 w-auto min-w-[120px] object-cover rounded-xl border border-orange-500/30 shadow-md shadow-orange-500/5" />
                                  <div className="absolute inset-0 bg-orange-500/30 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-[2px]">
                                     <span className="text-[10px] font-bold text-white uppercase tracking-widest leading-none drop-shadow-md">Foto proveedor</span>
                                     <span className="text-xl drop-shadow-md">👀</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-zinc-700/60 bg-zinc-950/40 p-4 text-left">
                            <p className="text-sm font-medium leading-relaxed text-zinc-400">
                              El vendedor no cotizó este repuesto (sin stock o no disponible).
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total Footer */}
            <div className="p-6 border-t border-zinc-800/80 bg-zinc-950/60 shadow-inner flex flex-col gap-3">
              {mostrarDesglose ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      Subtotal original
                    </span>
                    <span className="text-sm font-bold text-zinc-200">
                      {formatCurrency(subtotalOriginal)}
                    </span>
                  </div>
                  {montoRechazado > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">
                        Ítems rechazados
                      </span>
                      <span className="text-sm font-bold text-rose-400">
                        −{formatCurrency(montoRechazado)}
                      </span>
                    </div>
                  )}
                  <div className="w-full h-px bg-zinc-800/50 my-1" />
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-bold text-emerald-500 uppercase tracking-widest">
                      Total a pagar
                    </span>
                    <span className="text-3xl font-black text-white tracking-tight">
                      {formatCurrency(totalAPagar)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
                    {order.status === 'cotizado' ? 'Total cotizado' : 'Total a pagar'}
                  </span>
                  <span className="text-3xl font-black text-white tracking-tight">
                    {formatCurrency(order.status === 'cotizado' ? subtotalOriginal : totalAPagar)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sin cotización todavía - Mostrar los ítems que se pidieron */}
        {!quote && (
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-lg shadow-black/20">
            <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/50">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                <span className="text-xl drop-shadow-sm">📋</span> Repuestos Solicitados
              </h3>
            </div>
            
            <div className="divide-y divide-zinc-800/80 bg-zinc-950/30">
              {order.items.map((orderItem, idx) => (
                <div key={orderItem.id} className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                     <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded uppercase tracking-widest">
                       Repuesto {idx + 1}
                     </span>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <h4 className="font-bold text-zinc-200 text-xl">{orderItem.partName}</h4>
                      <p className="text-sm text-zinc-400 mt-2">{orderItem.description || 'Sin descripción adicional'}</p>
                      <div className="flex items-center gap-2 mt-4">
                        <QualityBadge quality={orderItem.quality} />
                        <span className="text-xs bg-zinc-800 text-zinc-400 px-3 py-1 rounded-md font-bold">Cantidad: {orderItem.quantity}</span>
                      </div>
                    </div>
                    
                    {orderItem.images && orderItem.images.length > 0 && (
                      <div className="flex gap-3 flex-wrap">
                        {orderItem.images.map(img => (
                          <img key={img.id} src={img.url} alt="Referencia" className="w-32 h-24 object-cover rounded-xl border border-zinc-700/50" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-zinc-950/60 border-t border-zinc-800/80">
              {order.status === 'pendiente' && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 text-center shadow-sm">
                  <div className="text-3xl mb-3 drop-shadow-sm opacity-90">⏳</div>
                  <h3 className="text-base font-bold text-amber-100 mb-1 tracking-tight">Esperando cotización</h3>
                  <p className="text-xs font-medium text-amber-400/80 max-w-sm mx-auto">
                    El vendedor pronto revisará los ítems solicitados de tu {order.vehicleBrand} {order.vehicleModel}.
                  </p>
                </div>
              )}

              {order.status === 'en_revision' && (
                <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-6 text-center shadow-sm">
                  <div className="text-3xl mb-3 drop-shadow-sm opacity-90">🔍</div>
                  <h3 className="text-base font-bold text-sky-100 mb-1 tracking-tight">En revisión</h3>
                  <p className="text-xs font-medium text-sky-400/80 max-w-sm mx-auto">
                    El vendedor está consultando con sus proveedores o revisando su stock.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Historial */}
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-zinc-100 mb-6 flex items-center gap-2 tracking-tight">
            📜 Estado del pedido
          </h3>
          <OrderStatusTracker status={order.status} events={order.events} />
        </div>
        
         {/* Reject dialog */}
         {rejecting && (
          <div className="bg-zinc-900 border border-rose-500/30 rounded-2xl p-6 shadow-sm mt-4">
            <h3 className="font-bold text-zinc-100 mb-3 flex items-center gap-2 tracking-tight">
              ❌ Rechazar cotización completa
            </h3>
            <textarea
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              placeholder="Indicá el motivo del rechazo total..."
              rows={3}
              className="w-full px-4 py-3 bg-zinc-950/50 border border-zinc-800 rounded-xl text-sm font-medium text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500/40 resize-y min-h-[80px]"
            />
            <div className="flex items-center gap-3 mt-4 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancelar</Button>
              <Button variant="danger" size="sm" onClick={handleReject} loading={loading} disabled={!rejectComment.trim()}>
                Confirmar rechazo
              </Button>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
