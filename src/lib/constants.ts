import { OrderStatus, OrderQuality, EventAction } from './types';

// ============================================================
// LABELS DE ESTADOS
// ============================================================

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  cotizado: 'Cotizado',
  aprobado_parcial: 'Aprobado parcial',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  cerrado: 'Cerrado',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  en_revision: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  cotizado: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  aprobado_parcial: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  aprobado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rechazado: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  cerrado: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export const QUALITY_LABELS: Record<OrderQuality, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja / Económica',
};

export const QUALITY_COLORS: Record<OrderQuality, string> = {
  alta: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  media: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  baja: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export const EVENT_ACTION_LABELS: Record<EventAction, string> = {
  pedido_creado: 'Pedido creado',
  pedido_en_revision: 'Pedido en revisión',
  cotizacion_enviada: 'Cotización enviada',
  cotizacion_aprobada: 'Cotización aprobada',
  cotizacion_rechazada: 'Cotización rechazada',
  cotizacion_aprobada_parcial: 'Cotización aprobada parcialmente',
  pedido_cerrado: 'Pedido cerrado',
  comentario: 'Comentario',
};

export const EVENT_ACTION_ICONS: Record<EventAction, string> = {
  pedido_creado: '📋',
  pedido_en_revision: '🔍',
  cotizacion_enviada: '📤',
  cotizacion_aprobada: '✅',
  cotizacion_rechazada: '❌',
  cotizacion_aprobada_parcial: '⚡',
  pedido_cerrado: '🔒',
  comentario: '💬',
};

// ============================================================
// OPCIONES DE FORMULARIO
// ============================================================

export const VEHICLE_BRANDS = [
  'Chevrolet', 'Ford', 'Volkswagen', 'Toyota', 'Peugeot',
  'Renault', 'Fiat', 'Honda', 'Hyundai', 'Nissan',
  'BMW', 'Mercedes-Benz', 'Audi', 'Citroën', 'Kia',
  'Mazda', 'Mitsubishi', 'Subaru', 'Jeep', 'Dodge',
  'Ram', 'Otra',
];

export const QUALITY_OPTIONS: { value: OrderQuality; label: string; desc: string }[] = [
  { value: 'alta', label: '🟢 Alta', desc: 'Original o equivalente premium' },
  { value: 'media', label: '🟡 Media', desc: 'Aftermarket de buena calidad' },
  { value: 'baja', label: '⚪ Económica', desc: 'La opción más económica disponible' },
];

export const DEMO_USERS = [
  { email: 'taller1@demo.com', password: 'demo1234', name: 'Taller AutoSur', role: 'taller' },
  { email: 'taller2@demo.com', password: 'demo1234', name: 'Chapa & Pintura Norte', role: 'taller' },
  { email: 'vendedor@demo.com', password: 'demo1234', name: 'Repuestos El Galpón', role: 'vendedor' },
];
