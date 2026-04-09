// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { SupabaseClientType } from './client';
import { mapOrder, mapWorkshop, mapQuote, mapOrderEvent } from './mappers';
import { Order, OrderEvent, OrderStatus, Quote, QuoteItem } from '@/lib/types';
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

// Helper to convert File to Base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

// ============================================================
// LECTURA DE DATOS
// ============================================================

export async function fetchAllWorkshops(sb: SupabaseClientType): Promise<any[]> {
  const { data, error } = await (sb as any)
    .from('workshops')
    .select('id, name, address, phone, contact_name, email, taller_number, created_at')
    .order('name', { ascending: true });
  if (error) {
    console.error('[Supabase] Error fetching workshops:', error.message);
    throw new Error(error.message);
  }
  return data ?? [];
}


export async function fetchAllOrders(sb: SupabaseClientType): Promise<Order[]> {
  const { data: rows, error } = await (sb as any)
    .from('orders')
    .select('id, workshop_id, vehicle_brand, vehicle_model, vehicle_version, vehicle_year, internal_order_number, order_number, workshop_order_number, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[Supabase] Error fetching orders:', error.message);
    throw new Error(error.message);
  }
  if (!rows || rows.length === 0) return [];

  const orderIds = rows.map((r: any) => r.id);
  const workshopIds = [...new Set(rows.map((r: any) => r.workshop_id).filter(Boolean))];

  const [workshopsRes, itemsRes, quotesRes, eventsRes] = await Promise.all([
    workshopIds.length > 0
      ? (sb as any).from('workshops').select('id, name, address, phone, contact_name, email, taller_number, created_at').in('id', workshopIds)
      : Promise.resolve({ data: [] }),
    (sb as any).from('order_items').select('id, order_id, part_name, description, quality, quantity, codigo_catalogo, created_at').in('order_id', orderIds),
    (sb as any).from('quotes').select('id, order_id, vendor_id, notes, status, sent_at, created_at').in('order_id', orderIds),
    (sb as any).from('order_events').select('id, order_id, user_id, action, comment, created_at').in('order_id', orderIds).order('created_at', { ascending: true }),
  ]);

  const workshops: any[] = workshopsRes.data ?? [];
  const orderItems: any[] = itemsRes.data ?? [];
  const itemIds = orderItems.map((i: any) => i.id);

  let orderImages: any[] = [];
  if (itemIds.length > 0) {
    const { data: imgRows, error: imgErr } = await (sb as any)
      .from('order_images')
      .select('id, order_item_id, url, storage_path, created_at')
      .in('order_item_id', itemIds);
    if (imgErr) {
      console.error('[Supabase] Error fetching order_images:', imgErr.message);
      throw new Error(imgErr.message);
    }
    orderImages = imgRows ?? [];
  }
  const quotes: any[] = quotesRes.data ?? [];
  const allEvents: any[] = eventsRes.data ?? [];

  const quoteIds = quotes.map((q: any) => q.id);
  let allItems: any[] = [];
  if (quoteIds.length > 0) {
    const { data: qiRows, error: qiErr } = await (sb as any)
      .from('quote_items')
      .select('id, quote_id, order_item_id, part_name, description, quality, manufacturer, supplier, price, quantity_offered, image_url, notes, approved, created_at')
      .in('quote_id', quoteIds);
    if (qiErr) {
      console.error('[Supabase] Error fetching quote_items:', qiErr.message);
      throw new Error(qiErr.message);
    }
    allItems = qiRows ?? [];
  }

  const quoteItemIds = allItems.map((i: any) => i.id);
  let quoteItemImages: any[] = [];
  if (quoteItemIds.length > 0) {
    const { data: qiiRows, error: qiiErr } = await (sb as any)
      .from('quote_item_images')
      .select('id, quote_item_id, url, storage_path, created_at')
      .in('quote_item_id', quoteItemIds);
    if (qiiErr) {
      console.warn('[Supabase] quote_item_images (¿migración pendiente?):', qiiErr.message);
    } else {
      quoteItemImages = qiiRows ?? [];
    }
  }

  const imagesByQuoteItemId: Record<string, any[]> = {};
  for (const img of quoteItemImages) {
    const k = img.quote_item_id as string;
    if (!imagesByQuoteItemId[k]) imagesByQuoteItemId[k] = [];
    imagesByQuoteItemId[k].push(img);
  }

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
    const imagesByItem: Record<string, any[]> = {};
    for (const it of items) {
      imagesByItem[it.id] = imagesByQuoteItemId[it.id] ?? [];
    }
    const relatedOrderItems = orderItems.filter((i: any) => i.order_id === row.id);
    
    // Filtramos manualmente en caso de error en query relacional
    const relatedItemIds = relatedOrderItems.map(i => i.id);
    const relatedImages = orderImages.filter((img: any) => relatedItemIds.includes(img.order_item_id));

    const events = allEvents
      .filter((e: any) => e.order_id === row.id)
      .map((e: any) => mapOrderEvent(e, userNames[e.user_id] ?? e.user_id));

    return mapOrder(
      row,
      relatedOrderItems,
      relatedImages,
      workshop ? mapWorkshop(workshop) : undefined,
      quote ? mapQuote(quote, items, imagesByItem) : undefined,
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
    vehicleVersion: string;
    vehicleYear: number;
    internalOrderNumber?: string;
    items: {
      partName: string;
      codigoCatalogo?: string | null;
      description: string;
      quality: 'alta' | 'media' | 'baja';
      quantity: number;
      images: File[];
    }[];
  },
  userId: string
): Promise<string | null> {
  const { data: row, error } = await (sb as any)
    .from('orders')
    .insert({
      workshop_id: data.workshopId,
      vehicle_brand: data.vehicleBrand,
      vehicle_model: data.vehicleModel,
      vehicle_version: data.vehicleVersion,
      vehicle_year: data.vehicleYear,
      internal_order_number: data.internalOrderNumber ?? null,
      status: 'pendiente',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Supabase] Error creating order:', error.message);
    return null;
  }

  const orderId = (row as any).id;

  async function insertOneItemWithImages(item: (typeof data.items)[0]): Promise<void> {
    const { data: itemRow, error: itemError } = await (sb as any).from('order_items').insert({
      order_id: orderId,
      part_name: item.partName,
      description: item.description,
      quality: item.quality,
      quantity: item.quantity,
      codigo_catalogo: item.codigoCatalogo ?? null,
    }).select('id').single();

    if (itemError) {
      console.error('[Supabase] Error creating order item:', itemError.message);
      return;
    }

    const orderItemId = (itemRow as any).id;

    if (!item.images?.length) return;

    await Promise.all(
      item.images.map(async file => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${orderItemId}-${generateId()}.${fileExt}`;

        const { error: uploadError } = await sb.storage.from('order-images').upload(fileName, file);

        let finalUrl = '';
        if (uploadError) {
          console.warn('[Supabase] Error uploading to storage, using base64 fallback:', uploadError.message);
          finalUrl = await fileToBase64(file);
        } else {
          const { data: urlData } = sb.storage.from('order-images').getPublicUrl(fileName);
          finalUrl = urlData.publicUrl;
        }

        const { error: imgErr } = await (sb as any).from('order_images').insert({
          order_item_id: orderItemId,
          url: finalUrl,
          storage_path: uploadError ? null : fileName,
        });
        if (imgErr) {
          console.error('[Supabase] Error inserting order_images:', imgErr.message);
        }
      })
    );
  }

  const eventPromise = insertEvent(sb, orderId, userId, 'pedido_creado', 'Pedido ingresado desde el portal.');
  const itemTasks = data.items.map(item => insertOneItemWithImages(item));
  await Promise.all([eventPromise, ...itemTasks]);

  return orderId;
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

export async function deleteOrderInDB(sb: SupabaseClientType, orderId: string): Promise<boolean> {
  const { error } = await (sb as any).from('orders').delete().eq('id', orderId);
  if (error) {
    console.error('[Supabase] Error deleting order:', error.message);
    return false;
  }
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
  items: (Omit<QuoteItem, 'id' | 'quoteId' | 'approved' | 'images'> & {
    imageFile?: File;
    imageFiles?: File[];
  })[]
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

  for (const item of items) {
    const qtyOffered = Math.max(1, Math.floor(Number(item.quantityOffered) || 1));

    const files: File[] = [];
    if (item.imageFiles && item.imageFiles.length > 0) {
      files.push(...item.imageFiles.slice(0, 5));
    } else if (item.imageFile) {
      files.push(item.imageFile);
    }

    const { data: insertedRow, error: itemError } = await (sb as any)
      .from('quote_items')
      .insert({
        quote_id: quoteId,
        order_item_id: item.orderItemId ?? null,
        part_name: item.partName,
        description: item.description,
        quality: item.quality,
        manufacturer: item.manufacturer ?? null,
        supplier: item.supplier ?? null,
        price: item.price,
        quantity_offered: qtyOffered,
        image_url: null,
        notes: item.notes ?? null,
        approved: null,
      })
      .select('id')
      .single();

    if (itemError || !insertedRow) {
      console.error('[Supabase] Error creating quote item:', itemError?.message);
      continue;
    }

    const quoteItemId = (insertedRow as { id: string }).id;

    let firstUrl: string | null = null;

    if (files.length > 0) {
      const uploadResults = await Promise.all(
        files.map(async file => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${quoteId}-${quoteItemId}-${generateId()}.${fileExt}`;
          const { error: uploadError } = await sb.storage.from('quote-images').upload(fileName, file);

          let finalUrl: string;
          if (!uploadError) {
            const { data: urlData } = sb.storage.from('quote-images').getPublicUrl(fileName);
            finalUrl = urlData.publicUrl;
          } else {
            console.warn('[Supabase] quote image upload fallback:', uploadError.message);
            finalUrl = await fileToBase64(file);
          }
          return { finalUrl, uploadError, fileName };
        })
      );

      firstUrl = uploadResults[0]?.finalUrl ?? null;

      await Promise.all(
        uploadResults.map(async r => {
          const { error: imgInsErr } = await (sb as any).from('quote_item_images').insert({
            quote_item_id: quoteItemId,
            url: r.finalUrl,
            storage_path: r.uploadError ? null : r.fileName,
          });
          if (imgInsErr) {
            console.warn('[Supabase] quote_item_images insert:', imgInsErr.message);
          }
        })
      );
    }

    if (!firstUrl && item.imageUrl) {
      firstUrl = item.imageUrl;
    }

    if (firstUrl) {
      await (sb as any).from('quote_items').update({ image_url: firstUrl }).eq('id', quoteItemId);
    }
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

/** Pedido único con ítems, order_images anidadas vía mapOrder y cotización con quote_items (incl. image_url). */
export async function fetchOrderById(sb: SupabaseClientType, orderId: string): Promise<Order | null> {
  const orders = await fetchAllOrders(sb);
  return orders.find(o => o.id === orderId) ?? null;
}

/** Cotización del pedido (quote_items con image_url). */
export async function fetchQuoteByOrderId(sb: SupabaseClientType, orderId: string): Promise<Quote | null> {
  const order = await fetchOrderById(sb, orderId);
  return order?.quote ?? null;
}
