'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { StatusBadge, QualityBadge } from '@/components/ui/Badge';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { formatDate, formatCurrency, canWorkshopRespond } from '@/lib/utils';
import { QUALITY_LABELS } from '@/lib/constants';

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
        title={order.partName}
        subtitle={`${order.vehicleBrand} ${order.vehicleModel} ${order.vehicleYear}`}
        action={
          <Button variant="ghost" onClick={() => router.push('/taller/pedidos')}>
            ← Mis pedidos
          </Button>
        }
      />

      <div className="p-6 space-y-8 max-w-4xl mx-auto">
        {/* Header info */}
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
            </div>
            <div className="text-left sm:text-right text-xs font-medium text-zinc-500 space-y-1">
              <div>Creado: {formatDate(order.createdAt)}</div>
              <div>Actualizado: {formatDate(order.updatedAt)}</div>
            </div>
          </div>

          {order.description && (
            <div className="bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/80 shadow-inner">
              <p className="text-sm font-medium text-zinc-300 leading-relaxed max-w-2xl">{order.description}</p>
            </div>
          )}

          {/* Images */}
          {order.images.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">📷 Fotos de referencia</p>
              <div className="flex gap-4 flex-wrap">
                {order.images.map(img => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt="Referencia"
                    className="w-32 h-24 object-cover rounded-xl border border-zinc-700/50 shadow-sm"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COTIZACIÓN */}
        {quote && (
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-lg shadow-black/20">
            <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                    <span className="text-xl drop-shadow-sm">💰</span> Cotización recibida
                  </h3>
                  {quote.sentAt && (
                    <p className="text-xs font-medium text-zinc-500 mt-1">Enviada el {formatDate(quote.sentAt)}</p>
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
                      ❌ Rechazar
                    </Button>
                    <Button size="sm" variant="success" onClick={handleApprove} loading={loading}>
                      ✅ Aprobar todo
                    </Button>
                  </div>
                )}
                {partialMode && (
                  <div className="flex items-center gap-3">
                    <Button size="sm" variant="ghost" onClick={() => setPartialMode(false)}>
                      Cancelar
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
                  💡 Seleccioná los ítems que querés aprobar. Los no seleccionados serán rechazados automáticamente.
                </div>
              )}

              {quote.notes && (
                <div className="mt-4 bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/80 shadow-inner">
                  <p className="text-sm font-medium text-zinc-400">📝 {quote.notes}</p>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="divide-y divide-zinc-800/80">
              {quote.items.map(item => {
                const isSelected = partialMode ? selectedItems.has(item.id) : null;
                const wasApproved = !partialMode && item.approved === true;
                const wasRejected = !partialMode && item.approved === false;

                return (
                  <div
                    key={item.id}
                    onClick={() => partialMode && toggleItem(item.id)}
                    className={`p-6 flex flex-col sm:flex-row gap-5 transition-all outline-none ${
                      partialMode ? 'cursor-pointer hover:bg-zinc-800/30' : ''
                    } ${
                      partialMode && isSelected ? 'bg-emerald-500/5' : ''
                    } ${
                      partialMode && !isSelected ? 'opacity-40 grayscale-[50%]' : ''
                    } ${
                      wasApproved ? 'bg-emerald-500/5' : ''
                    } ${
                      wasRejected ? 'bg-rose-500/5 opacity-50 grayscale' : ''
                    }`}
                  >
                    {/* Checkbox / Estado */}
                    <div className="flex-shrink-0 mt-1">
                      {partialMode ? (
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-700 bg-zinc-900'
                        }`}>
                          {isSelected && <span className="text-emerald-400 text-sm font-bold">✓</span>}
                        </div>
                      ) : wasApproved ? (
                        <span className="text-emerald-400 text-xl drop-shadow-sm">✅</span>
                      ) : wasRejected ? (
                        <span className="text-rose-400 text-xl drop-shadow-sm">❌</span>
                      ) : null}
                    </div>

                    <div className="flex-1 w-full flex flex-col sm:flex-row gap-5">
                      {/* Image */}
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.partName}
                          className="w-full sm:w-24 sm:h-20 object-cover rounded-xl border border-zinc-700/50 shadow-sm flex-shrink-0"
                        />
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div>
                            <h4 className="font-bold text-zinc-100 text-base">{item.partName}</h4>
                            <p className="text-sm font-medium text-zinc-400 mt-1">{item.description}</p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-zinc-500 pt-1">
                            {item.manufacturer && <span className="bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-700/50">🏭 {item.manufacturer}</span>}
                            {item.supplier && <span className="bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-700/50">📦 {item.supplier}</span>}
                          </div>
                          {item.notes && (
                            <p className="text-xs font-medium text-zinc-400 italic mt-2 bg-zinc-950/30 p-2 rounded-lg border border-zinc-800/50 shadow-inner">📝 {item.notes}</p>
                          )}
                        </div>
                        <div className="text-left sm:text-right flex-shrink-0 space-y-2">
                          <div className="text-xl font-extrabold text-zinc-100 tracking-tight">{formatCurrency(item.price)}</div>
                          <QualityBadge quality={item.quality} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div className="p-6 border-t border-zinc-800/80 bg-zinc-950/60 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
                  Total {quote.items.length} ítem{quote.items.length !== 1 ? 's' : ''}
                </span>
                <span className="text-2xl font-black text-white tracking-tight">
                  {formatCurrency(quote.items.reduce((s, i) => s + i.price, 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Reject dialog */}
        {rejecting && (
          <div className="bg-zinc-900 border border-rose-500/30 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-zinc-100 mb-3 flex items-center gap-2 tracking-tight">
              ❌ Rechazar cotización
            </h3>
            <textarea
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              placeholder="Indicá el motivo del rechazo (ej: precio fuera de presupuesto, buscaremos otro proveedor)..."
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

        {/* Sin cotización todavía */}
        {!quote && order.status === 'pendiente' && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-10 text-center shadow-sm">
            <div className="text-4xl mb-4 drop-shadow-sm opacity-90">⏳</div>
            <h3 className="text-lg font-bold text-amber-100 mb-2 tracking-tight">Esperando cotización</h3>
            <p className="text-sm font-medium text-amber-400/80 max-w-sm mx-auto">
              El vendedor revisará tu pedido y te enviará una cotización en breve.
            </p>
          </div>
        )}

        {!quote && order.status === 'en_revision' && (
          <div className="bg-sky-500/5 border border-sky-500/20 rounded-3xl p-10 text-center shadow-sm">
            <div className="text-4xl mb-4 drop-shadow-sm opacity-90">🔍</div>
            <h3 className="text-lg font-bold text-sky-100 mb-2 tracking-tight">En revisión</h3>
            <p className="text-sm font-medium text-sky-400/80 max-w-sm mx-auto">
              El vendedor está consultando con sus proveedores. Pronto recibirás la cotización.
            </p>
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
