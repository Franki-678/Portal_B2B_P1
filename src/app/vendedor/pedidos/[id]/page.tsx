'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar, EmptyState } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/FormFields';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { StatusBadge, QualityBadge } from '@/components/ui/Badge';
import { OrderStatusTracker } from '@/components/orders/OrderStatusTracker';
import {
  formatDate,
  formatCurrency,
  canVendorQuote,
  quoteLineTotal,
  formatVendorOrderLabel,
} from '@/lib/utils';
import { useImageLightbox } from '@/components/ui/ImageLightbox';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { QUALITY_OPTIONS } from '@/lib/constants';
import { OrderQuality, QuoteItem } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface QuoteItemDraft extends Omit<QuoteItem, 'id' | 'quoteId' | 'approved' | 'images'> {
  tempId: string;
  isAvailable: boolean;
  requestedQuantity: number;
  imageFiles: File[];
  imagePreviews: string[];
}

export default function VendedorPedidoDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const { user } = useAuth();
  const { getOrderBySlug, setOrderInReview, submitQuote, closeOrder, deleteOrder, takeOrder, releaseOrder, markOrderPaidByVendor, markOrderDelivered, resolveConflict } = useDataStore();
  const router = useRouter();

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [items, setItems] = useState<QuoteItemDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictOutcome, setConflictOutcome] = useState('devolucion_total');
  const [conflictDetail, setConflictDetail] = useState('');
  const [conflictLoading, setConflictLoading] = useState(false);
  const lightbox = useImageLightbox();

  // Soporta UUID (legacy) y slug "NN-PED-XXXX" / "PED-XXXX"
  const order = getOrderBySlug(id);

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
          quantityOffered: i.quantity,
          requestedQuantity: i.quantity,
          imageUrl: '',
          notes: '',
          isAvailable: true,
          imageFiles: [],
          imagePreviews: [],
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
            icon="&#x2753;"
            title="Pedido no encontrado"
            description="El pedido que buscás no existe."
            action={<Button onClick={() => router.push('/vendedor/pedidos')}>Volver a pedidos</Button>}
          />
        </div>
      </>
    );
  }

  const canQuote = canVendorQuote(order.status);
  const hasQuote = !!order.quote;
  // Sistema colaborativo: el vendedor solo puede actuar sobre sus propios pedidos
  const isMyOrder = order.assignedVendorId === user?.id || user?.role === 'admin';
  const isUnassigned = !order.assignedVendorId;

  const handleSetInReview = async () => {
    setActionLoading(true);
    await setOrderInReview(order.id, user!.id, user!.name, 'Pedido tomado para revisión.');
    setActionLoading(false);
  };

  const handleCloseOrder = async () => {
    setActionLoading(true);
    await closeOrder(order.id, user!.id, user!.name, 'Pedido cerrado por el vendedor.');
    setShowCloseModal(false);
    setActionLoading(false);
  };

  const handleDeleteOrder = async () => {
    setActionLoading(true);
    const ok = await deleteOrder(order.id);
    setActionLoading(false);
    setShowDeleteModal(false);
    if (ok) {
      router.push('/vendedor/pedidos');
    } else {
      alert('No se pudo eliminar el pedido.');
    }
  };

  const handleMarkPaidByVendor = async () => {
    setActionLoading(true);
    await markOrderPaidByVendor(order.id);
    setActionLoading(false);
  };

  const handleMarkDelivered = async () => {
    setActionLoading(true);
    await markOrderDelivered(order.id);
    setActionLoading(false);
  };

  const handleResolveConflict = async () => {
    if (!conflictDetail.trim()) return;
    setConflictLoading(true);
    const ok = await resolveConflict(order.id, conflictOutcome, conflictDetail.trim());
    setConflictLoading(false);
    if (ok) {
      setShowConflictModal(false);
      setConflictDetail('');
      setConflictOutcome('devolucion_total');
    } else {
      alert('No se pudo resolver el conflicto. Verificá que el pedido esté en estado "en_conflicto".');
    }
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
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    e.target.value = '';

    setItems(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;
      const room = 5 - item.imageFiles.length;
      const add = picked.slice(0, Math.max(0, room));
      const newFiles = [...item.imageFiles, ...add];
      const newPreviews = newFiles.map(f => URL.createObjectURL(f));
      item.imagePreviews.forEach(u => URL.revokeObjectURL(u));
      return { ...item, imageFiles: newFiles, imagePreviews: newPreviews };
    }));
  };

  const removeImageAt = (tempId: string, idx: number) => {
    setItems(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;
      const newFiles = item.imageFiles.filter((_, i) => i !== idx);
      const newPreviews = item.imagePreviews.filter((_, i) => i !== idx);
      URL.revokeObjectURL(item.imagePreviews[idx] ?? '');
      return { ...item, imageFiles: newFiles, imagePreviews: newPreviews };
    }));
  };

  const validateQuote = (): boolean => {
    const errs: Record<string, string> = {};
    items.filter(i => i.isAvailable).forEach(item => {
      if (!item.price || item.price <= 0) {
        errs[`${item.tempId}-price`] =
          `El ítem "${item.partName}" debe tener un precio mayor a 0 o marcarse como sin stock.`;
      }
      const q = Math.floor(Number(item.quantityOffered) || 0);
      if (q < 1) errs[`${item.tempId}-qty`] = 'Cantidad ofrecida mínimo 1';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateQuote()) return;
    setLoading(true);
    setShowSlowMessage(false);
    const timer = setTimeout(() => setShowSlowMessage(true), 10_000);

    try {
      const finalItems = items.filter(i => i.isAvailable).map(
        ({ tempId, isAvailable, imagePreviews, requestedQuantity, ...rest }) => ({
          ...rest,
          quantityOffered: Math.max(1, Math.floor(Number(rest.quantityOffered) || 1)),
          imageFiles: rest.imageFiles,
          approved: null,
        })
      );
        
      await submitQuote(order.id, {
        notes: quoteNotes,
        vendorId: user!.id,
        vendorName: user!.name,
        items: finalItems,
      });

      setShowQuoteForm(false);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert('Hubo un error al enviar la cotización: ' + msg);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  return (
    <>
      <TopBar
        title={`Pedido ${order.workshop?.tallerNumber && order.workshopOrderNumber
          ? `${String(order.workshop.tallerNumber).padStart(2, '0')}-PED-${String(order.workshopOrderNumber).padStart(4, '0')}`
          : order.id.split('-')[0].toUpperCase()
        }`}
        subtitle={`${order.vehicleBrand} ${order.vehicleModel} ${order.vehicleYear} · ${order.workshop?.name}`}
        orderLabel={formatVendorOrderLabel(order)}
        action={
          <Button variant="ghost" onClick={() => router.push('/vendedor/pedidos')}>
            &#x2190; Pedidos
          </Button>
        }
      />

      <div className="p-6 space-y-8 max-w-4xl mx-auto">

        {/* Alerta urgente: pedido en conflicto (TAREA 4) */}
        {order.status === 'en_conflicto' && (
          <div className="rounded-2xl border border-red-500/50 bg-red-600/10 px-5 py-5 shadow-lg shadow-red-500/10">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex items-start gap-4 flex-1">
                <span className="shrink-0 text-2xl">⚠️</span>
                <div className="min-w-0">
                  <p className="font-bold text-red-300 text-base">Reclamo activo — requiere atención</p>
                  <p className="text-sm text-red-400/80 mt-1">
                    El taller inició un reclamo. Revisá el historial, coordiná la resolución y registrá el acuerdo.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setShowConflictModal(true)}
                className="shrink-0 bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600/30"
              >
                🤝 Conflicto Solucionado
              </Button>
            </div>
          </div>
        )}

        {/* Alerta: pedido cancelado */}
        {order.status === 'cancelado' && (
          <div className="flex items-start gap-4 rounded-2xl border border-zinc-600/40 bg-zinc-800/30 px-5 py-4">
            <span className="shrink-0 text-2xl">🚫</span>
            <div>
              <p className="font-bold text-zinc-400">Pedido cancelado</p>
              <p className="text-sm text-zinc-500 mt-1">
                Este pedido fue cancelado como parte de la resolución del conflicto.
              </p>
            </div>
          </div>
        )}

        {/* Alerta: pago registrado por vendedor (esperando entrega) */}
        {order.status === 'pagado' && (
          <div className="flex items-start gap-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-4">
            <span className="shrink-0 text-2xl">💰</span>
            <div>
              <p className="font-bold text-violet-300">Pago registrado — pendiente de entrega</p>
              <p className="text-sm text-violet-400/70 mt-1">
                Registraste el pago del taller. Cuando entregues los repuestos, marcá el pedido como entregado.
              </p>
            </div>
          </div>
        )}

        {/* Alerta: pedido pagado y entregado */}
        {order.status === 'cerrado_pagado' && (
          <div className="flex items-start gap-4 rounded-2xl border border-teal-500/30 bg-teal-500/8 px-5 py-4">
            <span className="shrink-0 text-2xl">💳</span>
            <div>
              <p className="font-bold text-teal-300">Entregado y cobrado</p>
              <p className="text-sm text-teal-400/70 mt-1">
                La mercadería fue entregada y el pago confirmado. Este pedido está completo.
              </p>
            </div>
          </div>
        )}

        {/* Header Detalle Pedido */}
        <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 mb-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <StatusBadge status={order.status} />
                <span className="text-[11px] text-zinc-100 font-mono font-bold bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-700/50 uppercase tracking-widest">
                  {order.workshop?.tallerNumber && order.workshopOrderNumber
                    ? `${String(order.workshop.tallerNumber).padStart(2, '0')}-PED-${String(order.workshopOrderNumber).padStart(4, '0')}`
                    : order.id.split('-')[0].toUpperCase()
                  }
                </span>
              </div>
              <h2 className="text-2xl font-extrabold text-zinc-100 tracking-tight">Pedido del Taller</h2>
              <p className="text-sm font-medium text-zinc-400 mt-1">
                &#x1F697; {order.vehicleBrand} {order.vehicleModel} <span className="text-sky-400 font-bold">{order.vehicleVersion}</span> &#x2022; {order.vehicleYear}
              </p>
              <p className="text-sm font-semibold text-orange-500 mt-2 bg-orange-500/10 inline-flex items-center gap-2 flex-wrap px-2 py-1 rounded-md border border-orange-500/20">
                &#x1F3ED; {order.workshop?.name}
                {order.workshop?.phone && (
                  <WhatsAppLink
                    phone={order.workshop.phone}
                    message={`Hola, te contacto por el pedido ${formatVendorOrderLabel(order)}`}
                    className="!px-2 !py-0.5"
                  />
                )}
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-1 text-xs font-medium text-zinc-500">
              <div>Creado: {formatDate(order.createdAt)}</div>
              <div>Actualizado: {formatDate(order.updatedAt)}</div>
            </div>
          </div>

          {/* Datos del Taller */}
          <div className="mt-6 p-4 bg-zinc-950/40 rounded-2xl border border-zinc-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-lg shadow-inner border border-orange-500/20">&#x1F3ED;</div>
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <div className="text-sm font-bold text-zinc-100 tracking-tight">{order.workshop?.name}</div>
                  <div className="text-xs font-medium text-zinc-500">Taller Autorizado</div>
                </div>
                {order.workshop?.phone && (
                  <WhatsAppLink
                    phone={order.workshop.phone}
                    message={`Hola, te contacto por el pedido ${formatVendorOrderLabel(order)}`}
                  />
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <div className="text-[11px] font-medium text-zinc-400">&#x1F464; {order.workshop?.contactName || 'Sin contacto'}</div>
              <div className="text-[11px] font-medium text-zinc-400">&#x2709;&#xFE0F; {order.workshop?.email || 'Sin email'}</div>
              <div className="text-[11px] font-medium text-zinc-400">&#x1F4DE; {order.workshop?.phone || 'Sin teléfono'}</div>
              <div className="text-[11px] font-medium text-zinc-400">&#x1F4CD; {order.workshop?.address || 'Sin dirección'}</div>
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
                     {it.codigoCatalogo && (
                       <p className="text-xs text-zinc-500 mt-0.5 font-medium">
                          Ref. catálogo: <span className="font-mono text-zinc-400">{it.codigoCatalogo}</span>
                       </p>
                     )}
                     <div className="flex items-center gap-2 mt-2">
                       <QualityBadge quality={it.quality} />
                       <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-bold">Cant: {it.quantity}</span>
                     </div>
                     {it.description && <p className="text-sm text-zinc-400 mt-2">{it.description}</p>}
                   </div>
                   
                   {it.images && it.images.length > 0 && (
                     <div className="flex-shrink-0 flex gap-2 overflow-x-auto pb-2 md:pb-0">
                       {it.images.map((img, imgIdx) => (
                         <button
                           key={img.id}
                           type="button"
                           className="shrink-0 rounded-xl border border-zinc-700/50 overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                           onClick={() =>
                             lightbox.open(
                               it.images!.map(i => i.url),
                               imgIdx
                             )
                           }
                         >
                           {/* eslint-disable-next-line @next/next/no-img-element */}
                           <img src={img.url} alt="Referencia" className="w-24 h-20 object-cover shadow-sm" />
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 pt-5 flex items-center gap-3 flex-wrap">

            {/* ── Tomar pedido (solo si está libre) ── */}
            {isUnassigned && order.status === 'pendiente' && (
              <Button
                size="sm"
                onClick={async () => { setActionLoading(true); await takeOrder(order.id); setActionLoading(false); }}
                loading={actionLoading}
                className="bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-md shadow-orange-500/20"
              >
                🙋 Tomar pedido
              </Button>
            )}

            {/* ── Acciones del vendedor asignado ── */}
            {isMyOrder && (
              <>
                {/* Liberar */}
                {(order.status === 'pendiente' || order.status === 'en_revision') && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => { setActionLoading(true); await releaseOrder(order.id); setActionLoading(false); }}
                    loading={actionLoading}
                  >
                    🔓 Liberar a la cola
                  </Button>
                )}
                {/* Marcar en revisión */}
                {order.status === 'pendiente' && (
                  <Button size="sm" variant="secondary" onClick={handleSetInReview} loading={actionLoading}>
                    🔍 Marcar en revisión
                  </Button>
                )}
                {/* Armar cotización */}
                {canQuote && !hasQuote && (
                  <Button size="sm" onClick={() => setShowQuoteForm(true)}>
                    💰 Armar cotización
                  </Button>
                )}
                {/* Flujo de cobro y entrega (TAREA 1) */}
                {(order.status === 'aprobado' || order.status === 'aprobado_parcial') && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleMarkPaidByVendor}
                      loading={actionLoading}
                    >
                      💰 Marcar como Pagado
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={handleMarkDelivered}
                      loading={actionLoading}
                      className="shadow-lg shadow-emerald-500/10"
                    >
                      📦 Entregado y Pagado
                    </Button>
                  </>
                )}
                {/* Pedido pagado → marcar entrega */}
                {order.status === 'pagado' && (
                  <Button
                    size="sm"
                    variant="success"
                    onClick={handleMarkDelivered}
                    loading={actionLoading}
                    className="shadow-lg shadow-emerald-500/10"
                  >
                    📦 Marcar como Entregado
                  </Button>
                )}
                {/* Eliminar */}
                {(order.status === 'pendiente' || order.status === 'en_revision') && (
                  <Button size="sm" variant="danger" onClick={() => setShowDeleteModal(true)} loading={actionLoading}>
                    🗑️ Eliminar pedido
                  </Button>
                )}
              </>
            )}

            {/* ── Solo lectura (pedido de otro vendedor) ── */}
            {!isMyOrder && !isUnassigned && (
              <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg">
                <span>👁</span>
                <span>Solo lectura — asignado a <span className="text-zinc-300 font-semibold">{order.assignedVendorName}</span></span>
              </div>
            )}

            {hasQuote && canQuote && isMyOrder && (
              <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 rounded-lg">
                Ya existe una cotización enviada
              </div>
            )}
          </div>
        </div>

        {/* ── SLIDE-OVER DRAWER: COTIZACIÓN ── */}
        {showQuoteForm && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => !loading && setShowQuoteForm(false)}
            />

            {/* Drawer panel */}
            <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-zinc-900 border-l border-zinc-800 shadow-2xl shadow-black/60">

              {/* Drawer header */}
              <div className="relative flex items-center justify-between border-b border-zinc-800/80 bg-orange-500/5 px-6 py-5 shrink-0">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-orange-500 to-amber-500 opacity-60" />
                <div>
                  <h3 className="text-lg font-bold text-orange-100 flex items-center gap-2 tracking-tight">
                    <span className="text-xl">&#x1F4B0;</span> Nueva cotización
                  </h3>
                  <p className="text-sm font-medium text-orange-400/70 mt-0.5">
                    Completá los datos de los ítems para cotizarle al taller
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !loading && setShowQuoteForm(false)}
                  disabled={loading}
                  className="rounded-xl border border-zinc-700 bg-zinc-800 p-2 text-zinc-400 hover:text-white hover:border-zinc-600 transition disabled:opacity-40"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              {/* Drawer scrollable body + form */}
              <form
                onSubmit={handleSubmitQuote}
                className="flex flex-1 flex-col overflow-hidden"
                autoComplete="off"
              >
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <Textarea
                    label="Observaciones generales"
                    value={quoteNotes}
                    onChange={e => setQuoteNotes(e.target.value)}
                    placeholder="Notas generales, tiempo estimado de preparación, etc."
                    rows={2}
                  />

                  <div className="space-y-5">
                    {items.map((item, idx) => (
                      <div
                        key={item.tempId}
                        className={`border border-zinc-800/80 rounded-2xl p-6 transition-all ${
                          !item.isAvailable
                            ? 'bg-zinc-950/80 opacity-60 grayscale-[30%]'
                            : 'bg-zinc-950/40 shadow-sm relative group'
                        }`}
                      >
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
                              <div>
                                <p className="mb-2 block text-sm font-semibold text-zinc-300">Cantidad solicitada (taller)</p>
                                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-2.5 text-sm text-zinc-400">
                                  {item.requestedQuantity} unidad{item.requestedQuantity !== 1 ? 'es' : ''}
                                </div>
                              </div>
                              <Input
                                label="Cantidad ofrecida"
                                required
                                type="number"
                                min={1}
                                value={item.quantityOffered || ''}
                                onChange={e =>
                                  updateItem(item.tempId, 'quantityOffered', parseInt(e.target.value, 10) || 1)
                                }
                                error={errors[`${item.tempId}-qty`]}
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Input
                                label="Precio unitario (ARS)"
                                required
                                type="number"
                                min="0"
                                step="0.01"
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
                            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 text-sm">
                              <span className="font-medium text-orange-200/90">Total ítem: </span>
                              <span className="text-lg font-black text-white">
                                {formatCurrency(
                                  quoteLineTotal({
                                    price: item.price || 0,
                                    quantityOffered: item.quantityOffered || 1,
                                  })
                                )}
                              </span>
                              <span className="ml-2 text-xs text-zinc-500">
                                ({item.quantityOffered || 1} x {formatCurrency(item.price || 0)})
                              </span>
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

                            <div>
                              <p className="mb-2 block text-sm font-semibold text-zinc-300">
                                Fotos del repuesto (máx. 5)
                              </p>
                              <div className="flex flex-wrap items-start gap-3">
                                {item.imagePreviews.map((preview, pi) => (
                                  <div key={pi} className="group/img relative inline-block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={preview}
                                      alt=""
                                      className="h-20 w-20 rounded-xl border border-zinc-700/50 object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeImageAt(item.tempId, pi)}
                                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white opacity-0 shadow-lg transition-opacity group-hover/img:opacity-100"
                                    >
                                      &#x2715;
                                    </button>
                                  </div>
                                ))}
                                {item.imageFiles.length < 5 && (
                                  <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-950/30 transition-all hover:border-orange-500/30 hover:bg-zinc-900/50">
                                    <span className="text-2xl text-zinc-500">&#x1F4F7;</span>
                                    <span className="mt-0.5 text-[10px] font-bold uppercase text-zinc-500">Foto</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      className="hidden"
                                      onChange={e => handleImageUpload(item.tempId, e)}
                                    />
                                  </label>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Drawer sticky footer */}
                <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/60 px-6 py-4 space-y-3">
                  {/* Total */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-400">Total cotización</span>
                    <span className="text-xl font-black text-white">
                      {formatCurrency(
                        items
                          .filter(i => i.isAvailable)
                          .reduce(
                            (acc, i) =>
                              acc + quoteLineTotal({ price: i.price || 0, quantityOffered: i.quantityOffered || 1 }),
                            0
                          )
                      )}
                    </span>
                  </div>
                  {loading && showSlowMessage && (
                    <span className="block text-xs text-zinc-400">
                      Procesando... esto puede tardar unos segundos.
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowQuoteForm(false)}
                      disabled={loading}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" loading={loading} size="lg" className="flex-1">
                      &#x1F4E4; Enviar cotización
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </>
        )}

        {/* COTIZACIÓN ENVIADA EXISTENTE */}
        {order.quote && (
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-lg shadow-black/20">
            <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/50">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 tracking-tight">
                <span className="text-xl drop-shadow-sm">&#x1F4B0;</span> Cotización enviada
              </h3>
              {order.quote.sentAt && (
                <p className="text-xs font-medium text-zinc-500 mt-1">Enviada el {formatDate(order.quote.sentAt)}</p>
              )}
              {order.quote.notes && (
                <div className="mt-4 bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/80 shadow-inner">
                  <p className="text-sm font-medium text-zinc-400">&#x1F4AC; {order.quote.notes}</p>
                </div>
              )}
            </div>
            
            <div className="divide-y divide-zinc-800/80">
              {order.quote.items.map(item => {
                const fromRows = item.images?.map(i => i.url).filter(Boolean) ?? [];
                const photoUrls =
                  fromRows.length > 0 ? fromRows : item.imageUrl ? [item.imageUrl] : [];
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-5 p-6 transition-colors hover:bg-zinc-800/30 md:flex-row"
                  >
                    {photoUrls.length > 0 && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {photoUrls.map((u, ui) => (
                          <button
                            key={ui}
                            type="button"
                            className="overflow-hidden rounded-xl border border-zinc-700/50 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                            onClick={() => lightbox.open(photoUrls, ui)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={u}
                              alt=""
                              className="h-20 w-24 object-cover md:h-20 md:w-24"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                        <div className="space-y-1">
                          <h4 className="text-base font-bold text-zinc-100">{item.partName}</h4>
                          <p className="text-sm font-medium text-zinc-400">{item.description}</p>
                          <p className="text-sm text-zinc-300">
                            <span className="text-zinc-500">Total ítem: </span>
                            {item.quantityOffered} x {formatCurrency(item.price)} ={' '}
                            <span className="font-bold text-white">
                              {formatCurrency(quoteLineTotal(item))}
                            </span>
                          </p>
                          {item.manufacturer && (
                            <p className="text-xs text-zinc-400">
                              <span className="text-zinc-500">Fabricante:</span> {item.manufacturer}
                            </p>
                          )}
                          {item.supplier && (
                            <p className="text-xs text-zinc-400">
                              <span className="text-zinc-500">Proveedor:</span> {item.supplier}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col space-y-2 text-left md:text-right">
                          <div className="text-xs font-medium text-zinc-500">
                            Unit. {formatCurrency(item.price)}
                          </div>
                          <QualityBadge quality={item.quality} />
                          {item.approved === true && (
                            <div className="inline-block rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400 shadow-sm">
                              &#x2705; Aprobado
                            </div>
                          )}
                          {item.approved === false && (
                            <div className="inline-block rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-400 shadow-sm">
                              &#x274C; Rechazado
                            </div>
                          )}
                          {item.approved === null && order.status === 'cotizado' && (
                            <div className="inline-block rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-400 shadow-sm">
                              &#x23F3; Pendiente
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {order.quote && order.quote.items.length === 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            El vendedor no tiene stock disponible para ninguno de los ítems solicitados.
          </div>
        )}

        {/* Historial */}
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-zinc-100 mb-6 flex items-center gap-2 tracking-tight">
            &#x1F4CB; Estado del pedido
          </h3>
          <OrderStatusTracker status={order.status} events={order.events} userRole={user?.role} />
        </div>
      </div>
      {lightbox.node}

      {/* Modal: Resolver conflicto (TAREA 4) */}
      {showConflictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7 max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-extrabold text-zinc-100 mb-1 tracking-tight">🤝 Resolver conflicto</h3>
            <p className="text-sm text-zinc-400 mb-6">Registrá el acuerdo alcanzado con el taller.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-2">Tipo de resolución</label>
                <select
                  value={conflictOutcome}
                  onChange={e => setConflictOutcome(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm font-medium text-zinc-200 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/30"
                >
                  <option value="devolucion_total">Devolución total</option>
                  <option value="devolucion_parcial">Devolución parcial</option>
                  <option value="descuento">Se aplicó descuento</option>
                  <option value="sin_cambios">Resuelto sin cambios</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-2">Detalle del acuerdo <span className="text-red-400">*</span></label>
                <textarea
                  value={conflictDetail}
                  onChange={e => setConflictDetail(e.target.value)}
                  placeholder="Describí el acuerdo alcanzado con el taller..."
                  rows={4}
                  className="min-h-[100px] w-full resize-y rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm font-medium text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/30"
                />
              </div>
              {conflictOutcome === 'cancelado' && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-300">
                  ⚠️ El pedido pasará al estado <strong>Cancelado</strong>. Esta acción no se puede deshacer.
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => { setShowConflictModal(false); setConflictDetail(''); setConflictOutcome('devolucion_total'); }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleResolveConflict}
                loading={conflictLoading}
                disabled={!conflictDetail.trim()}
                className="flex-1 bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600/30 disabled:opacity-40"
              >
                ✅ Confirmar resolución
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showCloseModal}
        title="&#x00BF;Cerrar este pedido?"
        description="Esta acción confirma que los repuestos aprobados fueron procesados y entregados. No se puede deshacer."
        cancelLabel="Cancelar"
        confirmLabel="Confirmar cierre"
        onCancel={() => setShowCloseModal(false)}
        onConfirm={handleCloseOrder}
        loading={actionLoading}
      />
      <ConfirmModal
        open={showDeleteModal}
        title="&#x00BF;Eliminar este pedido?"
        description="Esta acción eliminará el pedido y su historial asociado. No se puede deshacer."
        tone="danger"
        cancelLabel="Cancelar"
        confirmLabel="Eliminar pedido"
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteOrder}
        loading={actionLoading}
      />
    </>
  );
}
