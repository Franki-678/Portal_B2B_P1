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
        'bg-[#1A1D27] border border-white/8 rounded-xl',
        hover && 'hover:border-orange-500/30 hover:bg-[#1e2130] transition-all duration-200 cursor-pointer',
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
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center text-lg flex-shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-semibold text-white text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
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

const colorMap: Record<string, string> = {
  orange: 'bg-orange-500/15 text-orange-400',
  blue: 'bg-blue-500/15 text-blue-400',
  green: 'bg-green-500/15 text-green-400',
  yellow: 'bg-yellow-500/15 text-yellow-400',
  red: 'bg-red-500/15 text-red-400',
  purple: 'bg-purple-500/15 text-purple-400',
  gray: 'bg-gray-500/15 text-gray-400',
};

export function MetricCard({ label, value, icon, color = 'orange', trend }: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-xl', colorMap[color])}>
          {icon}
        </div>
        {trend && <span className="text-xs text-slate-500">{trend}</span>}
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </Card>
  );
}
