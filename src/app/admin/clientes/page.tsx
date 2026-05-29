'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDataStore } from '@/contexts/DataStoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate, digitsOnlyPhone, formatCurrency, quoteLineTotal, formatVendorOrderLabel } from '@/lib/utils';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { getSupabaseClient } from '@/lib/supabase/client';
import { reactivateWorkshop, suspendWorkshop } from '@/lib/supabase/queries';
import type { Order } from '@/lib/types';

type WorkshopStatus = 'active' | 'suspended' | 'pending_reactivation';

function orderTotal(order: Order): number {
  const items = order.quote?.items ?? [];
  return items.reduce((acc, item) => acc + quoteLineTotal(item), 0);
}

function getDaysInactive(lastActiveAt: string | null | undefined): number | null {
  if (!lastActiveAt) return null;
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default function AdminClientesPage() {
  const { getAllOrders, getAllWorkshops, refreshData } = useDataStore();
  const { user } = useAuth();
  const router = useRouter();

  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'activos' | 'pendientes'>('activos');
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  // Suspend modal state
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);

  const handleReactivate = useCallback(async (workshopId: string) => {
    setReactivatingId(workshopId);
    const sb = getSupabaseClient();
    const ok = await reactivateWorkshop(sb, workshopId);
    setReactivatingId(null);
    if (ok) {
      await refreshData({ forceWorkshops: true, silent: true });
    } else {
      alert('No se pudo rehabilitar el acceso. Intentá de nuevo.');
    }
  }, [refreshData]);

  const openSuspendModal = (id: string, name: string) => {
    setSuspendTarget({ id, name });
    setSuspendReason('');
    setShowSuspendModal(true);
  };

  const handleConfirmSuspend = async () => {
    if (!suspendTarget || !user) return;
    setSuspendLoading(true);
    const sb = getSupabaseClient();
    const ok = await suspendWorkshop(sb, suspendTarget.id, suspendReason, user.id, user.name);
    setSuspendLoading(false);
    if (ok) {
      setShowSuspendModal(false);
      setSuspendTarget(null);
      setSuspendReason('');
      await refreshData({ forceWorkshops: true, silent: true });
    } else {
      alert('No se pudo inhabilitar el taller. Intentá de nuevo.');
    }
  };

  const orders = getAllOrders();
  const allWorkshopsRaw = getAllWorkshops().map((workshop: any) => {
    const workshopOrders = orders.filter((order: Order) => order.workshopId === workshop.id);
    const days = getDaysInactive(workshop.last_active_at);
    return {
      ...workshop,
      workshopStatus: (workshop.status ?? 'active') as WorkshopStatus,
      daysInactive: days,
      totalOrders: workshopOrders.length,
      activeOrders: workshopOrders.filter((order: Order) => ['pendiente', 'en_revision', 'cotizado'].includes(order.status)).length,
      approvedOrders: workshopOrders.filter((order: Order) => order.status === 'aprobado' || order.status === 'aprobado_parcial').length,
      lastOrder: [...workshopOrders].sort(
        (a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0] as Order | undefined,
      allOrders: [...workshopOrders].sort(
        (a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    };
  });

  const workshops = activeTab === 'activos'
    ? allWorkshopsRaw.filter(w => w.workshopStatus === 'active')
    : allWorkshopsRaw.filter(w => w.workshopStatus !== 'active');
  const pendingCount = allWorkshopsRaw.filter(w => w.workshopStatus !== 'active').length;

  const selectedWorkshop = selectedWorkshopId
    ? workshops.find(w => w.id === selectedWorkshopId) ?? null
    : null;

  const drawerOrders: Order[] = selectedWorkshop?.allOrders ?? [];
  const totalGastado = drawerOrders
    .filter((o: Order) => o.status === 'cerrado_pagado')
    .reduce((acc: number, o: Order) => acc + orderTotal(o), 0);
  const totalRechazado = drawerOrders
    .filter((o: Order) => o.status === 'rechazado')
    .reduce((acc: number, o: Order) => acc + orderTotal(o), 0);

  return (
    <>
      <TopBar
        title="Clientes y talleres"
        subtitle={`${allWorkshopsRaw.length} talleres en la operación`}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0">
        <button
          type="button"
          onClick={() => { setActiveTab('activos'); setSelectedWorkshopId(null); }}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'activos'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
          }`}
        >
          ✅ Activos ({allWorkshopsRaw.filter(w => w.workshopStatus === 'active').length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('pendientes'); setSelectedWorkshopId(null); }}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'pendientes'
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
              : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
          }`}
        >
          🔒 Pendientes / Inactivos
          {pendingCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-black text-amber-300">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Grid de talleres */}
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {workshops.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">
              {activeTab === 'activos' ? 'No hay talleres activos.' : 'No hay talleres pendientes de reactivación.'}
            </p>
          </div>
        )}

        {workshops.map(workshop => {
          const last: Order | undefined = workshop.lastOrder;
          const lastTotal = last ? orderTotal(last) : 0;
          const isSelected = selectedWorkshopId === workshop.id;
          const isPending = workshop.workshopStatus !== 'active';
          const days = workshop.daysInactive as number | null;
          const showWarning = activeTab === 'activos' && days !== null && days >= 7;
          const warningIntensity = days !== null && days >= 14 ? 'high' : 'medium';

          return (
            <div
              key={workshop.id}
              onClick={() => setSelectedWorkshopId(workshop.id)}
              className={`group rounded-2xl border bg-zinc-900/60 p-5 cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'border-orange-500/30 bg-orange-500/5 shadow-md shadow-orange-500/5'
                  : 'border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90 hover:shadow-md hover:shadow-black/20'
              }`}
            >
              {/* Warning inactividad (tab activos, ≥7 días) */}
              {showWarning && (
                <div className={`flex items-center justify-between gap-2 mb-3 rounded-xl border px-3 py-2 ${
                  warningIntensity === 'high'
                    ? 'border-red-500/30 bg-red-500/8'
                    : 'border-amber-500/30 bg-amber-500/8'
                }`}>
                  <span className={`text-xs font-bold ${warningIntensity === 'high' ? 'text-red-300' : 'text-amber-300'}`}>
                    ⚠️ {days} días inactivo
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); openSuspendModal(workshop.id, workshop.name); }}
                    className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition-all"
                  >
                    🔒 Inhabilitar
                  </button>
                </div>
              )}

              {/* Badge estado pendientes (tab pendientes) */}
              {isPending && (
                <div className={`mb-3 rounded-xl border px-3 py-2.5 space-y-1.5 ${
                  workshop.workshopStatus === 'suspended'
                    ? 'border-rose-500/30 bg-rose-500/8'
                    : 'border-amber-500/25 bg-amber-500/8'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${workshop.workshopStatus === 'suspended' ? 'text-rose-300' : 'text-amber-300'}`}>
                      {workshop.workshopStatus === 'suspended'
                        ? '🔒 Inhabilitado manualmente'
                        : '⏰ Inactivo automático (30+ días)'}
                    </span>
                    <Button
                      size="sm"
                      loading={reactivatingId === workshop.id}
                      onClick={e => { e.stopPropagation(); void handleReactivate(workshop.id); }}
                      className="shrink-0 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 hover:border-cyan-400/50 font-bold text-xs"
                    >
                      ⚡ Rehabilitar
                    </Button>
                  </div>

                  {workshop.workshopStatus === 'suspended' && (
                    <>
                      {workshop.suspended_reason && (
                        <p className="text-[10px] text-rose-400/80 italic">
                          Motivo: {workshop.suspended_reason}
                        </p>
                      )}
                      {workshop.suspended_by_name && (
                        <p className="text-[10px] text-rose-500/60">
                          Por {workshop.suspended_by_name}
                          {workshop.suspended_at ? ` · ${formatDate(workshop.suspended_at)}` : ''}
                        </p>
                      )}
                    </>
                  )}

                  {workshop.workshopStatus === 'pending_reactivation' && workshop.last_active_at && (
                    <p className="text-[10px] text-amber-500/60">
                      Último acceso: {formatDate(workshop.last_active_at)}
                    </p>
                  )}
                </div>
              )}

              {/* Header: ícono + nombre + badge número */}
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-lg group-hover:border-zinc-700 transition-colors">
                  🏭
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-zinc-100 text-sm truncate group-hover:text-white transition-colors">
                      {workshop.name}
                    </h2>
                    {workshop.taller_number && (
                      <span className="shrink-0 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-400 uppercase">
                        #{String(workshop.taller_number).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{workshop.contact_name || 'Sin contacto'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Alta</div>
                  <div className="text-[11px] text-zinc-400 font-medium">{formatDate(workshop.created_at)}</div>
                </div>
              </div>

              {/* Info de contacto */}
              <div className="space-y-1 text-[12px] text-zinc-500 mb-4">
                {workshop.address && (
                  <p className="truncate">📍 {workshop.address}</p>
                )}
                <p className="flex items-center gap-1.5">
                  <span className="truncate">📞 {workshop.phone || 'Sin teléfono'}</span>
                  {digitsOnlyPhone(workshop.phone || '').length >= 8 && (
                    <WhatsAppLink phone={workshop.phone} message="Hola, te contacto desde administración." />
                  )}
                </p>
                {workshop.email && (
                  <p className="truncate">📧 {workshop.email}</p>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 border-t border-zinc-800/60 pt-3 mb-3">
                <Stat label="Total" value={workshop.totalOrders} />
                <Stat label="Activos" value={workshop.activeOrders} tone="text-amber-300" />
                <Stat label="Aprobados" value={workshop.approvedOrders} tone="text-emerald-300" />
              </div>

              {/* Último pedido */}
              {last ? (
                <div className="flex items-center gap-2 flex-wrap rounded-xl border border-zinc-800/60 bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-500">
                  <span className="font-mono font-bold text-orange-400/80 shrink-0">
                    #{formatVendorOrderLabel(last)}
                  </span>
                  {lastTotal > 0 && (
                    <span className="text-zinc-300 font-semibold shrink-0">{formatCurrency(lastTotal)}</span>
                  )}
                  <div className="ml-auto shrink-0">
                    <StatusBadge status={last.status} />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-800/60 px-3 py-2 text-[11px] text-zinc-600">
                  Sin pedidos registrados
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Drawer lateral */}
      {selectedWorkshop && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedWorkshopId(null)}
          />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col">
            <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-6 py-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🏭</span>
                  <h2 className="text-base font-bold text-zinc-100">{selectedWorkshop.name}</h2>
                </div>
                <p className="text-xs text-zinc-500">{selectedWorkshop.contact_name || 'Sin contacto registrado'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWorkshopId(null)}
                className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-all"
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="flex-1 px-6 py-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-1">Total gastado</p>
                  <p className="text-xl font-black text-emerald-300">{formatCurrency(totalGastado)}</p>
                  <p className="text-[11px] text-emerald-500/60 mt-0.5">pedidos cerrado · pagado</p>
                </div>
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/8 px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400/70 mb-1">Total rechazado</p>
                  <p className="text-xl font-black text-rose-300">{formatCurrency(totalRechazado)}</p>
                  <p className="text-[11px] text-rose-500/60 mt-0.5">pedidos rechazados</p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">
                  Historial de pedidos ({drawerOrders.length})
                </h3>
                {drawerOrders.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">Este taller no tiene pedidos todavía.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {drawerOrders.map((order: Order) => {
                      const total = orderTotal(order);
                      return (
                        <div
                          key={order.id}
                          onClick={() => router.push(`/admin/pedidos`)}
                          className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3.5 hover:border-zinc-700 hover:bg-zinc-900 transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-orange-400/80">
                                  #{formatVendorOrderLabel(order)}
                                </span>
                                <StatusBadge status={order.status} />
                              </div>
                              <p className="text-sm text-zinc-300 font-medium truncate">
                                {order.items?.[0]?.partName || 'Sin repuestos'}
                                {(order.items?.length ?? 0) > 1 && (
                                  <span className="text-zinc-500 ml-1">(+{order.items.length - 1})</span>
                                )}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {order.vehicleBrand} {order.vehicleModel} · {formatDate(order.updatedAt)}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              {total > 0 ? (
                                <p className="text-sm font-bold text-zinc-200">{formatCurrency(total)}</p>
                              ) : (
                                <p className="text-xs text-zinc-600">—</p>
                              )}
                              <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors">Ver →</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal confirmación de suspensión */}
      {showSuspendModal && suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-extrabold text-zinc-100 mb-1 tracking-tight">
              🔒 Inhabilitar acceso
            </h3>
            <p className="text-sm text-zinc-400 mb-5">
              ¿Inhabilitar el acceso del taller{' '}
              <span className="font-bold text-zinc-200">{suspendTarget.name}</span>?
              El taller no podrá ingresar hasta que lo reactives.
            </p>

            <div className="mb-5">
              <label className="block text-sm font-semibold text-zinc-300 mb-2">
                Motivo de inhabilitación <span className="text-zinc-500 font-normal">(opcional)</span>
              </label>
              <textarea
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                placeholder="Ej: inactividad prolongada, cuenta en revisión, etc."
                rows={3}
                className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm font-medium text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/30"
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setShowSuspendModal(false); setSuspendTarget(null); setSuspendReason(''); }}
                disabled={suspendLoading}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                loading={suspendLoading}
                onClick={handleConfirmSuspend}
                className="flex-1 bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30"
              >
                🔒 Inhabilitar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone = 'text-zinc-100' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-2 py-2.5 text-center">
      <div className={`text-base font-black tabular-nums ${tone}`}>{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mt-0.5">{label}</div>
    </div>
  );
}
