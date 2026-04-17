// ============================================================
// TIPOS GLOBALES — Portal B2B Autopartes
// ============================================================

export type UserRole = 'taller' | 'vendedor' | 'admin';

export type OrderQuality = 'alta' | 'media' | 'baja';

export type OrderStatus =
  | 'pendiente'
  | 'en_revision'
  | 'cotizado'
  | 'aprobado_parcial'
  | 'aprobado'
  | 'rechazado'
  | 'cerrado'
  | 'cerrado_pagado'  // Admin confirma que el taller pagó
  | 'en_conflicto';  // Taller inició un reclamo sobre un pedido cerrado

export type QuoteStatus = 'borrador' | 'enviada';

export type EventAction =
  | 'pedido_creado'
  | 'pedido_en_revision'
  | 'pedido_tomado'               // vendedor toma el pedido de la cola
  | 'pedido_liberado'             // vendedor libera el pedido a la cola
  | 'cotizacion_enviada'
  | 'cotizacion_aprobada'
  | 'cotizacion_rechazada'
  | 'cotizacion_aprobada_parcial'
  | 'pedido_cerrado'
  | 'pedido_pagado'               // admin marca el pedido como pagado (cerrado_pagado)
  | 'reclamo_iniciado'            // taller inicia reclamo (en_conflicto)
  | 'comentario';

// ============================================================
// ENTIDADES
// ============================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  workshopId?: string; // solo para talleres
  workshopName?: string; // solo para talleres
  assignedWorkshops?: string[]; // solo para vendedores/admin
}

export interface Workshop {
  id: string;
  name: string;
  address: string;
  phone: string;
  contactName: string;
  email: string;
  tallerNumber?: number;
  createdAt: string;
}

export interface Order {
  id: string;
  workshopId: string;
  workshop?: Workshop;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleVersion: string;
  vehicleYear: number;
  internalOrderNumber?: string;
  orderNumber?: string;
  workshopOrderNumber?: number;
  /** Vendedor asignado al pedido (opcional, admin puede reasignar) */
  assignedVendorId?: string;
  assignedVendorName?: string;
  items: OrderItem[];
  status: OrderStatus;
  quote?: Quote;
  events: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  partName: string;
  description: string;
  quality: OrderQuality;
  quantity: number;
  images: OrderImage[];
  codigoCatalogo?: string | null;
}

export interface OrderImage {
  id: string;
  orderItemId: string;
  url: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  orderId: string;
  vendorId: string;
  vendor?: User;
  notes: string;
  status: QuoteStatus;
  items: QuoteItem[];
  sentAt?: string;
  createdAt: string;
}

export interface QuoteItemImage {
  id: string;
  quoteItemId: string;
  url: string;
  createdAt: string;
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  orderItemId?: string;
  partName: string;
  description: string;
  quality: OrderQuality;
  manufacturer?: string;
  supplier?: string;
  /** Precio unitario (ARS) */
  price: number;
  /** Cantidad ofrecida en la cotización */
  quantityOffered: number;
  imageUrl?: string;
  /** Fotos del vendedor (tabla quote_item_images + image_url legacy) */
  images?: QuoteItemImage[];
  notes?: string;
  approved?: boolean | null; // null = pendiente, true = aprobado, false = rechazado
}

/** Payload para email: respuesta del taller a la cotización */
export type EmailQuoteResponseKind = 'aprobado' | 'aprobado_parcial' | 'rechazado';

export interface EmailQuoteResponsePayload {
  kind: EmailQuoteResponseKind;
  totalApproved: number;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  userId: string;
  userName: string;
  action: EventAction;
  comment?: string;
  createdAt: string;
}

// ============================================================
// FORMULARIOS
// ============================================================

export interface NewOrderForm {
  vehicleBrand: string;
  vehicleModel: string;
  vehicleVersion: string;
  vehicleYear: string;
  internalOrderNumber: string;
  items: NewOrderItemForm[];
}

export interface NewOrderItemForm {
  tempId: string;
  partName: string;
  codigoCatalogo?: string | null;
  description: string;
  quality: OrderQuality;
  quantity: number;
  images: File[];
  imagePreviews: string[];
}

export interface QuoteItemForm {
  orderItemId?: string;
  partName: string;
  description: string;
  quality: OrderQuality;
  manufacturer: string;
  supplier: string;
  price: string;
  imageUrl: string;
  notes: string;
}

export interface NewQuoteForm {
  notes: string;
  items: QuoteItemForm[];
}

// ============================================================
// MÉTRICAS DE DASHBOARD
// ============================================================

export interface WorkshopMetrics {
  total: number;
  pendientes: number;
  cotizados: number;
  aprobados: number;
  rechazados: number;
}

export interface VendorMetrics {
  nuevos: number;
  enRevision: number;
  cotizados: number;
  aprobados: number;
  rechazados: number;
  totalPedidos: number;
}

/** Métricas agregadas por vendedor para el panel ADMIN. */
export interface VendorPerformance {
  vendorId: string;
  vendorName: string;
  totalPedidos: number;
  pendientes: number;
  enRevision: number;
  cotizados: number;
  aprobados: number;
  aprobadosParcial: number;
  rechazados: number;
  cerrados: number;
  /** Monto total (ARS) de los ítems aprobados en cotizaciones atribuidas al vendedor. */
  montoAprobado: number;
}

/** Snapshot global para el dashboard del admin. */
export interface AdminDashboardMetrics {
  totalPedidos: number;
  pendientes: number;
  enRevision: number;
  cotizados: number;
  aprobados: number;
  aprobadosParcial: number;
  rechazados: number;
  cerrados: number;
  cerradoPagado?: number;
  enConflicto?: number;
  montoAprobado: number;
  totalTalleres: number;
  totalVendedores: number;
}

// ============================================================
// MÉTRICAS RPC (Dashboard Admin — Bloques 3 & 4)
// ============================================================

/** Resultado de get_admin_kpis: basado solo en pedidos cerrado_pagado. */
export interface AdminKPIResult {
  totalFacturado: number;
  ticketPromedio: number;
  totalCompletados: number;
}

/** Entrada del ranking de vendedores (RPC get_vendor_ranking). */
export interface VendorRankEntry {
  vendorId: string;
  vendorName: string;
  pedidosCerrados: number;
  montoFacturado: number;
}

/** Entrada del ranking de talleres (RPC get_workshop_ranking). */
export interface WorkshopRankEntry {
  workshopId: string;
  workshopName: string;
  totalPedidos: number;
  montoComprado: number;
}

export interface MonthlyStatusMetric {
  status: OrderStatus;
  label: string;
  total: number;
}

export interface MonthlyVendorMetrics {
  vendorId: string;
  vendorName: string;
  pedidosAtendidos: number;
  pedidosCotizados: number;
  pedidosAprobados: number;
  totalFacturado: number;
}

export interface AdminMonthlyMetricsReport {
  monthLabel: string;
  totalPedidosMes: number;
  totalFacturadoMes: number;
  ticketPromedioMes: number;
  pedidosPorEstado: MonthlyStatusMetric[];
  vendedores: MonthlyVendorMetrics[];
  topMarca: string;
  topModelo: string;
  topProducto: string;
}

export interface ProfileDirectoryEntry {
  id: string;
  name: string;
  role: UserRole;
  phone?: string | null;
  email?: string | null;
  workshopId?: string | null;
  workshopName?: string | null;
  assignedWorkshops: string[];
}
