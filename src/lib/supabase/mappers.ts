import { Order, Workshop, Quote, QuoteItem, OrderEvent } from '@/lib/types';
import {
  DbOrder,
  DbQuote,
  DbQuoteItem,
  DbOrderEvent,
  DbWorkshop,
} from './database.types';

// ============================================================
// MAPPERS: DB → App
// Convierte snake_case de Supabase a camelCase de la app
// ============================================================

export function mapWorkshop(row: DbWorkshop): Workshop {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? '',
    phone: row.phone ?? '',
    contactName: row.contact_name ?? '',
    email: row.email ?? '',
    createdAt: row.created_at,
  };
}

export function mapQuoteItem(row: DbQuoteItem): QuoteItem {
  return {
    id: row.id,
    quoteId: row.quote_id,
    partName: row.part_name,
    description: row.description ?? '',
    quality: row.quality,
    manufacturer: row.manufacturer ?? undefined,
    supplier: row.supplier ?? undefined,
    price: Number(row.price),
    imageUrl: row.image_url ?? undefined,
    notes: row.notes ?? undefined,
    approved: row.approved,
  };
}

export function mapQuote(
  row: DbQuote,
  items: DbQuoteItem[]
): Quote {
  return {
    id: row.id,
    orderId: row.order_id,
    vendorId: row.vendor_id,
    notes: row.notes ?? '',
    status: row.status,
    items: items.map(mapQuoteItem),
    sentAt: row.sent_at ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapOrderEvent(row: DbOrderEvent, userName: string): OrderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    userName,
    action: row.action,
    comment: row.comment ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapOrder(
  row: DbOrder,
  workshop: Workshop | undefined,
  quote: Quote | undefined,
  events: OrderEvent[]
): Order {
  return {
    id: row.id,
    workshopId: row.workshop_id,
    workshop,
    vehicleBrand: row.vehicle_brand,
    vehicleModel: row.vehicle_model,
    vehicleYear: row.vehicle_year,
    partName: row.part_name,
    description: row.description ?? '',
    quality: row.quality,
    status: row.status,
    images: [], // se cargará por separado si hace falta
    quote,
    events,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
