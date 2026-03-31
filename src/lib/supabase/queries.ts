// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { SupabaseClientType } from './client';
import { mapOrder, mapWorkshop, mapQuote, mapOrderEvent } from './mappers';
import { Order, OrderEvent, OrderStatus, QuoteItem } from '@/lib/types';
import { generateId } from '@/lib/utils';

// ============================================================
// Cache simple de nombres de usuario
// ============================================================

const profileCache: Record<string, string> = {};

async function resolveUserName(sb: SupabaseClientType, userId: string): Promise<string> {
  if (profileCache[userId]) return profileCache[userId];
  const { data } = await (sb as any)
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .single();
  const name = (data as any)?.name ?? userId;
  profileCache[userId] = name;
  return name;
}

// ============================================================
// LECTURA DE PEDIDOS
// ============================================================

export async function fetchAllOrders(sb: SupabaseClientType): Promise<Order[]> {
  const { data: rows, error } = await (sb as any)
    .from('orders')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[Supabase] Error fetching orders:', error.message);
    return [];
  }
  if (!rows || rows.length === 0) return [];

  const orderIds = rows.map((r: any) => r.id);
  const workshopIds = [...new Set(rows.map((r: any) => r.workshop_id))];

  const [workshopsRes, quotesRes, eventsRes] = await Promise.all([
    (sb as any).from('workshops').select('*').in('id', workshopIds),
    (sb as any).from('quotes').select('*').in('order_id', orderIds),
    (sb as any).from('order_events').select('*').in('order_id', orderIds).order('created_at', { ascending: true }),
  ]);

  const workshops: any[] = workshopsRes.data ?? [];
  const quotes: any[] = quotesRes.data ?? [];
  const allEvents: any[] = eventsRes.data ?? [];

  const quoteIds = quotes.map((q: any) => q.id);
  const { data: allItems } = quoteIds.length > 0
    ? await (sb as any).from('quote_items').select('*').in('quote_id', quoteIds)
    : { data: [] };

  // Resolver nombres de usuario
  const uniqueUserIds = [...new Set(allEvents.map((e: any) => e.user_id))] as string[];
  const userNames: Record<string, string> = {};
  await Promise.all(
    uniqueUserIds.map(async (uid) => {
      userNames[uid] = await resolveUserName(sb, uid);
    })
  );

  return rows.map((row: any) => {
    const workshop = workshops.find((w: any) => w.id === row.workshop_id);
    const quote = quotes.find((q: any) => q.order_id === row.id);
    const items = (allItems ?? []).filter((i: any) => i.quote_id === quote?.id);
    const events = allEvents
      .filter((e: any) => e.order_id === row.id)
      .map((e: any) => mapOrderEvent(e, userNames[e.user_id] ?? e.user_id));

    return mapOrder(
      row,
      workshop ? mapWorkshop(workshop) : undefined,
      quote ? mapQuote(quote, items) : undefined,
      events
    );
  });
}

// ============================================================
// ESCRITURA DE PEDIDOS
// ============================================================

export async function createOrderInDB(
  sb: SupabaseClientType,
  data: {
    workshopId: string;
    vehicleBrand: string;
    vehicleModel: string;
    vehicleYear: number;
    partName: string;
    description: string;
    quality: 'alta' | 'media' | 'baja';
  },
  userId: string
): Promise<string | null> {
  const { data: row, error } = await (sb as any)
    .from('orders')
    .insert({
      workshop_id: data.workshopId,
      vehicle_brand: data.vehicleBrand,
      vehicle_model: data.vehicleModel,
      vehicle_year: data.vehicleYear,
      part_name: data.partName,
      description: data.description,
      quality: data.quality,
      status: 'pendiente',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Supabase] Error creating order:', error.message);
    return null;
  }

  await insertEvent(sb, (row as any).id, userId, 'pedido_creado', 'Pedido ingresado desde el portal.');
  return (row as any).id;
}

export async function updateOrderStatus(
  sb: SupabaseClientType,
  orderId: string,
  status: OrderStatus,
  userId: string,
  action: OrderEvent['action'],
  comment?: string
): Promise<boolean> {
  const { error } = await (sb as any)
    .from('orders')
    .update({ status: status as string, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    console.error('[Supabase] Error updating order status:', error.message);
    return false;
  }

  await insertEvent(sb, orderId, userId, action, comment);
  return true;
}

// ============================================================
// COTIZACIONES
// ============================================================

export async function createQuoteInDB(
  sb: SupabaseClientType,
  orderId: string,
  vendorId: string,
  notes: string,
  items: Omit<QuoteItem, 'id' | 'quoteId' | 'approved'>[]
): Promise<boolean> {
  const now = new Date().toISOString();

  const { data: quoteRow, error: quoteError } = await (sb as any)
    .from('quotes')
    .insert({
      order_id: orderId,
      vendor_id: vendorId,
      notes,
      status: 'enviada',
      sent_at: now,
    })
    .select('id')
    .single();

  if (quoteError) {
    console.error('[Supabase] Error creating quote:', quoteError.message);
    return false;
  }

  const quoteId = (quoteRow as any).id;
  const { error: itemsError } = await (sb as any)
    .from('quote_items')
    .insert(
      items.map(item => ({
        quote_id: quoteId,
        part_name: item.partName,
        description: item.description,
        quality: item.quality,
        manufacturer: item.manufacturer ?? null,
        supplier: item.supplier ?? null,
        price: item.price,
        image_url: item.imageUrl ?? null,
        notes: item.notes ?? null,
        approved: null,
      }))
    );

  if (itemsError) {
    console.error('[Supabase] Error creating quote items:', itemsError.message);
    return false;
  }

  await (sb as any)
    .from('orders')
    .update({ status: 'cotizado', updated_at: now })
    .eq('id', orderId);

  await insertEvent(sb, orderId, vendorId, 'cotizacion_enviada', 'Cotización enviada al taller.');
  return true;
}

export async function updateQuoteItemsApproval(
  sb: SupabaseClientType,
  approvedIds: string[],
  rejectedIds: string[]
): Promise<boolean> {
  const results = await Promise.all([
    approvedIds.length > 0
      ? (sb as any).from('quote_items').update({ approved: true }).in('id', approvedIds)
      : Promise.resolve({ error: null }),
    rejectedIds.length > 0
      ? (sb as any).from('quote_items').update({ approved: false }).in('id', rejectedIds)
      : Promise.resolve({ error: null }),
  ]);
  return results.every((r: any) => !r.error);
}

// ============================================================
// EVENTOS
// ============================================================

export async function insertEvent(
  sb: SupabaseClientType,
  orderId: string,
  userId: string,
  action: OrderEvent['action'],
  comment?: string
): Promise<void> {
  const { error } = await (sb as any).from('order_events').insert({
    order_id: orderId,
    user_id: userId,
    action,
    comment: comment ?? null,
  });

  if (error) {
    console.error('[Supabase] Error inserting event:', error.message);
  }
}
