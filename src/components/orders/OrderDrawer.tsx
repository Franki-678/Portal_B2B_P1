'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Order } from '@/lib/types';
import { StatusBadge, QualityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import {
  formatDate,
  formatCurrency,
  quoteLineTotal,
  formatVendorOrderLabel,
  cn,
} from '@/lib/utils';
import { useDataStore } from '@/contexts/DataStoreContext';
import { useAuth } from '@/contexts/AuthContext';

interface OrderDrawerProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  role: 'taller' | 'vendedor' | 'admin';
  /** Callback después de tomar un pedido */
  onTook?: (orderId: string) => void;
}

export function OrderDrawer({ order, open, onClose, role, onTook }: OrderDrawerProps) {
  const { user } = useAuth();
  const { takeOrder, releaseOrder, setOrderInReview, markOrderPaid } = useDataStore();
  const [taking, setTaking] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Bloquear scroll del body cuando está abierto
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!order) return null;

  const isMyOrder = order.assignedVendorId === user?.id;
  const isUnassigned = !order.assignedVendorId;
  const totalQuote = order.quote?.items.reduce((s, i) => s + quoteLineTotal(i), 0) ?? 0;
  const orderLabel = formatVendorOrderLabel(order);

  // ── Helpers de acción ─────────────────────────────────────

  const handleTake = async () => {
    setTaking(true);
    const ok = await takeOrder(order.id);
    setTaking(false);
    if (ok) onTook?.(order.id);
  };

  const handleRelease = async () => {
    setReleasing(true);
    await releaseOrder(order.id);
    setReleasing(false);
  };

  const handleInReview = async () => {
    if (!user) return;
    setReviewLoading(true);
    await setOrderInReview(order.id, user.id, user.name, 'Pedido tomado para revisión.');
    setReviewLoading(false);
  };

  const handleMarkPaid = async () => {
    setMarkingPaid(true);
    await markOrderPaid(order.id);
    setMarkingPaid(false);
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Panel slide-over */}
      <aside
        ref={panelRef}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-screen w-full flex-col border-l border-slate-800 bg-slate-950 shadow-2xl shadow-black/60 transition-transform duration-300 sm:max-w-[640px]',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-label="Detalle del pedido"
      >
        {/* ── Header del drawer ── */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <StatusBadge status={order.status} />
            <span className="font-mono text-xs font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded border border-slate-700 uppercase tracking-widest truncate">
              {orderLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition hover:border-slate-600 hover:text-white"
            aria-label="Cerrar detalle"
          >
            ✕
          </button>
        </div>

        {/* ── Contenido scrolleable ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Banner de conflicto activo */}
          {order.status === 'en_conflicto' && (
            <div className="border-b border-red-500/30 bg-red-600/10 px-5 py-3 flex items-center gap-3">
              <span className="text-lg shrink-0">⚠️</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-red-300">Reclamo activo</p>
                <p className="text-xs text-red-400/70">El taller reportó un problema. Revisá el historial.</p>
              </div>
            </div>
          )}

          {/* Banner de pago confirmado */}
          {order.status === 'cerrado_pagado' && (
            <div className="border-b border-teal-500/20 bg-teal-500/8 px-5 py-3 flex items-center gap-3">
              <span className="text-lg shrink-0">💳</span>
              <p className="text-sm font-semibold text-teal-300">Pago confirmado por administración</p>
            </div>
          )}

          {/* Vehículo */}
          <div className="border-b border-slate-800/60 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Vehículo</p>
            <p className="text-base font-bold text-white">
              {order.vehicleBrand} {order.vehicleModel}
              {order.vehicleVersion && (
                <span className="ml-2 text-sky-400 font-medium">{order.vehicleVersion}</span>
              )}
            </p>
            <p className="text-sm text-slate-400 mt-0.5">{order.vehicleYear}</p>
          </div>

          {/* Taller — visible para vendedor/admin; ocultado para taller mismo */}
          {role !== 'taller' && order.workshop && (
            <div className="border-b border-slate-800/60 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Taller</p>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-base">
                  🏭
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-100">{order.workshop.name}</p>
                  <p className="text-xs text-slate-500">{order.workshop.address || 'Sin dirección'}</p>
                </div>
                {order.workshop.phone && (
                  <WhatsAppLink
                    phone={order.workshop.phone}
                    message={`Hola, te contacto por el pedido ${orderLabel}`}
                    className="ml-auto"
                  />
                )}
              </div>
            </div>
          )}

          {/* Ítems pedidos */}
          <div className="border-b border-slate-800/60 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Repuestos solicitados ({order.items.length})
            </p>
            <div className="space-y-2">
              {order.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-[10px] font-bold text-sky-400">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-100">{item.partName}</p>
                    {item.description && (
                      <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <QualityBadge quality={item.quality} />
                      <span className="text-[11px] font-medium text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                        Cant: {item.quantity}
                      </span>
                      {item.codigoCatalogo && (
                        <span className="text-[10px] font-mono text-slate-500">
                          Ref: {item.codigoCatalogo}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cotización (si existe) */}
          {order.quote && (
            <div className="border-b border-slate-800/60 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                Cotización enviada
              </p>
              {order.quote.notes && (
                <p className="mb-3 text-xs text-slate-400 italic">"{order.quote.notes}"</p>
              )}
              <div className="space-y-1.5">
                {order.quote.items.map(qi => (
                  <div key={qi.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{qi.partName}</p>
                      <p className="text-[11px] text-slate-500">
                        {qi.quantityOffered} u × {formatCurrency(qi.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {qi.approved === true && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">✓ Aprobado</span>
                      )}
                      {qi.approved === false && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">✗ Rechazado</span>
                      )}
                      <span className="text-xs font-bold text-white">{formatCurrency(quoteLineTotal(qi))}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <span className="text-sm font-bold text-white">
                  Total: {formatCurrency(totalQuote)}
                </span>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="px-5 py-4 text-xs text-slate-500 space-y-1">
            <p>Creado: {formatDate(order.createdAt)}</p>
            <p>Actualizado: {formatDate(order.updatedAt)}</p>
            {order.internalOrderNumber && (
              <p>Ref. interna: <span className="text-slate-400 font-medium">{order.internalOrderNumber}</span></p>
            )}
          </div>
        </div>

        {/* ── Barra de acciones fija en el footer ── */}
        <div className="border-t border-slate-800 bg-slate-900 px-5 py-4 space-y-2">

          {/* Acciones para VENDEDOR */}
          {role === 'vendedor' && (
            <>
              {/* Tomar pedido — solo si está sin asignar y pendiente */}
              {isUnassigned && order.status === 'pendiente' && (
                <Button
                  fullWidth
                  size="sm"
                  onClick={handleTake}
                  loading={taking}
                  className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-md shadow-blue-500/20"
                >
                  🙋 Tomar pedido
                </Button>
              )}

              {/* Liberar pedido — solo si es mío y está en estado temprano */}
              {isMyOrder && (order.status === 'pendiente' || order.status === 'en_revision') && (
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onClick={handleRelease}
                  loading={releasing}
                >
                  🔓 Liberar a la cola
                </Button>
              )}

              {/* Marcar en revisión — si es mío y pendiente */}
              {isMyOrder && order.status === 'pendiente' && (
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onClick={handleInReview}
                  loading={reviewLoading}
                >
                  🔍 Marcar en revisión
                </Button>
              )}

              {/* Ir al detalle completo */}
              <Link href={`/vendedor/pedidos/${order.id}`} className="block w-full">
                <Button fullWidth size="sm" variant="ghost" className="text-slate-300 hover:text-white">
                  Ver detalle completo →
                </Button>
              </Link>
            </>
          )}

          {/* Acciones para TALLER */}
          {role === 'taller' && (
            <Link href={`/taller/pedidos/${order.id}`} className="block w-full">
              <Button fullWidth size="sm">
                {order.status === 'cotizado' ? '💰 Ver cotización recibida' : '📄 Ver detalle del pedido'} →
              </Button>
            </Link>
          )}

          {/* Acciones para ADMIN */}
          {role === 'admin' && (
            <>
              {/* Marcar pagado — cuando está cerrado o en conflicto */}
              {(order.status === 'cerrado' || order.status === 'en_conflicto') && (
                <Button
                  fullWidth
                  size="sm"
                  onClick={handleMarkPaid}
                  loading={markingPaid}
                  className="bg-teal-600 hover:bg-teal-500 text-white border-0 shadow-md shadow-teal-500/20"
                >
                  💳 Confirmar pago
                </Button>
              )}
              {isUnassigned && order.status === 'pendiente' && (
                <Button
                  fullWidth
                  size="sm"
                  onClick={handleTake}
                  loading={taking}
                  className="bg-purple-600 hover:bg-purple-500 text-white border-0"
                >
                  🙋 Tomar como vendedor
                </Button>
              )}
              <Link href={`/vendedor/pedidos/${order.id}`} className="block w-full">
                <Button fullWidth size="sm" variant="ghost" className="text-slate-300 hover:text-white">
                  Gestionar pedido →
                </Button>
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
