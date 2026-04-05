'use client';

import { buildWhatsAppUrl, cn } from '@/lib/utils';

interface WhatsAppLinkProps {
  phone: string;
  message?: string;
  className?: string;
  label?: string;
  stopPropagation?: boolean;
}

export function WhatsAppLink({
  phone,
  message,
  className,
  label = 'WhatsApp',
  stopPropagation = true,
}: WhatsAppLinkProps) {
  const href = buildWhatsAppUrl(phone, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-600/15 px-2 py-1 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-600/25',
        className
      )}
      onClick={stopPropagation ? e => e.stopPropagation() : undefined}
    >
      <span className="text-sm leading-none" aria-hidden>
        💬
      </span>
      <span className="sr-only">{label}</span>
    </a>
  );
}
