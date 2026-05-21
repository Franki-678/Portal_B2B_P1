'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/FormFields';
import { getSupabaseClient } from '@/lib/supabase/client';
import { fetchVendorMetrics } from '@/lib/supabase/queries';
import { VendorPerformance } from '@/lib/types';
import { formatCurrency, formatRelativeTime, cn } from '@/lib/utils';

// ─── Tipos locales ────────────────────────────────────────────

interface VendorProfile {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  telegramUsername: string | null;
  assignedWorkshops: string[];
}

/** Fila enriquecida del panel de pedidos del vendedor */
interface VendorOrderRow {
  id: string;
  workshopId: string;
  workshopName: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  workshopOrderNumber: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  montoAprobado: number;
}

type SortKey = 'vendorName' | 'totalPedidos' | 'cotizados' | 'aprobados' | 'rechazados' | 'montoAprobado';

const ORDER_STATUS_OPTIONS = [
  { value: 'pendiente',        label: 'Pendiente' },
  { value: 'en_revision',      label: 'En revisión' },
  { value: 'cotizado',         label: 'Cotizado' },
  { value: 'aprobado',         label: 'Aprobado' },
  { value: 'aprobado_parcial', label: 'Aprobado parcial' },
  { value: 'rechazado',        label: 'Rechazado' },
  { value: 'cerrado',          label: 'Cerrado' },
  { value: 'cerrado_pagado',   label: 'Cerrado · Pagado' },
];

// ─── Helpers ──────────────────────────────────────────────────

function MetricPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-center', color)}>
      <div className="text-lg font-black">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-widest opacity-70 mt-0.5">{label}</div>
    </div>
  );
}

const selectCls =
  'h-8 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 text-xs text-zinc-200 ' +
  'focus:outline-none focus:border-orange-500 transition-colors appearance-none cursor-pointer ' +
  'hover:border-zinc-600';

// ─── Componente principal ─────────────────────────────────────

export default function AdminVendedoresPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<VendorPerformance[]>([]);
  const [profiles, setProfiles] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('montoAprobado');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Panel detalle
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [vendorOrders, setVendorOrders] = useState<VendorOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Filtros del panel de pedidos
  const [workshopFilter, setWorkshopFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  // Edición inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal: Nuevo Vendedor
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTempPassword, setNewTempPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Modal: Baja lógica de vendedor
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
          .select('id, name, role, phone, email, telegram_username, assigned_workshops')
          .in('role', ['vendedor', 'admin'])
          .is('deleted_at', null)
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
          email: p.email ?? null,
          telegramUsername: p.telegram_username ?? null,
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

  // ── Cargar pedidos de un vendedor (con taller + monto) ────

  const loadVendorOrders = useCallback(async (vendorId: string) => {
    setOrdersLoading(true);
    try {
      const sb = getSupabaseClient();

      // 1. Pedidos básicos
      const { data: ordersData, error: err } = await (sb as any)
        .from('orders')
        .select('id, vehicle_brand, vehicle_model, vehicle_year, status, created_at, updated_at, workshop_order_number, workshop_id')
        .eq('assigned_vendor_id', vendorId)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (err) throw new Error(err.message);
      const rows: any[] = ordersData ?? [];

      // 2. Nombres de talleres + cotizaciones (en paralelo)
      const workshopIds = [...new Set(rows.map((r: any) => r.workshop_id).filter(Boolean))];
      const orderIds   = rows.map((r: any) => r.id);

      const [workshopsRes, quotesRes] = await Promise.all([
        workshopIds.length === 0
          ? Promise.resolve({ data: [] })
          : (sb as any).from('workshops').select('id, name').in('id', workshopIds),
        orderIds.length === 0
          ? Promise.resolve({ data: [] })
          : (sb as any).from('quotes').select('id, order_id').in('order_id', orderIds),
      ]);

      const workshopMap: Record<string, string> = {};
      for (const w of (workshopsRes.data ?? [])) {
        workshopMap[w.id] = w.name;
      }

      // 3. Quote_items aprobados para calcular monto
      const quoteIdList: string[] = (quotesRes.data ?? []).map((q: any) => q.id);
      const quoteOrderMap: Record<string, string> = {};
      for (const q of (quotesRes.data ?? [])) quoteOrderMap[q.id] = q.order_id;

      const amountByOrder: Record<string, number> = {};
      if (quoteIdList.length > 0) {
        const { data: qiData } = await (sb as any)
          .from('quote_items')
          .select('quote_id, price, quantity_offered')
          .in('quote_id', quoteIdList)
          .eq('approved', true);

        for (const qi of (qiData ?? [])) {
          const oid = quoteOrderMap[qi.quote_id];
          if (oid) {
            amountByOrder[oid] =
              (amountByOrder[oid] ?? 0) + Number(qi.price) * (Number(qi.quantity_offered) || 1);
          }
        }
      }

      setVendorOrders(
        rows.map((r: any): VendorOrderRow => ({
          id:                  r.id,
          workshopId:          r.workshop_id ?? '',
          workshopName:        workshopMap[r.workshop_id] ?? '—',
          vehicleBrand:        r.vehicle_brand,
          vehicleModel:        r.vehicle_model,
          vehicleYear:         r.vehicle_year,
          workshopOrderNumber: r.workshop_order_number ?? null,
          status:              r.status,
          createdAt:           r.created_at,
          updatedAt:           r.updated_at,
          montoAprobado:       amountByOrder[r.id] ?? 0,
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
    // Reset filters on vendor change
    setWorkshopFilter('');
    setStatusFilter('');
    setAmountMin('');
    setAmountMax('');
    void loadVendorOrders(vendorId);
  };

  // ── Filtros derivados ─────────────────────────────────────

  const uniqueWorkshops = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of vendorOrders) {
      if (o.workshopId && o.workshopName && o.workshopName !== '—') {
        map.set(o.workshopId, o.workshopName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [vendorOrders]);

  const filteredOrders = useMemo(() => {
    const minAmt = amountMin !== '' ? Number(amountMin) : null;
    const maxAmt = amountMax !== '' ? Number(amountMax) : null;
    return vendorOrders.filter(o => {
      if (workshopFilter && o.workshopId !== workshopFilter) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (minAmt !== null && o.montoAprobado < minAmt) return false;
      if (maxAmt !== null && o.montoAprobado > maxAmt) return false;
      return true;
    });
  }, [vendorOrders, workshopFilter, statusFilter, amountMin, amountMax]);

  const hasActiveFilters = workshopFilter || statusFilter || amountMin || amountMax;

  // ── Crear nuevo vendedor ──────────────────────────────────

  const handleCreateVendor = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    if (!newTempPassword.trim() || newTempPassword.trim().length < 8) {
      setCreateResult({ ok: false, msg: 'La contraseña temporal debe tener al menos 8 caracteres.' });
      return;
    }
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch('/api/create-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          phone: newPhone.trim() || undefined,
          tempPassword: newTempPassword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateResult({ ok: false, msg: data.error ?? 'Error al crear el vendedor.' });
      } else {
        setCreateResult({ ok: true, msg: data.message ?? 'Vendedor creado exitosamente.' });
        setNewName(''); setNewEmail(''); setNewPhone(''); setNewTempPassword('');
        setTimeout(() => {
          setShowNewVendor(false);
          setCreateResult(null);
          void load();
        }, 2000);
      }
    } catch (e) {
      setCreateResult({ ok: false, msg: e instanceof Error ? e.message : 'Error desconocido.' });
    } finally {
      setCreating(false);
    }
  };

  // ── Guardar edición de perfil ─────────────────────────────

  const handleSaveProfile = async (vendorId: string) => {
    setSaving(true);
    try {
      const sb = getSupabaseClient();
      // Normalizar telegram_username: sacar @, espacios y guardar null si está vacío.
      const cleanTelegram = editTelegram.trim().replace(/^@+/, '').trim();
      const telegramValue = cleanTelegram ? cleanTelegram : null;

      await (sb as any)
        .from('profiles')
        .update({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          telegram_username: telegramValue,
        })
        .eq('id', vendorId);
      setProfiles(prev =>
        prev.map(p => p.id === vendorId
          ? { ...p, name: editName.trim(), phone: editPhone.trim() || null, telegramUsername: telegramValue }
          : p)
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

  // ── Baja lógica de vendedor ────────────────────────────────

  const handleDeleteVendor = async () => {
    if (!selectedVendorId) return;
    setDeleteLoading(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await (sb as any)
        .from('profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', selectedVendorId);

      if (error) throw new Error(error.message);

      // Actualizar estado local
      setProfiles(prev => prev.filter(p => p.id !== selectedVendorId));
      setMetrics(prev => prev.filter(m => m.vendorId !== selectedVendorId));
      setSelectedVendorId(null);
      setShowDeleteModal(false);
    } catch (e) {
      alert('Error al dar de baja: ' + (e instanceof Error ? e.message : 'desconocido'));
    } finally {
      setDeleteLoading(false);
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
        'px-4 py-3 text-xs font-bold uppercase tracking-widest cursor-pointer select-none text-zinc-500 hover:text-zinc-300 transition-colors',
        align === 'right' ? 'text-right' : 'text-left'
      )}
      onClick={() => toggleSort(k)}
    >
      {label}{sortKey === k && <span className="ml-1 text-[10px]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </th>
  );

  // ── Render ────────────────────────────────────────────────

  const selectedMetric  = metrics.find(m => m.vendorId === selectedVendorId);
  const selectedProfile = profiles.find(p => p.id === selectedVendorId);

  return (
    <>
      <TopBar
        title="Gestión de vendedores"
        subtitle="Rendimiento, perfiles y creación de cuentas"
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => { setShowNewVendor(true); setCreateResult(null); }}
              className="bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-md shadow-orange-500/20"
            >
              + Nuevo vendedor
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              ↻ Actualizar
            </Button>
          </div>
        }
      />

      {/* ── Modal: Nuevo Vendedor ── */}
      {showNewVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-100">Nuevo vendedor</h2>
              <button
                type="button"
                onClick={() => { setShowNewVendor(false); setCreateResult(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white transition"
              >✕</button>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-300 font-medium space-y-1">
              <p>🔑 Asigná una contraseña temporal. El vendedor <strong>deberá cambiarla</strong> en su primer inicio de sesión.</p>
            </div>
            <div className="space-y-4">
              <Input
                label="Nombre completo"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ej: Juan Pérez"
              />
              <Input
                label="Email"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="vendedor@empresa.com"
              />
              <Input
                label="Teléfono (opcional)"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="Ej: 1155551234"
              />
              <Input
                label="Contraseña temporal"
                type="password"
                value={newTempPassword}
                onChange={e => setNewTempPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                hint="El vendedor deberá cambiarla al primer login"
              />
            </div>
            {createResult && (
              <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                createResult.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}>
                {createResult.ok ? '✅ ' : '❌ '}{createResult.msg}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => { setShowNewVendor(false); setCreateResult(null); }}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => void handleCreateVendor()}
                loading={creating}
                disabled={!newName.trim() || !newEmail.trim() || newTempPassword.trim().length < 8}
                className="bg-orange-600 hover:bg-orange-500 text-white border-0"
              >
                Crear vendedor
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Panel izquierdo: tabla métricas ── */}
        <div className={cn(
          'flex flex-col overflow-hidden border-r border-zinc-800 transition-all duration-200',
          selectedVendorId ? 'w-full lg:w-[55%] xl:w-[60%]' : 'w-full'
        )}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
                <span>{error}</span>
                <Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>
              </div>
            )}

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/40">
                    <Th label="Vendedor"   k="vendorName" />
                    <Th label="Pedidos"    k="totalPedidos"  align="right" />
                    <Th label="Cotizados"  k="cotizados"     align="right" />
                    <Th label="Aprobados"  k="aprobados"     align="right" />
                    <Th label="Rechazados" k="rechazados"    align="right" />
                    <Th label="Monto"      k="montoAprobado" align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {loading && metrics.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm">Cargando…</td></tr>
                  )}
                  {!loading && sortedMetrics.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm">No hay vendedores con actividad.</td></tr>
                  )}
                  {sortedMetrics.map(v => {
                    const profile   = profiles.find(p => p.id === v.vendorId);
                    const isSelected = selectedVendorId === v.vendorId;
                    return (
                      <tr
                        key={v.vendorId}
                        onClick={() => handleSelectVendor(v.vendorId)}
                        className={cn(
                          'cursor-pointer transition-colors group',
                          isSelected
                            ? 'bg-orange-500/10 border-l-2 border-l-orange-500'
                            : 'hover:bg-zinc-800/40'
                        )}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs font-bold">
                              {(v.vendorName[0] || 'V').toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-zinc-100 group-hover:text-white transition-colors">
                                {v.vendorName}
                              </div>
                              {profile?.phone && (
                                <div className="text-[11px] text-zinc-500">{profile.phone}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-zinc-300 font-semibold">{v.totalPedidos}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-yellow-400">{v.cotizados}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-emerald-400">{v.aprobados + v.aprobadosParcial}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-red-400">{v.rechazados}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-zinc-100">{formatCurrency(v.montoAprobado)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vendedores sin métricas */}
            {profiles.filter(p => !metrics.find(m => m.vendorId === p.id)).length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Sin actividad registrada</p>
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
                            ? 'border-orange-500/20 bg-orange-500/10'
                            : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40'
                        )}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-bold text-zinc-400">
                          {(p.name[0] || 'V').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-300">{p.name || 'Sin nombre'}</p>
                          <p className="text-[11px] text-zinc-600">{p.role}</p>
                        </div>
                        <span className="ml-auto text-[11px] text-zinc-600 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700">
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

        {/* ── Panel derecho: detalle vendedor ── */}
        {selectedVendorId && (
          <div className="hidden lg:flex flex-col w-[45%] xl:w-[40%] overflow-hidden bg-zinc-950/40">
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-xl font-black text-orange-400">
                    {((selectedProfile?.name || selectedMetric?.vendorName || 'V')[0]).toUpperCase()}
                  </div>
                  <div>
                    {editingId === selectedVendorId ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="text-lg font-bold text-white bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 w-48 focus:outline-none focus:border-orange-500"
                      />
                    ) : (
                      <p className="text-lg font-bold text-white">
                        {selectedProfile?.name || selectedMetric?.vendorName || 'Vendedor'}
                      </p>
                    )}
                    <span className="text-xs font-semibold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                      {selectedProfile?.role ?? 'vendedor'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {editingId === selectedVendorId ? (
                    <>
                      <Button size="sm" onClick={() => void handleSaveProfile(selectedVendorId)} loading={saving} className="text-xs">
                        Guardar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-xs">
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingId(selectedVendorId);
                          setEditName(selectedProfile?.name || selectedMetric?.vendorName || '');
                          setEditPhone(selectedProfile?.phone || '');
                          setEditTelegram(selectedProfile?.telegramUsername || '');
                        }}
                        className="text-xs"
                      >
                        ✏️ Editar
                      </Button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteModal(true)}
                        className="h-8 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50 transition-all"
                        title="Dar de baja este vendedor"
                      >
                        🗑 Baja
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedVendorId(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white transition"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Email */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Email</p>
                <p className="text-sm font-semibold text-zinc-200 break-all">
                  {selectedProfile?.email || <span className="text-zinc-600 italic">No disponible</span>}
                </p>
              </div>

              {/* Teléfono */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Teléfono</p>
                {editingId === selectedVendorId ? (
                  <input
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    placeholder="Ej: 1155551234"
                    className="text-sm text-white bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 w-full focus:outline-none focus:border-orange-500"
                  />
                ) : (
                  <p className="text-sm font-semibold text-zinc-200">
                    {selectedProfile?.phone || <span className="text-zinc-600 italic">Sin teléfono registrado</span>}
                  </p>
                )}
              </div>

              {/* Telegram username */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1.5">
                  <span className="text-sky-400">✈️</span> Usuario de Telegram (opcional)
                </p>
                {editingId === selectedVendorId ? (
                  <>
                    <input
                      value={editTelegram}
                      onChange={e => setEditTelegram(e.target.value)}
                      placeholder="@juan_vendedor"
                      className="text-sm text-white bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 w-full focus:outline-none focus:border-sky-500"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1.5 italic">
                      El bot usará este usuario para etiquetar al vendedor en el grupo. Sin @ funciona igual.
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-sky-400">
                    {selectedProfile?.telegramUsername
                      ? `@${selectedProfile.telegramUsername}`
                      : <span className="text-zinc-600 italic font-normal">Sin usuario de Telegram</span>}
                  </p>
                )}
              </div>

              {/* Métricas */}
              {selectedMetric && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Rendimiento total</p>
                  <div className="grid grid-cols-3 gap-2">
                    <MetricPill label="Total"      value={selectedMetric.totalPedidos}
                      color="border-zinc-700 text-zinc-200 bg-zinc-800/60" />
                    <MetricPill label="Cotizados"  value={selectedMetric.cotizados}
                      color="border-yellow-500/20 text-yellow-400 bg-yellow-500/5" />
                    <MetricPill label="Aprobados"  value={selectedMetric.aprobados + selectedMetric.aprobadosParcial}
                      color="border-emerald-500/20 text-emerald-400 bg-emerald-500/5" />
                    <MetricPill label="En revisión" value={selectedMetric.enRevision}
                      color="border-sky-500/20 text-sky-400 bg-sky-500/5" />
                    <MetricPill label="Rechazados" value={selectedMetric.rechazados}
                      color="border-red-500/20 text-red-400 bg-red-500/5" />
                    <MetricPill label="Cerrados"   value={selectedMetric.cerrados}
                      color="border-blue-500/20 text-blue-400 bg-blue-500/5" />
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70 mb-1">Monto aprobado</p>
                    <p className="text-2xl font-black text-emerald-400">{formatCurrency(selectedMetric.montoAprobado)}</p>
                  </div>
                </div>
              )}

              {/* ── Pedidos asignados ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Pedidos asignados
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={() => { setWorkshopFilter(''); setStatusFilter(''); setAmountMin(''); setAmountMax(''); }}
                      className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors font-semibold"
                    >
                      ✕ Limpiar filtros
                    </button>
                  )}
                </div>

                {/* ── Filtros ── */}
                <div className="mb-3 flex flex-wrap gap-2">
                  {/* Taller */}
                  <select
                    value={workshopFilter}
                    onChange={e => setWorkshopFilter(e.target.value)}
                    className={cn(selectCls, 'flex-1 min-w-[130px]')}
                  >
                    <option value="">Todos los talleres</option>
                    {uniqueWorkshops.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>

                  {/* Estado */}
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className={cn(selectCls, 'flex-1 min-w-[120px]')}
                  >
                    <option value="">Todos los estados</option>
                    {ORDER_STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>

                  {/* Monto mín */}
                  <input
                    type="number"
                    min={0}
                    value={amountMin}
                    onChange={e => setAmountMin(e.target.value)}
                    placeholder="Monto mín."
                    className={cn(selectCls, 'w-24 placeholder:text-zinc-600')}
                  />

                  {/* Monto máx */}
                  <input
                    type="number"
                    min={0}
                    value={amountMax}
                    onChange={e => setAmountMax(e.target.value)}
                    placeholder="Monto máx."
                    className={cn(selectCls, 'w-24 placeholder:text-zinc-600')}
                  />
                </div>

                {/* Contador */}
                {hasActiveFilters && !ordersLoading && (
                  <p className="text-[11px] text-zinc-500 mb-2">
                    {filteredOrders.length} de {vendorOrders.length} pedidos
                  </p>
                )}

                {/* Lista */}
                {ordersLoading ? (
                  <div className="text-sm text-zinc-500 text-center py-4">Cargando pedidos…</div>
                ) : filteredOrders.length === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-600">
                    {hasActiveFilters ? 'Sin pedidos que coincidan con los filtros.' : 'Sin pedidos asignados.'}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredOrders.map(order => (
                      <div
                        key={order.id}
                        onClick={() => router.push(`/vendedor/pedidos/${order.id}`)}
                        className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 hover:bg-zinc-800/40 hover:border-zinc-700 transition-colors cursor-pointer group"
                      >
                        <StatusBadge status={order.status as any} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-200 truncate group-hover:text-white transition-colors">
                            {order.vehicleBrand} {order.vehicleModel} {order.vehicleYear}
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate">{order.workshopName}</p>
                        </div>
                        {order.montoAprobado > 0 && (
                          <span className="text-[11px] text-emerald-400 font-bold shrink-0 tabular-nums">
                            {formatCurrency(order.montoAprobado)}
                          </span>
                        )}
                        <span className="text-[11px] text-zinc-500 shrink-0">
                          {formatRelativeTime(order.updatedAt)}
                        </span>
                        <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors text-xs">→</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Confirmar baja lógica ── */}
      {showDeleteModal && selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-zinc-900 shadow-2xl shadow-black/60 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-2xl">
                ⚠️
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-100">¿Dar de baja a este vendedor?</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Se ocultará del sistema, pero se <span className="font-semibold text-zinc-200">conservará su historial de ventas y auditoría</span> completo.
                </p>
              </div>
            </div>

            {/* Perfil afectado */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-bold text-zinc-300">
                {(selectedProfile.name[0] || 'V').toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">{selectedProfile.name}</p>
                <p className="text-xs text-zinc-500">{selectedProfile.email ?? 'Sin email'}</p>
              </div>
            </div>

            {/* Advertencia */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-300 space-y-1">
              <p>📋 Sus pedidos históricos y eventos seguirán visibles con su nombre.</p>
              <p>📊 Sus KPIs no se descontarán de los rankings ni métricas.</p>
              <p>🔒 No podrá iniciar sesión ni aparecer en el selector de vendedores.</p>
            </div>

            {/* Acciones */}
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
              >
                Cancelar
              </Button>
              <button
                type="button"
                onClick={() => void handleDeleteVendor()}
                disabled={deleteLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-sm font-bold text-rose-300 hover:bg-rose-500/25 hover:border-rose-500/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? (
                  <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />Procesando…</>
                ) : (
                  <>🗑 Confirmar baja</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
