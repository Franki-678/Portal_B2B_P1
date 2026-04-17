'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { getSupabaseClient } from '@/lib/supabase/client';
import { fetchVendorMetrics } from '@/lib/supabase/queries';
import { VendorPerformance, Order } from '@/lib/types';
import { formatCurrency, formatRelativeTime, cn } from '@/lib/utils';

// ─── Tipos locales ────────────────────────────────────────────

interface VendorProfile {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  assignedWorkshops: string[];
}

type SortKey = 'vendorName' | 'totalPedidos' | 'cotizados' | 'aprobados' | 'rechazados' | 'montoAprobado';

// ─── Helpers ──────────────────────────────────────────────────

function MetricPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-center', color)}>
      <div className="text-lg font-black">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-widest opacity-70 mt-0.5">{label}</div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────

export default function AdminVendedoresPage() {
  const [metrics, setMetrics] = useState<VendorPerformance[]>([]);
  const [profiles, setProfiles] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('montoAprobado');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Panel detalle
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [vendorOrders, setVendorOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Edición inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Carga inicial ─────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();

      const [metricsData, profilesData] = await Promise.all([
        fetchVendorMetrics(sb),
        (sb as any)
          .from('profiles')
          .select('id, name, role, phone, assigned_workshops')
          .in('role', ['vendedor', 'admin'])
          .order('name', { ascending: true })
          .then(({ data }: any) => (data ?? []) as VendorProfile[]),
      ]);

      setMetrics(metricsData);
      setProfiles(
        (profilesData as any[]).map((p: any) => ({
          id: p.id,
          name: p.name ?? '',
          role: p.role,
          phone: p.phone ?? null,
          email: null,
          assignedWorkshops: p.assigned_workshops ?? [],
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Cargar pedidos de un vendedor ─────────────────────────

  const loadVendorOrders = useCallback(async (vendorId: string) => {
    setOrdersLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data, error: err } = await (sb as any)
        .from('orders')
        .select('id, vehicle_brand, vehicle_model, vehicle_year, status, created_at, updated_at, workshop_order_number, workshop_id')
        .eq('assigned_vendor_id', vendorId)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (err) throw new Error(err.message);
      setVendorOrders(
        (data ?? []).map((r: any) => ({
          id: r.id,
          workshopId: r.workshop_id,
          vehicleBrand: r.vehicle_brand,
          vehicleModel: r.vehicle_model,
          vehicleVersion: '',
          vehicleYear: r.vehicle_year,
          workshopOrderNumber: r.workshop_order_number,
          assignedVendorId: vendorId,
          items: [],
          status: r.status,
          events: [],
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }))
      );
    } catch {
      setVendorOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const handleSelectVendor = (vendorId: string) => {
    if (selectedVendorId === vendorId) {
      setSelectedVendorId(null);
      return;
    }
    setSelectedVendorId(vendorId);
    void loadVendorOrders(vendorId);
  };

  // ── Guardar edición de perfil ─────────────────────────────

  const handleSaveProfile = async (vendorId: string) => {
    setSaving(true);
    try {
      const sb = getSupabaseClient();
      await (sb as any)
        .from('profiles')
        .update({ name: editName.trim(), phone: editPhone.trim() || null })
        .eq('id', vendorId);
      setProfiles(prev =>
        prev.map(p => p.id === vendorId ? { ...p, name: editName.trim(), phone: editPhone.trim() || null } : p)
      );
      setMetrics(prev =>
        prev.map(m => m.vendorId === vendorId ? { ...m, vendorName: editName.trim() } : m)
      );
      setEditingId(null);
    } catch (e) {
      alert('Error al guardar: ' + (e instanceof Error ? e.message : 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  // ── Tabla sorting ─────────────────────────────────────────

  const sortedMetrics = [...metrics].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1;
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'es') * dir;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(p => p === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir(key === 'vendorName' ? 'asc' : 'desc'); }
  };

  const Th = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' }) => (
    <th
      className={cn(
        'px-4 py-3 text-xs font-bold uppercase tracking-widest cursor-pointer select-none text-slate-500 hover:text-slate-300 transition-colors',
        align === 'right' ? 'text-right' : 'text-left'
      )}
      onClick={() => toggleSort(k)}
    >
      {label}{sortKey === k && <span className="ml-1 text-[10px]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </th>
  );

  // ── Render ────────────────────────────────────────────────

  const selectedMetric = metrics.find(m => m.vendorId === selectedVendorId);
  const selectedProfile = profiles.find(p => p.id === selectedVendorId);

  return (
    <>
      <TopBar
        title="Gestión de vendedores"
        subtitle="Rendimiento, perfiles y asignación de pedidos"
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            ↻ Actualizar
          </Button>
        }
      />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Panel izquierdo: tabla ── */}
        <div className={cn(
          'flex flex-col overflow-hidden border-r border-slate-800 transition-all duration-200',
          selectedVendorId ? 'w-full lg:w-[55%] xl:w-[60%]' : 'w-full'
        )}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
                <span>{error}</span>
                <Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40">
                    <Th label="Vendedor" k="vendorName" />
                    <Th label="Pedidos" k="totalPedidos" align="right" />
                    <Th label="Cotizados" k="cotizados" align="right" />
                    <Th label="Aprobados" k="aprobados" align="right" />
                    <Th label="Rechazados" k="rechazados" align="right" />
                    <Th label="Monto" k="montoAprobado" align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {loading && metrics.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">Cargando…</td></tr>
                  )}
                  {!loading && sortedMetrics.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">No hay vendedores con actividad.</td></tr>
                  )}
                  {sortedMetrics.map(v => {
                    const profile = profiles.find(p => p.id === v.vendorId);
                    const isSelected = selectedVendorId === v.vendorId;
                    return (
                      <tr
                        key={v.vendorId}
                        onClick={() => handleSelectVendor(v.vendorId)}
                        className={cn(
                          'cursor-pointer transition-colors group',
                          isSelected
                            ? 'bg-purple-500/10 border-l-2 border-l-purple-500'
                            : 'hover:bg-slate-800/40'
                        )}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold',
                              profiles.find(p => p.id === v.vendorId)?.role === 'admin'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            )}>
                              {(v.vendorName[0] || 'V').toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-100 group-hover:text-white transition-colors">
                                {v.vendorName}
                              </div>
                              {profile?.phone && (
                                <div className="text-[11px] text-slate-500">{profile.phone}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-300 font-semibold">{v.totalPedidos}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-yellow-400">{v.cotizados}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-emerald-400">{v.aprobados + v.aprobadosParcial}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-red-400">{v.rechazados}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-slate-100">{formatCurrency(v.montoAprobado)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vendedores en perfiles sin métricas aún */}
            {profiles.filter(p => !metrics.find(m => m.vendorId === p.id)).length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Sin actividad registrada</p>
                <div className="space-y-2">
                  {profiles
                    .filter(p => !metrics.find(m => m.vendorId === p.id))
                    .map(p => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectVendor(p.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                          selectedVendorId === p.id
                            ? 'border-purple-500/30 bg-purple-500/10'
                            : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                        )}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-xs font-bold text-slate-400">
                          {(p.name[0] || 'V').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-300">{p.name || 'Sin nombre'}</p>
                          <p className="text-[11px] text-slate-600">{p.role}</p>
                        </div>
                        <span className="ml-auto text-[11px] text-slate-600 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                          0 pedidos
                        </span>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Panel derecho: detalle ── */}
        {selectedVendorId && (
          <div className="hidden lg:flex flex-col w-[45%] xl:w-[40%] overflow-hidden bg-slate-950/40">
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Header del vendedor */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/10 text-xl font-black text-purple-400">
                    {((selectedProfile?.name || selectedMetric?.vendorName || 'V')[0]).toUpperCase()}
                  </div>
                  <div>
                    {editingId === selectedVendorId ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="text-lg font-bold text-white bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 w-48 focus:outline-none focus:border-purple-500"
                      />
                    ) : (
                      <p className="text-lg font-bold text-white">
                        {selectedProfile?.name || selectedMetric?.vendorName || 'Vendedor'}
                      </p>
                    )}
                    <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                      {selectedProfile?.role ?? 'vendedor'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {editingId === selectedVendorId ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveProfile(selectedVendorId)}
                        loading={saving}
                        className="text-xs"
                      >
                        Guardar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-xs">
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingId(selectedVendorId);
                        setEditName(selectedProfile?.name || selectedMetric?.vendorName || '');
                        setEditPhone(selectedProfile?.phone || '');
                      }}
                      className="text-xs"
                    >
                      ✏️ Editar
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedVendorId(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white transition"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Teléfono editable */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Teléfono</p>
                {editingId === selectedVendorId ? (
                  <input
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    placeholder="Ej: 1155551234"
                    className="text-sm text-white bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 w-full focus:outline-none focus:border-purple-500"
                  />
                ) : (
                  <p className="text-sm font-semibold text-slate-200">
                    {selectedProfile?.phone || <span className="text-slate-600 italic">Sin teléfono registrado</span>}
                  </p>
                )}
              </div>

              {/* Métricas de performance */}
              {selectedMetric && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Rendimiento total</p>
                  <div className="grid grid-cols-3 gap-2">
                    <MetricPill label="Total" value={selectedMetric.totalPedidos}
                      color="border-slate-700 text-slate-200 bg-slate-800/60" />
                    <MetricPill label="Cotizados" value={selectedMetric.cotizados}
                      color="border-yellow-500/20 text-yellow-400 bg-yellow-500/5" />
                    <MetricPill label="Aprobados" value={selectedMetric.aprobados + selectedMetric.aprobadosParcial}
                      color="border-emerald-500/20 text-emerald-400 bg-emerald-500/5" />
                    <MetricPill label="En revisión" value={selectedMetric.enRevision}
                      color="border-sky-500/20 text-sky-400 bg-sky-500/5" />
                    <MetricPill label="Rechazados" value={selectedMetric.rechazados}
                      color="border-red-500/20 text-red-400 bg-red-500/5" />
                    <MetricPill label="Cerrados" value={selectedMetric.cerrados}
                      color="border-blue-500/20 text-blue-400 bg-blue-500/5" />
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70 mb-1">Monto aprobado</p>
                    <p className="text-2xl font-black text-emerald-400">{formatCurrency(selectedMetric.montoAprobado)}</p>
                  </div>
                </div>
              )}

              {/* Últimos pedidos del vendedor */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  Últimos pedidos asignados
                </p>
                {ordersLoading ? (
                  <div className="text-sm text-slate-500 text-center py-4">Cargando pedidos…</div>
                ) : vendorOrders.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-600">
                    Sin pedidos asignados
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {vendorOrders.map(order => (
                      <div
                        key={order.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 hover:bg-slate-800/40 transition-colors"
                      >
                        <StatusBadge status={order.status} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-200 truncate">
                            {order.vehicleBrand} {order.vehicleModel} {order.vehicleYear}
                          </p>
                        </div>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {formatRelativeTime(order.updatedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
