'use client';

import { OrderEvent, OrderStatus, UserRole } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { EVENT_ACTION_ICONS, EVENT_ACTION_LABELS } from '@/lib/constants';

interface OrderStatusTrackerProps {
  status: OrderStatus;
  events: OrderEvent[];
  userRole?: UserRole;
}

const STATUS_FLOW = [
  { key: 'pendiente',  label: 'Pendiente',  icon: '📝' },
  { key: 'en_revision', label: 'En revisión', icon: '🔍' },
  { key: 'cotizado',   label: 'Cotizado',   icon: '💰' },
  { key: 'resolve',    label: 'Resolución', icon: '✅' },
  { key: 'cerrado',    label: 'Cerrado',    icon: '🔒' },
];

const STEP_DESCRIPTIONS: Record<string, Partial<Record<UserRole | 'default', string>>> = {
  pendiente: {
    taller:   'Tu pedido fue enviado. Un vendedor lo revisará pronto.',
    vendedor: 'Nuevo pedido en la cola. Tomalo para empezar a gestionar.',
    admin:    'Pedido en espera de ser tomado por un vendedor.',
    default:  'Pedido enviado. En espera de ser recibido por un vendedor.',
  },
  en_revision: {
    taller:   'El vendedor está consultando disponibilidad y precios.',
    vendedor: 'Consultá disponibilidad y armá la cotización para el taller.',
    admin:    'El vendedor está consultando disponibilidad y armando la cotización.',
    default:  'El vendedor está consultando disponibilidad y precios.',
  },
  cotizado: {
    taller:   'Cotización recibida. Revisá los ítems y aprobá para continuar.',
    vendedor: 'Cotización enviada. Esperando respuesta del taller.',
    admin:    'Cotización enviada al taller. Pendiente de aprobación.',
    default:  'Cotización recibida. Revisá los ítems y aprobá para continuar.',
  },
  resolve: {
    taller:   'Tu respuesta fue registrada. El vendedor preparará lo acordado.',
    vendedor: 'Respuesta del taller recibida. Coordiná la preparación y entrega.',
    admin:    'El taller respondió la cotización.',
    default:  'Respuesta enviada. El vendedor preparará los repuestos acordados.',
  },
  cerrado: {
    taller:   'Pedido completado. Los repuestos fueron entregados.',
    vendedor: 'Pedido completado y entregado al taller.',
    admin:    'Pedido finalizado.',
    default:  'El pedido ha sido finalizado y los repuestos entregados.',
  },
};

function getStepDescription(stepKey: string, role?: UserRole): string {
  const map = STEP_DESCRIPTIONS[stepKey];
  if (!map) return '';
  if (role && role in map) return (map as Record<string, string>)[role];
  return (map as Record<string, string>)['default'] ?? '';
}

const CLOSED_STATUSES: OrderStatus[] = ['cerrado', 'cerrado_pagado', 'en_conflicto', 'cancelado'];

export function OrderStatusTracker({ status, events, userRole }: OrderStatusTrackerProps) {
  const getStatusIndex = (st: OrderStatus): number => {
    switch (st) {
      case 'pendiente': return 0;
      case 'en_revision': return 1;
      case 'cotizado': return 2;
      case 'aprobado':
      case 'aprobado_parcial':
      case 'pagado':
      case 'rechazado': return 3;
      case 'cerrado':
      case 'cerrado_pagado':
      case 'en_conflicto':
      case 'cancelado': return 4;
      default: return 0;
    }
  };

  const currentIndex = getStatusIndex(status);
  const isCancelledOrConflict = status === 'cancelado' || status === 'en_conflicto';

  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const getEventForStep = (stepIndex: number): OrderEvent | null => {
    switch (stepIndex) {
      case 0: return sortedEvents.find(e => e.action === 'pedido_creado') ?? null;
      case 1: return sortedEvents.find(e => e.action === 'pedido_en_revision') ?? null;
      case 2: {
        // Prefer most-recent edit over original send
        const edit = sortedEvents.find(e => e.action === 'cotizacion_editada');
        const send = sortedEvents.find(e => e.action === 'cotizacion_enviada');
        return edit ?? send ?? null;
      }
      case 3: return sortedEvents.find(e =>
        ['cotizacion_aprobada', 'cotizacion_aprobada_parcial', 'cotizacion_rechazada'].includes(e.action)
      ) ?? null;
      case 4: return sortedEvents.find(e =>
        ['pedido_cerrado', 'pedido_entregado', 'pedido_pagado', 'conflicto_resuelto'].includes(e.action)
      ) ?? null;
      default: return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Progreso de 5 pasos ── */}
      <div className="relative py-4">
        <div className="absolute left-6 md:left-[50%] top-6 bottom-6 w-0.5 bg-zinc-800 -translate-x-[1px]" />

        <div className="space-y-8 relative z-10">
          {STATUS_FLOW.map((step, idx) => {
            const isCompleted = idx < currentIndex || (idx === currentIndex && CLOSED_STATUSES.includes(status));
            const isCurrent = idx === currentIndex && !CLOSED_STATUSES.includes(status);
            const isRejectedStep = idx === 3 && status === 'rechazado' && (isCompleted || isCurrent);
            const isConflictStep = idx === 4 && isCancelledOrConflict;
            const isFuture = idx > currentIndex || (status === 'rechazado' && idx === 4);

            const event = getEventForStep(idx);
            const isEditedStep = idx === 2 && event?.action === 'cotizacion_editada';
            const timestamp = event?.createdAt ? formatDateTime(event.createdAt) : null;

            let displayLabel = step.label;
            if (idx === 2 && isEditedStep && (isCompleted || isCurrent)) displayLabel = 'Cotizado (editado)';
            if (idx === 3 && (isCompleted || isCurrent)) {
              if (status === 'rechazado') displayLabel = 'Rechazado';
              else if (status === 'aprobado') displayLabel = 'Aprobado';
              else if (status === 'aprobado_parcial') displayLabel = 'Aprobado Parcial';
              else if (status === 'pagado') displayLabel = 'Aprobado · Pagado';
            }
            if (idx === 4 && (isCompleted || isCurrent)) {
              if (status === 'cerrado_pagado') displayLabel = 'Cerrado · Pagado';
              else if (status === 'en_conflicto') displayLabel = 'En conflicto';
              else if (status === 'cancelado') displayLabel = 'Cancelado';
            }

            return (
              <div key={step.key} className={cn("relative flex items-start gap-4 md:gap-8 md:justify-center", isFuture && "opacity-50")}>

                {/* Desktop Left (Time) */}
                <div className="hidden md:block w-1/2 text-right pt-2.5">
                  {timestamp && !isFuture && (
                    <span className="text-xs font-semibold tabular-nums text-zinc-500">{timestamp}</span>
                  )}
                </div>

                {/* Icon */}
                <div className="relative flex-shrink-0 flex items-center justify-center w-12 h-12 md:-ml-6 md:-mr-6 z-10 bg-zinc-950 rounded-full">
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 text-lg shadow-sm transition-all",
                    isConflictStep
                      ? "bg-red-500/20 border-red-500 text-red-400"
                      : isRejectedStep
                      ? "bg-rose-500/20 border-rose-500 text-rose-400"
                      : isCompleted
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                      : isCurrent
                      ? "bg-orange-500/20 border-orange-500 text-orange-400 ring-4 ring-orange-500/10"
                      : "bg-zinc-900 border-zinc-700 text-zinc-600"
                  )}>
                    {isConflictStep ? '⚠' : isRejectedStep ? '✕' : isEditedStep ? '✏️' : isCompleted ? '✓' : step.icon}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 md:w-1/2 pt-2.5">
                  <h4 className={cn(
                    "font-bold text-base tracking-tight",
                    isConflictStep ? "text-red-400" :
                    isRejectedStep ? "text-rose-400" :
                    isCompleted ? "text-emerald-400" :
                    isCurrent ? "text-orange-400" :
                    "text-zinc-500"
                  )}>
                    {displayLabel}
                  </h4>
                  {event?.userName && !isFuture && (
                    <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                      {event.userName}{' '}
                      <span className={cn(
                        'font-bold',
                        isConflictStep ? 'text-red-400' :
                        isRejectedStep ? 'text-rose-400' :
                        isCompleted ? 'text-emerald-400' : 'text-orange-400'
                      )}>
                        · {displayLabel}
                      </span>
                    </p>
                  )}
                  <p className="text-xs font-medium text-zinc-500 mt-1 max-w-xs leading-relaxed">
                    {getStepDescription(step.key, userRole)}
                  </p>
                  {/* Motivo/comment del evento */}
                  {event?.comment && !isFuture && (
                    <p className="text-xs italic text-zinc-500/80 mt-1 leading-relaxed max-w-xs">
                      "{event.comment}"
                    </p>
                  )}
                  {timestamp && !isFuture && (
                    <span className="md:hidden block text-[10px] font-bold tabular-nums text-zinc-600 mt-2 uppercase tracking-tighter">{timestamp}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Historial completo de eventos ── */}
      {events.length > 0 && (
        <div className="border-t border-zinc-800/60 pt-6">
          <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">
            Historial completo ({events.length})
          </h4>
          <div className="relative">
            {/* Línea vertical */}
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-zinc-800/80" />
            <div className="space-y-4">
              {sortedEvents.map(evt => {
                const icon = (EVENT_ACTION_ICONS as Record<string, string>)[evt.action] ?? '•';
                const label = (EVENT_ACTION_LABELS as Record<string, string>)[evt.action] ?? evt.action;
                return (
                  <div key={evt.id} className="flex gap-4 items-start pl-1">
                    {/* Dot */}
                    <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 border border-zinc-700/60 text-[11px]">
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-xs font-bold text-zinc-300">{label}</span>
                        <span className="text-[10px] font-mono font-semibold tabular-nums text-zinc-500">
                          {formatDateTime(evt.createdAt)}
                        </span>
                        {evt.userName && (
                          <span className="text-[10px] text-zinc-500">· {evt.userName}</span>
                        )}
                      </div>
                      {evt.comment && (
                        <p className="text-xs italic text-zinc-500 mt-0.5 leading-relaxed">
                          {evt.comment}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
