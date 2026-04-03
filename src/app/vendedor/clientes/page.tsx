'use client';

import { useDataStore } from '@/contexts/DataStoreContext';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import type { Order } from '@/lib/types';

export default function VendedorClientesPage() {
  const { getAllOrders, getAllWorkshops, loadError, refreshOrders, isLoading } = useDataStore();
  const orders = getAllOrders();
  const workshopsData = getAllWorkshops();

  const workshops = workshopsData.map((ws: any) => {
    const wsOrders = orders.filter((o: Order) => o.workshopId === ws.id);
    return {
      id: ws.id,
      name: ws.name,
      contactName: ws.contact_name || ws.name,
      address: ws.address || 'Sin dirección',
      phone: ws.phone || 'Sin teléfono',
      email: ws.email,
      createdAt: ws.created_at,
      totalOrders: wsOrders.length,
      pendingOrders: wsOrders.filter((o: Order) => o.status === 'pendiente' || o.status === 'en_revision').length,
      approvedOrders: wsOrders.filter((o: Order) => o.status === 'aprobado' || o.status === 'aprobado_parcial').length,
      lastOrder: wsOrders.sort((a: Order, b: Order) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    };
  });

  return (
    <>
      <TopBar
        title="Clientes / Talleres"
        subtitle={`${workshops.length} talleres registrados`}
      />

      <div className="p-6 space-y-6">
        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>No se pudieron cargar los talleres: {loadError}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => refreshOrders()}>
              Reintentar
            </Button>
          </div>
        )}

        {!isLoading && !loadError && workshops.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 bg-[#1A1D27] border border-white/8 rounded-xl text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 text-2xl">🏭</div>
            <h3 className="text-lg font-bold text-white mb-2">No hay talleres registrados todavía</h3>
            <p className="text-zinc-500 max-w-sm mb-6">Aún no hay clientes vinculados a este portal.</p>
          </div>
        )}

        {!loadError && workshops.length > 0 && (
          <div className="grid md:grid-cols-2 gap-5">
            {workshops.map(ws => (
              <div key={ws.id} className="bg-[#1A1D27] border border-white/8 rounded-xl p-5 hover:border-orange-500/25 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-xl">
                      🏭
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{ws.name}</h3>
                      <p className="text-xs text-slate-500">{ws.contactName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Desde</div>
                    <div className="text-xs text-slate-400">{formatDate(ws.createdAt)}</div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>📍</span> {ws.address}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>📞</span> {ws.phone}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>📧</span> {ws.email}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/8">
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">{ws.totalOrders}</div>
                    <div className="text-xs text-slate-500">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-yellow-400">{ws.pendingOrders}</div>
                    <div className="text-xs text-slate-500">Activos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">{ws.approvedOrders}</div>
                    <div className="text-xs text-slate-500">Aprobados</div>
                  </div>
                </div>

                {ws.lastOrder && (
                  <div className="mt-3 pt-3 border-t border-white/5 text-xs text-slate-500">
                    Último pedido: <span className="text-slate-400">{ws.lastOrder.items?.[0]?.partName || 'Sin repuestos'}</span> · {formatDate(ws.lastOrder.createdAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
