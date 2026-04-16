'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { fetchVendorMetrics } from '@/lib/supabase/queries';
import { VendorPerformance } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

type SortKey =
  | 'vendorName'
  | 'totalPedidos'
  | 'cotizados'
  | 'aprobados'
  | 'rechazados'
  | 'montoAprobado';

export default function AdminVendoresPage() {
  const [vendors, setVendors] = useState<VendorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('montoAprobado');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      setVendors(await fetchVendorMetrics(sb));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el rendimiento.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedVendors = [...vendors].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'es') * dir;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'vendorName' ? 'asc' : 'desc');
    }
  };

  const header = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => (
    <th
      className={`px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none cursor-pointer select-none hover:text-zinc-300 ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => toggleSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === key && <span className="text-[10px]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
      </span>
    </th>
  );

  return (
    <>
      <TopBar
        title="Rendimiento por vendedor"
        subtitle="Pedidos atendidos, cotizaciones y monto aprobado."
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Actualizar
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{error}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-zinc-800/80 bg-zinc-950/30">
                {header('Vendedor', 'vendorName', 'left')}
                {header('Pedidos', 'totalPedidos', 'right')}
                {header('Cotizados', 'cotizados', 'right')}
                {header('Aprobados', 'aprobados', 'right')}
                {header('Rechazados', 'rechazados', 'right')}
                {header('Monto aprobado', 'montoAprobado', 'right')}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading && vendors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-zinc-500">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && sortedVendors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-zinc-500">
                    No hay vendedores registrados con actividad.
                  </td>
                </tr>
              )}
              {sortedVendors.map(v => (
                <tr key={v.vendorId} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-5 py-4 text-zinc-100 font-semibold">{v.vendorName}</td>
                  <td className="px-5 py-4 text-right text-zinc-300 font-mono">{v.totalPedidos}</td>
                  <td className="px-5 py-4 text-right text-indigo-300 font-mono">{v.cotizados}</td>
                  <td className="px-5 py-4 text-right text-emerald-300 font-mono">
                    {v.aprobados + v.aprobadosParcial}
                  </td>
                  <td className="px-5 py-4 text-right text-rose-300 font-mono">{v.rechazados}</td>
                  <td className="px-5 py-4 text-right text-zinc-100 font-bold">
                    {formatCurrency(v.montoAprobado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
