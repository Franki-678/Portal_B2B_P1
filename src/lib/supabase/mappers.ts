import { Order, Workshop, Quote, QuoteItem, OrderEvent } from '@/lib/types';
import {
  DbOrder,
  DbOrderItem,
  DbOrderImage,
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
    orderItemId: row.order_item_id ?? undefined,
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
  items: DbOrderItem[],
  images: DbOrderImage[],
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
    vehicleVersion: row.vehicle_version,
    vehicleYear: row.vehicle_year,
    internalOrderNumber: row.internal_order_number ?? undefined,
    orderNumber: row.order_number ?? undefined,
    items: items.map((i) => ({
      id: i.id,
      orderId: i.order_id,
      partName: i.part_name,
      description: i.description ?? '',
      quality: i.quality,
      quantity: i.quantity,
      images: images
        .filter((img) => img.order_item_id === i.id)
        .map((img) => ({
          id: img.id,
          orderItemId: img.order_item_id,
          url: img.url,
          createdAt: img.created_at,
        })),
    })),
    status: row.status,
    quote,
    events,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
