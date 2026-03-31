import { OrderStatus } from './types';

// ============================================================
// FORMATEO
// ============================================================

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateString));
}

export function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return formatDate(dateString);
}

// ============================================================
// GENERADORES
// ============================================================

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

export function generateOrderNumber(): string {
  return `PED-${Math.floor(Math.random() * 90000) + 10000}`;
}

// ============================================================
// HELPERS DE ESTADO
// ============================================================

export function canVendorQuote(status: OrderStatus): boolean {
  return status === 'pendiente' || status === 'en_revision';
}

export function canWorkshopRespond(status: OrderStatus): boolean {
  return status === 'cotizado';
}

export function getStatusProgress(status: OrderStatus): number {
  const progression: Record<OrderStatus, number> = {
    pendiente: 1,
    en_revision: 2,
    cotizado: 3,
    aprobado_parcial: 4,
    aprobado: 5,
    rechazado: 5,
    cerrado: 6,
  };
  return progression[status];
}

// ============================================================
// CN HELPER (reemplaza clsx/tailwind-merge simple)
// ============================================================

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ============================================================
// CALCULAR TOTAL DE COTIZACIÓN
// ============================================================

export function calculateQuoteTotal(items: { price: number; approved?: boolean | null }[]): number {
  return items
    .filter(item => item.approved !== false)
    .reduce((sum, item) => sum + item.price, 0);
}
