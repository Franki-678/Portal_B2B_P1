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

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Header info */}
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
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Creado: {formatDate(order.createdAt)}</div>
              <div>Actualizado: {formatDate(order.updatedAt)}</div>
            </div>
          </div>

          {order.description && (
            <div className="bg-[#0f1117] rounded-lg p-4 border border-white/5">
              <p className="text-sm text-slate-300 leading-relaxed">{order.description}</p>
            </div>
          )}

          {/* Images */}
          {order.images.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-2">📷 Fotos de referencia</p>
              <div className="flex gap-3 flex-wrap">
                {order.images.map(img => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt="Referencia"
                    className="w-32 h-24 object-cover rounded-lg border border-white/8"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COTIZACIÓN */}
        {quote && (
          <div className="bg-[#1A1D27] border border-white/8 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-white/8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    💰 Cotización recibida
                  </h3>
                  {quote.sentAt && (
                    <p className="text-xs text-slate-500 mt-0.5">Enviada el {formatDate(quote.sentAt)}</p>
                  )}
                </div>
                {canRespond && !partialMode && (
                  <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2">
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
                      ✅ Aprobar seleccionados ({selectedItems.size})
                    </Button>
                  </div>
                )}
              </div>

              {partialMode && (
                <div className="mt-3 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                  💡 Seleccioná los ítems que querés aprobar. Los no seleccionados serán rechazados.
                </div>
              )}

              {quote.notes && (
                <div className="mt-3 bg-[#0f1117] rounded-lg p-3 border border-white/5">
                  <p className="text-xs text-slate-400">📝 {quote.notes}</p>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="divide-y divide-white/5">
              {quote.items.map(item => {
                const isSelected = partialMode ? selectedItems.has(item.id) : null;
                const wasApproved = !partialMode && item.approved === true;
                const wasRejected = !partialMode && item.approved === false;

                return (
                  <div
                    key={item.id}
                    onClick={() => partialMode && toggleItem(item.id)}
                    className={`p-5 flex gap-4 transition-all ${
                      partialMode ? 'cursor-pointer' : ''
                    } ${
                      partialMode && isSelected ? 'bg-green-500/5' : ''
                    } ${
                      partialMode && !isSelected ? 'opacity-50' : ''
                    } ${
                      wasApproved ? 'bg-green-500/5' : ''
                    } ${
                      wasRejected ? 'bg-red-500/5 opacity-60' : ''
                    }`}
                  >
                    {/* Checkbox / Estado */}
                    <div className="flex-shrink-0 mt-1">
                      {partialMode ? (
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'border-green-500 bg-green-500/20' : 'border-white/20'
                        }`}>
                          {isSelected && <span className="text-green-400 text-xs">✓</span>}
                        </div>
                      ) : wasApproved ? (
                        <span className="text-green-400 text-lg">✅</span>
                      ) : wasRejected ? (
                        <span className="text-red-400 text-lg">❌</span>
                      ) : null}
                    </div>

                    {/* Image */}
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.partName}
                        className="w-20 h-16 object-cover rounded-lg border border-white/8 flex-shrink-0"
                      />
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-medium text-white text-sm">{item.partName}</h4>
                          <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-base font-bold text-white">{formatCurrency(item.price)}</div>
                          <QualityBadge quality={item.quality} />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        {item.manufacturer && <span>🏭 {item.manufacturer}</span>}
                        {item.supplier && <span>📦 {item.supplier}</span>}
                      </div>
                      {item.notes && (
                        <p className="text-xs text-slate-500 mt-1.5 italic">{item.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div className="p-5 border-t border-white/8 bg-[#0f1117]/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Total {quote.items.length} ítem{quote.items.length !== 1 ? 's' : ''}
                </span>
                <span className="text-lg font-bold text-white">
                  {formatCurrency(quote.items.reduce((s, i) => s + i.price, 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Reject dialog */}
        {rejecting && (
          <div className="bg-[#1A1D27] border border-red-500/30 rounded-xl p-5">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              ❌ Rechazar cotización
            </h3>
            <textarea
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              placeholder="Indicá el motivo del rechazo (ej: precio fuera de presupuesto, buscaremos otro proveedor)..."
              rows={3}
              className="w-full px-3 py-2.5 bg-[#0f1117] border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 resize-none"
            />
            <div className="flex items-center gap-2 mt-3 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancelar</Button>
              <Button variant="danger" size="sm" onClick={handleReject} loading={loading} disabled={!rejectComment.trim()}>
                Confirmar rechazo
              </Button>
            </div>
          </div>
        )}

        {/* Sin cotización todavía */}
        {!quote && order.status === 'pendiente' && (
          <div className="bg-[#1A1D27] border border-white/8 rounded-xl p-8 text-center">
            <div className="text-3xl mb-3">⏳</div>
            <h3 className="font-semibold text-slate-300 mb-2">Esperando cotización</h3>
            <p className="text-sm text-slate-500">
              El vendedor revisará tu pedido y te enviará una cotización en breve.
            </p>
          </div>
        )}

        {!quote && order.status === 'en_revision' && (
          <div className="bg-[#1A1D27] border border-blue-500/20 rounded-xl p-8 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="font-semibold text-slate-300 mb-2">En revisión</h3>
            <p className="text-sm text-slate-500">
              El vendedor está consultando con sus proveedores. Pronto recibirás la cotización.
            </p>
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
