import { Order, Workshop, Quote, QuoteItem, OrderEvent } from '@/lib/types';
import {
  DbOrder,
  DbOrderItem,
  DbOrderImage,
  DbQuote,
  DbQuoteItem,
  DbQuoteItemImage,
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
    tallerNumber: row.taller_number ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapQuoteItem(row: DbQuoteItem, extraImages: DbQuoteItemImage[] = []): QuoteItem {
  const fromTable = extraImages.map(img => ({
    id: img.id,
    quoteItemId: img.quote_item_id,
    url: img.url,
    createdAt: img.created_at,
  }));
  let images = [...fromTable];
  if (row.image_url && !images.some(i => i.url === row.image_url)) {
    images.push({
      id: `legacy-${row.id}`,
      quoteItemId: row.id,
      url: row.image_url,
      createdAt: row.created_at,
    });
  }

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
    quantityOffered: row.quantity_offered ?? 1,
    imageUrl: row.image_url ?? undefined,
    images: images.length > 0 ? images : undefined,
    notes: row.notes ?? undefined,
    approved: row.approved,
  };
}

export function mapQuote(
  row: DbQuote,
  items: DbQuoteItem[],
  imagesByItemId: Record<string, DbQuoteItemImage[]> = {}
): Quote {
  return {
    id: row.id,
    orderId: row.order_id,
    vendorId: row.vendor_id,
    notes: row.notes ?? '',
    status: row.status,
    items: items.map(i => mapQuoteItem(i, imagesByItemId[i.id] ?? [])),
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
  events: OrderEvent[],
  assignedVendorName?: string
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
    workshopOrderNumber: row.workshop_order_number ?? undefined,
    assignedVendorId: row.assigned_vendor_id ?? undefined,
    assignedVendorName: assignedVendorName ?? undefined,
    items: items.map((i) => ({
      id: i.id,
      orderId: i.order_id,
      partName: i.part_name,
      description: i.description ?? '',
      quality: i.quality,
      quantity: i.quantity,
      codigoCatalogo: i.codigo_catalogo ?? null,
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
