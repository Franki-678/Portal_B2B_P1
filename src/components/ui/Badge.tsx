import { OrderStatus, OrderQuality } from '@/lib/types';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, QUALITY_LABELS, QUALITY_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children?: React.ReactNode;
  className?: string;
}

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

interface QualityBadgeProps {
  quality: OrderQuality;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge className={cn(ORDER_STATUS_COLORS[status], className)}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function QualityBadge({ quality, className }: QualityBadgeProps) {
  return (
    <Badge className={cn(QUALITY_COLORS[quality], className)}>
      {QUALITY_LABELS[quality]}
    </Badge>
  );
}
