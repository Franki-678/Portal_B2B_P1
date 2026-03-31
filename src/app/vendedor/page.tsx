'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { MetricCard } from '@/components/ui/Card';
import { TopBar } from '@/components/ui/Layout';
import { OrderTableRow } from '@/components/orders/OrderCard';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

export default function VendedorDashboard() {
  const { user } = useAuth();
  const { getAllOrders } = useDataStore();
  const router = useRouter();

  const orders = getAllOrders();

  const metrics = {
    nuevos: orders.filter(o => o.status === 'pendiente').length,
    enRevision: orders.filter(o => o.status === 'en_revision').length,
    cotizados: orders.filter(o => o.status === 'cotizado').length,
    aprobados: orders.filter(o => o.status === 'aprobado' || o.status === 'aprobado_parcial').length,
    rechazados: orders.filter(o => o.status === 'rechazado').length,
    total: orders.length,
  };

  const urgent = orders.filter(o => o.status === 'pendiente').slice(0, 5);
  const recent = orders.slice(0, 8);

  return (
    <>
      <TopBar
        title={`Hola, ${user?.name}`}
        subtitle="Panel de administración · Vista general"
      />

      <div className="p-6 space-y-8">
        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Total pedidos" value={metrics.total} icon="📋" color="gray" />
          <MetricCard label="Nuevos" value={metrics.nuevos} icon="🆕" color="yellow" />
          <MetricCard label="En revisión" value={metrics.enRevision} icon="🔍" color="blue" />
          <MetricCard label="Cotizados" value={metrics.cotizados} icon="💰" color="purple" />
          <MetricCard label="Aprobados" value={metrics.aprobados} icon="✅" color="green" />
          <MetricCard label="Rechazados" value={metrics.rechazados} icon="❌" color="red" />
        </div>

        {/* Pedidos urgentes */}
        {urgent.length > 0 && (
          <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                ⚡ Pedidos sin respuesta
                <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs">
                  {urgent.length}
                </span>
              </h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/vendedor/pedidos?status=pendiente')}>
                Ver todos →
              </Button>
            </div>
            <div className="space-y-2">
              {urgent.map(order => (
                <div
                  key={order.id}
                  onClick={() => router.push(`/vendedor/pedidos/${order.id}`)}
                  className="flex items-center justify-between bg-[#0f1117] rounded-lg px-4 py-3 border border-white/5 hover:border-yellow-500/25 cursor-pointer transition-all"
                >
                  <div>
                    <span className="text-sm font-medium text-white">{order.partName}</span>
                    <span className="text-xs text-slate-400 ml-3">{order.workshop?.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{order.vehicleBrand} {order.vehicleModel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabla reciente */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Actividad reciente</h2>
            <Button variant="ghost" size="sm" onClick={() => router.push('/vendedor/pedidos')}>
              Ver todos →
            </Button>
          </div>
          <div className="bg-[#1A1D27] border border-white/8 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/8">
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">ID</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Repuesto</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Taller</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Calidad</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(order => (
                  <OrderTableRow
                    key={order.id}
                    order={order}
                    onClick={() => router.push(`/vendedor/pedidos/${order.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
