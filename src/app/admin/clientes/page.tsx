'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDataStore } from '@/contexts/DataStoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate, digitsOnlyPhone, formatCurrency, quoteLineTotal, formatVendorOrderLabel } from '@/lib/utils';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { getSupabaseClient } from '@/lib/supabase/client';
import { reactivateWorkshop, suspendWorkshop } from '@/lib/supabase/queries';
import type { Order } from '@/lib/types';

type WorkshopStatus = 'active' | 'suspended' | 'pending_reactivation';
type Tab = 'activos' | 'inhabilitados';

function orderTotal(order: Order): number {
  return (order.quote?.items ?? []).reduce((a, i) => a + quoteLineTotal(i), 0);
}

function getDaysInactive(v: string | null | undefined): number | null {
  if (!v) return null;
  return Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function AdminClientesPage() {
  const { getAllOrders, getAllWorkshops, refreshData } = useDataStore();
  const { user } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('activos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  // Suspend modal
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);

  const handleReactivate = useCallback(async (id: string) => {
    setReactivatingId(id);
    const ok = await reactivateWorkshop(getSupabaseClient(), id);
    setReactivatingId(null);
    if (ok) await refreshData({ forceWorkshops: true, silent: true });
    else alert('No se pudo rehabilitar. Intentá de nuevo.');
  }, [refreshData]);

  const handleConfirmSuspend = async () => {
    if (!suspendTarget || !user) return;
    setSuspendLoading(true);
    const ok = await suspendWorkshop(getSupabaseClient(), suspendTarget.id, suspendReason, user.id, user.name);
    setSuspendLoading(false);
    if (ok) {
      setSuspendTarget(null);
      setSuspendReason('');
      await refreshData({ forceWorkshops: true, silent: true });
    } else {
      alert('No se pudo inhabilitar. Intentá de nuevo.');
    }
  };

  // ── Datos ──────────────────────────────────────────────────
  const orders = getAllOrders();
  const all = getAllWorkshops().map((ws: any) => {
    const wsOrders = orders.filter((o: Order) => o.workshopId === ws.id);
    const sorted = [...wsOrders].sort((a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return {
      ...ws,
      workshopStatus: (ws.status ?? 'active') as WorkshopStatus,
      daysInactive: getDaysInactive(ws.last_active_at),
      totalOrders: wsOrders.length,
      activeOrders: wsOrders.filter((o: Order) => ['pendiente', 'en_revision', 'cotizado'].includes(o.status)).length,
      approvedOrders: wsOrders.filter((o: Order) => ['aprobado', 'aprobado_parcial'].includes(o.status)).length,
      lastOrder: sorted[0] as Order | undefined,
      allOrders: sorted,
    };
  });

  const activos = all.filter((w: any) => w.workshopStatus === 'active');
  const inhabilitados = [
    ...all.filter((w: any) => w.workshopStatus === 'pending_reactivation'),
    ...all.filter((w: any) => w.workshopStatus === 'suspended'),
  ];
  const solicitanCount = inhabilitados.filter((w: any) => w.workshopStatus === 'pending_reactivation').length;
  const alertCount = activos.filter((w: any) => w.daysInactive !== null && w.daysInactive >= 7).length;

  const selectedWorkshop = selectedId ? all.find((w: any) => w.id === selectedId) ?? null : null;
  const drawerOrders: Order[] = selectedWorkshop?.allOrders ?? [];
  const totalGastado = drawerOrders.filter((o: Order) => o.status === 'cerrado_pagado').reduce((a: number, o: Order) => a + orderTotal(o), 0);
  const totalRechazado = drawerOrders.filter((o: Order) => o.status === 'rechazado').reduce((a: number, o: Order) => a + orderTotal(o), 0);

  const tabContent = tab === 'activos' ? activos : inhabilitados;

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      <TopBar
        title="Clientes y talleres"
        subtitle={alertCount > 0
          ? `${all.length} talleres · ${alertCount} con inactividad >7d`
          : `${all.length} talleres en la operación`}
      />

      {/* ── TABS ── */}
      <div className="flex items-end gap-0 px-6 pt-5 border-b border-zinc-800/80">
        <TabButton
          label={`Activos (${activos.length})`}
          active={tab === 'activos'}
          onClick={() => { setTab('activos'); setSelectedId(null); }}
        />
        <TabButton
          label={`Inhabilitados (${inhabilitados.length})`}
          active={tab === 'inhabilitados'}
          badge={solicitanCount > 0 ? `⚡ ${solicitanCount}` : undefined}
          onClick={() => { setTab('inhabilitados'); setSelectedId(null); }}
        />
      </div>

      {/* ── GRID ── */}
      <div className="p-6">
        {tabContent.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
            <p className="text-sm text-zinc-500">
              {tab === 'activos' ? 'No hay talleres activos.' : 'No hay talleres inhabilitados.'}
            </p>
          </div>
        )}

        {tab === 'inhabilitados' && inhabilitados.length > 0 && (
          <p className="text-xs text-zinc-500 mb-4">
            {inhabilitados.length} talleres inhabilitados
            {solicitanCount > 0 && <span className="text-cyan-400 font-semibold"> · ⚡ {solicitanCount} solicitan rehabilitación</span>}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tab === 'activos' && activos.map((w: any) => (
            <ActiveCard
              key={w.id}
              workshop={w}
              isSelected={selectedId === w.id}
              onSelect={() => setSelectedId(w.id)}
              onSuspend={(id, name) => { setSuspendTarget({ id, name }); setSuspendReason(''); }}
            />
          ))}
          {tab === 'inhabilitados' && inhabilitados.map((w: any) => (
            <DisabledCard
              key={w.id}
              workshop={w}
              reactivatingId={reactivatingId}
              onReactivate={handleReactivate}
            />
          ))}
        </div>
      </div>

      {/* ── MODAL INHABILITAR ── */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-extrabold text-zinc-100 mb-1 tracking-tight">🔒 Inhabilitar acceso</h3>
            <p className="text-sm text-zinc-400 mb-5">
              ¿Inhabilitar el acceso de <span className="font-bold text-zinc-200">{suspendTarget.name}</span>?
              El taller no podrá ingresar hasta que lo reactives.
            </p>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-zinc-300 mb-2">
                Motivo <span className="text-zinc-500 font-normal">(opcional)</span>
              </label>
              <textarea
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                placeholder="Ej: falta de pago, inactividad prolongada..."
                rows={3}
                className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                disabled={suspendLoading}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-700 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={suspendLoading}
                onClick={handleConfirmSuspend}
                className="flex-1 rounded-xl border border-rose-500/40 bg-rose-600/20 px-4 py-2.5 text-sm font-bold text-rose-300 hover:bg-rose-600/30 transition-all disabled:opacity-50"
              >
                {suspendLoading ? 'Procesando...' : '🔒 Inhabilitar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DRAWER LATERAL ── */}
      {selectedWorkshop && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedId(null)} />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col">
            <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-6 py-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🏭</span>
                  <h2 className="text-base font-bold text-zinc-100">{selectedWorkshop.name}</h2>
                </div>
                <p className="text-xs text-zinc-500">{selectedWorkshop.contact_name || 'Sin contacto registrado'}</p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)}
                className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-all">
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
                    <p className="text-sm text-zinc-500">Sin pedidos registrados.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {drawerOrders.map((order: Order) => {
                      const total = orderTotal(order);
                      return (
                        <div key={order.id} onClick={() => router.push('/admin/pedidos')}
                          className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3.5 hover:border-zinc-700 hover:bg-zinc-900 transition-all cursor-pointer">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-orange-400/80">#{formatVendorOrderLabel(order)}</span>
                                <StatusBadge status={order.status} />
                              </div>
                              <p className="text-sm text-zinc-300 font-medium truncate">
                                {order.items?.[0]?.partName || 'Sin repuestos'}
                                {(order.items?.length ?? 0) > 1 && <span className="text-zinc-500 ml-1">(+{order.items.length - 1})</span>}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5">{order.vehicleBrand} {order.vehicleModel} · {formatDate(order.updatedAt)}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              {total > 0 ? <p className="text-sm font-bold text-zinc-200">{formatCurrency(total)}</p> : <p className="text-xs text-zinc-600">—</p>}
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────

function TabButton({ label, active, badge, onClick }: {
  label: string;
  active: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 pb-3 pt-1 text-sm font-semibold transition-colors ${
        active
          ? 'text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-cyan-400 after:rounded-t'
          : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
      {badge && (
        <span className="rounded-full bg-cyan-500/20 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-black text-cyan-300">
          {badge}
        </span>
      )}
    </button>
  );
}

function ActiveCard({ workshop, isSelected, onSelect, onSuspend }: {
  workshop: any;
  isSelected: boolean;
  onSelect: () => void;
  onSuspend: (id: string, name: string) => void;
}) {
  const last: Order | undefined = workshop.lastOrder;
  const lastTotal = last ? orderTotal(last) : 0;
  const days = workshop.daysInactive as number | null;
  const showBanner = days !== null && days >= 7;
  const bannerStyle = days !== null && days >= 30
    ? { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-300', icon: '🔴' }
    : days !== null && days >= 14
    ? { border: 'border-orange-500/35', bg: 'bg-orange-500/8', text: 'text-orange-300', icon: '🟠' }
    : { border: 'border-amber-500/30', bg: 'bg-amber-500/8', text: 'text-amber-300', icon: '⏰' };

  return (
    <div
      onClick={onSelect}
      className={`group rounded-2xl border bg-zinc-900/60 p-5 cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'border-orange-500/30 bg-orange-500/5 shadow-md shadow-orange-500/5'
          : 'border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90 hover:shadow-md hover:shadow-black/20'
      }`}
    >
      {/* Banner inactividad con botón inhabilitar */}
      {showBanner && (
        <div className={`flex items-center justify-between gap-2 mb-3 rounded-xl border px-3 py-2 ${bannerStyle.border} ${bannerStyle.bg}`}>
          <p className={`text-xs font-bold ${bannerStyle.text}`}>
            {bannerStyle.icon} Inactivo hace {days} días
          </p>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onSuspend(workshop.id, workshop.name); }}
            className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-all"
          >
            🔒 Inhabilitar
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-lg group-hover:border-zinc-700 transition-colors">🏭</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-zinc-100 text-sm truncate group-hover:text-white transition-colors">{workshop.name}</h2>
            {workshop.taller_number && (
              <span className="shrink-0 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-400">
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

      {/* Contacto */}
      <div className="space-y-1 text-[12px] text-zinc-500 mb-4">
        {workshop.address && <p className="truncate">📍 {workshop.address}</p>}
        <p className="flex items-center gap-1.5">
          <span className="truncate">📞 {workshop.phone || 'Sin teléfono'}</span>
          {digitsOnlyPhone(workshop.phone || '').length >= 8 && (
            <WhatsAppLink phone={workshop.phone} message="Hola, te contacto desde administración." />
          )}
        </p>
        {workshop.email && <p className="truncate">📧 {workshop.email}</p>}
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
          <span className="font-mono font-bold text-orange-400/80 shrink-0">#{formatVendorOrderLabel(last)}</span>
          {lastTotal > 0 && <span className="text-zinc-300 font-semibold shrink-0">{formatCurrency(lastTotal)}</span>}
          <div className="ml-auto shrink-0"><StatusBadge status={last.status} /></div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-800/60 px-3 py-2 text-[11px] text-zinc-600">
          Sin pedidos registrados
        </div>
      )}
    </div>
  );
}

function DisabledCard({ workshop, reactivatingId, onReactivate }: {
  workshop: any;
  reactivatingId: string | null;
  onReactivate: (id: string) => void;
}) {
  const isPending = workshop.workshopStatus === 'pending_reactivation';
  const loading = reactivatingId === workshop.id;

  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${
      isPending ? 'border-cyan-500/25 bg-cyan-500/5' : 'border-zinc-800/60 bg-zinc-900/40'
    }`}>
      {/* Badge estado + botón rehabilitar */}
      <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
        isPending ? 'border-cyan-500/30 bg-cyan-500/8' : 'border-rose-500/30 bg-rose-500/8'
      }`}>
        <div className="min-w-0">
          <p className={`text-xs font-bold ${isPending ? 'text-cyan-300' : 'text-rose-300'}`}>
            {isPending ? '⏰ Auto-inhabilitado (30+ días sin actividad)' : '🔒 Inhabilitado manualmente'}
          </p>
          {isPending && <p className="text-[10px] text-cyan-400/70 font-semibold mt-0.5">⚡ Solicita rehabilitación</p>}
          {!isPending && workshop.suspended_reason && (
            <p className="text-[10px] text-rose-400/70 italic mt-0.5">Motivo: {workshop.suspended_reason}</p>
          )}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => onReactivate(workshop.id)}
          className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1.5 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/25 transition-all disabled:opacity-50"
        >
          {loading ? '...' : '✅ Rehabilitar'}
        </button>
      </div>

      {/* Auditoría inhabilitación */}
      {!isPending && workshop.suspended_by_name && (
        <p className="text-[11px] text-zinc-500">
          Por: <span className="text-zinc-300">{workshop.suspended_by_name}</span>
          {workshop.suspended_at && <span> · {formatDate(workshop.suspended_at)}</span>}
        </p>
      )}

      {/* Datos básicos */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-sm">🏭</div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-bold text-zinc-300 text-sm truncate">{workshop.name}</h3>
            {workshop.taller_number && (
              <span className="shrink-0 rounded border border-zinc-700/50 bg-zinc-800/60 px-1 text-[9px] font-mono font-bold text-zinc-500">
                #{String(workshop.taller_number).padStart(2, '0')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-600">{workshop.email || workshop.phone || 'Sin contacto'}</p>
        </div>
      </div>
    </div>
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
