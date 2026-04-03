'use client';

import { OrderEvent, OrderStatus } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface OrderStatusTrackerProps {
  status: OrderStatus;
  events: OrderEvent[];
}

const STATUS_FLOW = [
  { key: 'pendiente', label: 'Pendiente', icon: '📝' },
  { key: 'en_revision', label: 'En revisión', icon: '🔍' },
  { key: 'cotizado', label: 'Cotizado', icon: '💰' },
  { key: 'resolve', label: 'Resolución', icon: '✅' }, // Puede ser aprobado/aprobado_parcial/rechazado
  { key: 'cerrado', label: 'Cerrado', icon: '🔒' },
];

export function OrderStatusTracker({ status, events }: OrderStatusTrackerProps) {
  // Mapping status to flow index
  const getStatusIndex = (st: OrderStatus): number => {
    switch (st) {
      case 'pendiente': return 0;
      case 'en_revision': return 1;
      case 'cotizado': return 2;
      case 'aprobado':
      case 'aprobado_parcial':
      case 'rechazado': return 3;
      case 'cerrado': return 4;
      default: return 0;
    }
  };

  const currentIndex = getStatusIndex(status);

  // Helper to find the relevant event timestamp for a step
  const getEventForStep = (stepIndex: number) => {
    // Ordenamos eventos desde el más reciente al más antiguo
    const sortedEvents = [...events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    switch (stepIndex) {
      case 0:
        return sortedEvents.find(e => e.action === 'pedido_creado');
      case 1:
        return sortedEvents.find(e => e.action === 'pedido_en_revision');
      case 2:
        return sortedEvents.find(e => e.action === 'cotizacion_enviada');
      case 3:
        return sortedEvents.find(e => ['cotizacion_aprobada', 'cotizacion_aprobada_parcial', 'cotizacion_rechazada'].includes(e.action));
      case 4:
        return sortedEvents.find(e => e.action === 'pedido_cerrado');
      default:
        return null;
    }
  };

  return (
    <div className="relative py-4">
      {/* Linea conectora de fondo (mobile: left, desktop: center) */}
      <div className="absolute left-6 md:left-[50%] top-6 bottom-6 w-0.5 bg-zinc-800 -translate-x-[1px]" />

      <div className="space-y-8 relative z-10">
        {STATUS_FLOW.map((step, idx) => {
          const isCompleted = idx < currentIndex || (idx === currentIndex && step.key === 'cerrado');
          const isCurrent = idx === currentIndex && step.key !== 'cerrado';
          const isFuture = idx > currentIndex;

          const event = getEventForStep(idx);
          const timestamp = event?.createdAt ? formatDate(event.createdAt) : null;

          // Etiqueta dinámica si estamos resolviendo (Aprobado vs Rechazado)
          let displayLabel = step.label;
          if (idx === 3 && (isCompleted || isCurrent)) {
            if (status === 'rechazado') displayLabel = 'Rechazado';
            if (status === 'aprobado') displayLabel = 'Aprobado';
            if (status === 'aprobado_parcial') displayLabel = 'Aprobado Parcial';
          }

          return (
            <div key={step.key} className={cn("relative flex items-start gap-4 md:gap-8 md:justify-center", isFuture && "opacity-50")}>
              
              {/* Desktop Left (Time) */}
              <div className="hidden md:block w-1/2 text-right pt-2.5">
                {timestamp && !isFuture && (
                  <span className="text-xs font-semibold text-zinc-500">{timestamp}</span>
                )}
              </div>

              {/* Icon / Indicator */}
              <div className="relative flex-shrink-0 flex items-center justify-center w-12 h-12 md:-ml-6 md:-mr-6 z-10 bg-zinc-950 rounded-full">
                <div className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 text-lg shadow-sm transition-all",
                  isCompleted ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" :
                  isCurrent ? "bg-orange-500/20 border-orange-500 text-orange-400 ring-4 ring-orange-500/10" :
                  "bg-zinc-900 border-zinc-700 text-zinc-600"
                )}>
                  {isCompleted ? '✓' : step.icon}
                </div>
              </div>

              {/* Mobile Right (Info and time) & Desktop Right (Info) */}
              <div className="flex-1 md:w-1/2 pt-2.5">
                <h4 className={cn(
                  "font-bold text-base tracking-tight",
                  isCompleted ? "text-emerald-400" :
                  isCurrent ? "text-orange-400" :
                  "text-zinc-500"
                )}>
                  {displayLabel}
                </h4>
                {/* Mobile time display */}
                {timestamp && !isFuture && (
                  <span className="md:hidden block text-xs font-medium text-zinc-500 mt-1">{timestamp}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
