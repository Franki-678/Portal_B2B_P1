// ============================================================
// TIPOS GLOBALES — Portal B2B Autopartes
// ============================================================

export type UserRole = 'taller' | 'vendedor';

export type OrderQuality = 'alta' | 'media' | 'baja';

export type OrderStatus =
  | 'pendiente'
  | 'en_revision'
  | 'cotizado'
  | 'aprobado_parcial'
  | 'aprobado'
  | 'rechazado'
  | 'cerrado';

export type QuoteStatus = 'borrador' | 'enviada';

export type EventAction =
  | 'pedido_creado'
  | 'pedido_en_revision'
  | 'cotizacion_enviada'
  | 'cotizacion_aprobada'
  | 'cotizacion_rechazada'
  | 'cotizacion_aprobada_parcial'
  | 'pedido_cerrado'
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
}

export interface Workshop {
  id: string;
  name: string;
  address: string;
  phone: string;
  contactName: string;
  email: string;
  createdAt: string;
}

export interface Order {
  id: string;
  workshopId: string;
  workshop?: Workshop;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  partName: string;
  description: string;
  quality: OrderQuality;
  status: OrderStatus;
  images: OrderImage[];
  quote?: Quote;
  events: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderImage {
  id: string;
  orderId: string;
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

export interface QuoteItem {
  id: string;
  quoteId: string;
  partName: string;
  description: string;
  quality: OrderQuality;
  manufacturer?: string;
  supplier?: string;
  price: number;
  imageUrl?: string;
  notes?: string;
  approved?: boolean | null; // null = pendiente, true = aprobado, false = rechazado
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
  vehicleYear: string;
  partName: string;
  description: string;
  quality: OrderQuality;
  images: File[];
}

export interface QuoteItemForm {
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
