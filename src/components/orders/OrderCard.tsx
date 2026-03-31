'use client';

import { Order } from '@/lib/types';
import { StatusBadge, QualityBadge } from '@/components/ui/Badge';
import { formatRelativeTime, formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface OrderCardProps {
  order: Order;
  onClick?: () => void;
  showWorkshop?: boolean;
}

export function OrderCard({ order, onClick, showWorkshop = false }: OrderCardProps) {
  const totalItems = order.quote?.items.length ?? 0;
  const totalPrice = order.quote?.items.reduce((sum, item) => sum + item.price, 0) ?? 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 transition-all duration-300 shadow-sm relative overflow-hidden group',
        onClick && 'cursor-pointer hover:border-orange-500/40 hover:bg-zinc-800/50 hover:shadow-md hover:-translate-y-0.5',
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-4 relative z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">{order.id.split('-')[0]}-{order.id.split('-')[1]}</span>
            <StatusBadge status={order.status} />
          </div>
          <h3 className="font-bold text-zinc-100 text-base truncate tracking-tight group-hover:text-orange-400 transition-colors">{order.partName}</h3>
          <p className="text-sm font-medium text-zinc-400 mt-1">
            {order.vehicleBrand} {order.vehicleModel} <span className="text-zinc-500">· {order.vehicleYear}</span>
          </p>
          {showWorkshop && order.workshop && (
            <p className="text-xs font-semibold text-orange-500 mt-2 bg-orange-500/10 inline-flex items-center px-2 py-1 rounded-md border border-orange-500/20">🏭 {order.workshop.name}</p>
          )}
        </div>
        <QualityBadge quality={order.quality} />
      </div>

      {order.description && (
        <p className="text-sm text-zinc-500 line-clamp-2 mb-4 leading-relaxed font-medium relative z-10">{order.description}</p>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-zinc-800/80 relative z-10">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">{formatRelativeTime(order.updatedAt)}</span>
        <div className="flex items-center gap-4">
          {order.images.length > 0 && (
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5 bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-700/50">📷 {order.images.length}</span>
          )}
          {totalItems > 0 && (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              {totalItems} ítem{totalItems !== 1 ? 's' : ''} · {formatCurrency(totalPrice)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ORDER TABLE ROW (for vendor view) ────────────────────

interface OrderRowProps {
  order: Order;
  onClick?: () => void;
}

export function OrderTableRow({ order, onClick }: OrderRowProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-t border-zinc-800/50 transition-colors group',
        onClick && 'cursor-pointer hover:bg-zinc-800/40',
      )}
    >
      <td className="px-5 py-4">
        <span className="text-xs font-mono text-zinc-500 group-hover:text-zinc-400 transition-colors">{order.id.toUpperCase().slice(0, 8)}...</span>
      </td>
      <td className="px-5 py-4">
        <div className="font-bold text-sm text-zinc-100 group-hover:text-orange-400 transition-colors tracking-tight">{order.partName}</div>
        <div className="text-xs text-zinc-500 font-medium mt-0.5">{order.vehicleBrand} {order.vehicleModel} <span className="text-zinc-600">· {order.vehicleYear}</span></div>
      </td>
      <td className="px-5 py-4">
        {order.workshop && (
          <div className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><span className="text-[10px] grayscale opacity-50">🏭</span> {order.workshop.name}</div>
        )}
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-5 py-4">
        <QualityBadge quality={order.quality} />
      </td>
      <td className="px-5 py-4">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{formatRelativeTime(order.updatedAt)}</span>
      </td>
    </tr>
  );
}
