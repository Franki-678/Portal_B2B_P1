'use client';

import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar } from '@/components/ui/Layout';
import { formatDate, digitsOnlyPhone } from '@/lib/utils';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import type { Order } from '@/lib/types';

export default function AdminClientesPage() {
  const { getAllOrders, getAllWorkshops } = useDataStore();
  const orders = getAllOrders();
  const workshops = getAllWorkshops().map((workshop: any) => {
    const workshopOrders = orders.filter((order: Order) => order.workshopId === workshop.id);
    return {
      ...workshop,
      totalOrders: workshopOrders.length,
      activeOrders: workshopOrders.filter((order: Order) => ['pendiente', 'en_revision', 'cotizado'].includes(order.status)).length,
      approvedOrders: workshopOrders.filter((order: Order) => order.status === 'aprobado' || order.status === 'aprobado_parcial').length,
      lastOrder: [...workshopOrders].sort(
        (a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0],
    };
  });

  return (
    <>
      <TopBar
        title="Clientes y talleres"
        subtitle={`${workshops.length} talleres visibles en la operación`}
      />

      <div className="grid gap-5 p-6 md:grid-cols-2 xl:grid-cols-3">
        {workshops.map(workshop => (
          <div
            key={workshop.id}
            className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-xl">
                    🏭
                  </div>
                  <div>
                    <h2 className="font-semibold text-zinc-100">{workshop.name}</h2>
                    <p className="text-xs text-zinc-500">{workshop.contact_name || 'Sin contacto'}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-zinc-400">
                  <p>📍 {workshop.address || 'Sin dirección'}</p>
                  <p className="flex items-center gap-2">
                    <span>📞 {workshop.phone || 'Sin teléfono'}</span>
                    {digitsOnlyPhone(workshop.phone || '').length >= 8 && (
                      <WhatsAppLink phone={workshop.phone} message="Hola, te contacto desde administración." />
                    )}
                  </p>
                  <p>📧 {workshop.email || 'Sin email'}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-right">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Alta</div>
                <div className="text-xs text-zinc-300">{formatDate(workshop.created_at)}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-zinc-800 pt-4">
              <Stat label="Total" value={workshop.totalOrders} />
              <Stat label="Activos" value={workshop.activeOrders} tone="text-amber-300" />
              <Stat label="Aprob." value={workshop.approvedOrders} tone="text-emerald-300" />
            </div>

            {workshop.lastOrder && (
              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400">
                Ultimo pedido: <span className="font-medium text-zinc-200">{workshop.lastOrder.items?.[0]?.partName || 'Sin repuestos'}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, tone = 'text-zinc-100' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-center">
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
    </div>
  );
}
