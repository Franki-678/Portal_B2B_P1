import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: string;
  className?: string;
}

export function Card({ children, className, onClick, hover = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-sm',
        hover && 'hover:border-orange-500/40 hover:bg-zinc-800/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between p-5 pb-0', className)}>
      <div className="flex items-center gap-4">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center text-xl flex-shrink-0 shadow-inner shadow-orange-500/10">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-bold text-zinc-100 tracking-tight">{title}</h3>
          {subtitle && <p className="text-sm text-zinc-400 mt-0.5 font-medium">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </div>
  );
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: string;
  color?: 'orange' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
  trend?: string;
}

const colorMap: Record<string, { bg: string, ring: string }> = {
  orange: { bg: 'bg-orange-500/10 text-orange-500', ring: 'ring-orange-500/20' },
  blue: { bg: 'bg-blue-500/10 text-blue-500', ring: 'ring-blue-500/20' },
  green: { bg: 'bg-emerald-500/10 text-emerald-500', ring: 'ring-emerald-500/20' },
  yellow: { bg: 'bg-amber-500/10 text-amber-500', ring: 'ring-amber-500/20' },
  red: { bg: 'bg-rose-500/10 text-rose-500', ring: 'ring-rose-500/20' },
  purple: { bg: 'bg-indigo-500/10 text-indigo-500', ring: 'ring-indigo-500/20' },
  gray: { bg: 'bg-zinc-500/10 text-zinc-400', ring: 'ring-zinc-500/20' },
};

export function MetricCard({ label, value, icon, color = 'orange', trend }: MetricCardProps) {
  const c = colorMap[color] || colorMap.orange;
  return (
    <Card className="p-5 flex flex-col justify-between overflow-hidden relative group">
      {/* Decorative background glow */}
      <div className={cn("absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-20 transition-opacity group-hover:opacity-40", c.bg.split(' ')[0])} />
      
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-xl ring-1 shadow-inner', c.bg, c.ring)}>
          {icon}
        </div>
        {trend && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-zinc-800 text-zinc-300">{trend}</span>}
      </div>
      <div className="relative z-10 mt-auto">
        <div className="text-3xl font-bold text-white tracking-tight leading-none mb-2">{value}</div>
        <div className="text-sm font-medium text-zinc-400">{label}</div>
      </div>
    </Card>
  );
}
