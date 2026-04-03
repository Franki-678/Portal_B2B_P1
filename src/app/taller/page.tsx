'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useDataStore } from '@/contexts/DataStoreContext';
import { MetricCard } from '@/components/ui/Card';
import { TopBar } from '@/components/ui/Layout';
import { OrderCard } from '@/components/orders/OrderCard';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { Order } from '@/lib/types';

export default function TallerDashboard() {
  const { user } = useAuth();
  const { getWorkshopOrders } = useDataStore();
  const router = useRouter();

  const orders = user?.workshopId ? getWorkshopOrders(user.workshopId) : [];

  const metrics = {
    total: orders.length,
    pendientes: orders.filter(o => o.status === 'pendiente').length,
    enRevision: orders.filter(o => o.status === 'en_revision').length,
    cotizados: orders.filter(o => o.status === 'cotizado').length,
    aprobados: orders.filter(o => o.status === 'aprobado' || o.status === 'aprobado_parcial').length,
    rechazados: orders.filter(o => o.status === 'rechazado').length,
  };

  const recent = [...orders]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  return (
    <>
      <TopBar
        title={`Buenos días, ${user?.name}`}
        subtitle="Resumen de tus pedidos activos"
        action={
          <Button onClick={() => router.push('/taller/pedidos/nuevo')}>
            ➕ Nuevo pedido
          </Button>
        }
      />

      <div className="p-6 space-y-8">
        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Total pedidos" value={metrics.total} icon="📋" color="gray" />
          <MetricCard label="Pendientes" value={metrics.pendientes} icon="⏳" color="yellow" />
          <MetricCard label="En revisión" value={metrics.enRevision} icon="🔍" color="blue" />
          <MetricCard label="Cotizados" value={metrics.cotizados} icon="💰" color="purple" />
          <MetricCard label="Aprobados" value={metrics.aprobados} icon="✅" color="green" />
          <MetricCard label="Rechazados" value={metrics.rechazados} icon="❌" color="red" />
        </div>

        {/* Acción rápida si hay pedidos cotizados */}
        {metrics.cotizados > 0 && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <span className="text-3xl drop-shadow-sm">💰</span>
              <div>
                <div className="text-base font-bold text-indigo-100 tracking-tight">
                  Tenés {metrics.cotizados} cotización{metrics.cotizados !== 1 ? 'es' : ''} para revisar
                </div>
                <div className="text-sm font-medium text-indigo-400/80 mt-0.5">Revisá y aprobá los presupuestos recibidos</div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/taller/pedidos')}
            >
              Ver pedidos →
            </Button>
          </div>
        )}

        {/* Pedidos recientes */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-zinc-100 tracking-tight">Pedidos recientes</h2>
            <Button variant="ghost" size="sm" onClick={() => router.push('/taller/pedidos')} className="text-zinc-400 hover:text-zinc-100">
              Ver todos →
            </Button>
          </div>

          {recent.length === 0 ? (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-12 text-center shadow-inner shadow-black/10">
              <div className="text-5xl mb-4 opacity-70 drop-shadow-md">📭</div>
              <h3 className="font-bold text-zinc-200 mb-2">Sin pedidos todavía</h3>
              <p className="text-sm text-zinc-500 mb-6 font-medium">Creá tu primer pedido para solicitar repuestos a proveedores</p>
              <Button onClick={() => router.push('/taller/pedidos/nuevo')}>
                ➕ Crear primer pedido
              </Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {recent.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  role="taller"
                  onClick={() => router.push(`/taller/pedidos/${order.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
