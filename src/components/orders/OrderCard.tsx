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
        'bg-[#1A1D27] border border-white/8 rounded-xl p-4 transition-all duration-200',
        onClick && 'cursor-pointer hover:border-orange-500/30 hover:bg-[#1e2130]',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wide">{order.id.split('-')[0]}-{order.id.split('-')[1]}</span>
            <StatusBadge status={order.status} />
          </div>
          <h3 className="font-semibold text-white text-sm truncate">{order.partName}</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {order.vehicleBrand} {order.vehicleModel} {order.vehicleYear}
          </p>
          {showWorkshop && order.workshop && (
            <p className="text-xs text-orange-400 mt-1">🏭 {order.workshop.name}</p>
          )}
        </div>
        <QualityBadge quality={order.quality} />
      </div>

      {order.description && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{order.description}</p>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-white/8">
        <span className="text-xs text-slate-500">{formatRelativeTime(order.updatedAt)}</span>
        <div className="flex items-center gap-3">
          {order.images.length > 0 && (
            <span className="text-xs text-slate-500">📷 {order.images.length}</span>
          )}
          {totalItems > 0 && (
            <span className="text-xs text-slate-400">
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
        'border-t border-white/5 transition-colors',
        onClick && 'cursor-pointer hover:bg-white/3',
      )}
    >
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-slate-500">{order.id.toUpperCase().slice(0, 10)}</span>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-white">{order.partName}</div>
        <div className="text-xs text-slate-400">{order.vehicleBrand} {order.vehicleModel} {order.vehicleYear}</div>
      </td>
      <td className="px-4 py-3">
        {order.workshop && (
          <div className="text-sm text-slate-300">{order.workshop.name}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-4 py-3">
        <QualityBadge quality={order.quality} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">
        {formatRelativeTime(order.updatedAt)}
      </td>
    </tr>
  );
}
