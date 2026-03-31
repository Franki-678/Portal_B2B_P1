'use client';

import { OrderEvent } from '@/lib/types';
import { EVENT_ACTION_LABELS, EVENT_ACTION_ICONS } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';

interface OrderTimelineProps {
  events: OrderEvent[];
}

export function OrderTimeline({ events }: OrderTimelineProps) {
  const sorted = [...events].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-0">
      {sorted.map((event, idx) => (
        <div key={event.id} className="flex gap-3 relative">
          {/* Line */}
          {idx < sorted.length - 1 && (
            <div className="absolute left-4 top-8 bottom-0 w-px bg-white/8" />
          )}

          {/* Icon */}
          <div className="w-8 h-8 rounded-full bg-[#0f1117] border border-white/10 flex items-center justify-center text-sm flex-shrink-0 mt-0.5 relative z-10">
            {EVENT_ACTION_ICONS[event.action]}
          </div>

          {/* Content */}
          <div className="pb-5 flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-medium text-white">
                  {EVENT_ACTION_LABELS[event.action]}
                </span>
                <span className="text-xs text-slate-500 ml-1.5">por {event.userName}</span>
              </div>
              <time className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                {formatDateTime(event.createdAt)}
              </time>
            </div>
            {event.comment && (
              <p className="text-xs text-slate-400 mt-1 bg-white/3 rounded-lg px-3 py-2 border border-white/5">
                &ldquo;{event.comment}&rdquo;
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
