'use client';

import { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'danger';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  loading = false,
  onCancel,
  onConfirm,
  children,
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmVariant = tone === 'danger' ? 'danger' : 'primary';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div
        className={cn(
          'w-full max-w-lg rounded-2xl border bg-zinc-900 p-6 shadow-2xl',
          tone === 'danger' ? 'border-rose-500/40' : 'border-zinc-700'
        )}
      >
        <h3 className={cn('text-xl font-bold', tone === 'danger' ? 'text-rose-300' : 'text-zinc-100')}>
          {title}
        </h3>
        {description && <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
