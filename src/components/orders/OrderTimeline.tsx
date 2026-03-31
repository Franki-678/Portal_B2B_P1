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
            <div className="absolute left-[15px] top-8 bottom-[-10px] w-px bg-zinc-800/80" />
          )}

          {/* Icon */}
          <div className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center text-sm flex-shrink-0 mt-0.5 relative z-10 shadow-sm">
            {EVENT_ACTION_ICONS[event.action]}
          </div>

          {/* Content */}
          <div className="pb-5 flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-sm font-bold text-zinc-200">
                  {EVENT_ACTION_LABELS[event.action]}
                </span>
                <span className="text-xs font-medium text-zinc-500 ml-1.5">por {event.userName}</span>
              </div>
              <time className="text-xs font-semibold text-zinc-500 whitespace-nowrap flex-shrink-0">
                {formatDateTime(event.createdAt)}
              </time>
            </div>
            {event.comment && (
              <p className="text-sm font-medium text-zinc-400 mt-2 bg-zinc-900 border border-zinc-800/80 rounded-xl px-4 py-3 shadow-inner shadow-black/10">
                &ldquo;{event.comment}&rdquo;
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
