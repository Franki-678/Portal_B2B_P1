// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { SupabaseClientType } from './client';
import { mapOrder, mapWorkshop, mapQuote, mapOrderEvent } from './mappers';
import {
  Order,
  OrderEvent,
  OrderStatus,
  Quote,
  QuoteItem,
  VendorPerformance,
  AdminDashboardMetrics,
  AdminMonthlyMetricsReport,
  MonthlyVendorMetrics,
  ProfileDirectoryEntry,
  UserRole,
  AdminKPIResult,
  VendorRankEntry,
  WorkshopRankEntry,
} from '@/lib/types';
import { generateId } from '@/lib/utils';

// ============================================================
// Cache simple de nombres de usuario
// ============================================================

const profileCache: Record<string, string> = {};

type RoleScopedProfile = {
  id: string;
  role: UserRole;
  workshop_id: string | null;
  assigned_workshops: string[] | null;
};

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

async function fetchRoleScopedProfile(
  sb: SupabaseClientType,
  userId: string
): Promise<RoleScopedProfile> {
  const { data, error } = await (sb as any)
    .from('profiles')
    .select('id, role, workshop_id, assigned_workshops')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Error fetching scoped profile:', error.message);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Perfil no encontrado para aplicar filtros por rol.');
  }

  return data as RoleScopedProfile;
}

async function resolveVisibleWorkshopIds(
  sb: SupabaseClientType,
  userId: string
): Promise<{ role: UserRole; workshopIds: string[] | null }> {
  const profile = await fetchRoleScopedProfile(sb, userId);

  if (profile.role === 'admin') {
    return { role: profile.role, workshopIds: null };
  }

  if (profile.role === 'taller') {
    return {
      role: profile.role,
      workshopIds: profile.workshop_id ? [profile.workshop_id] : [],
    };
  }

  return {
    role: profile.role,
    workshopIds: profile.assigned_workshops ?? [],
  };
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

export async function fetchAllWorkshops(
  sb: SupabaseClientType,
  userId: string
): Promise<any[]> {
  const scope = await resolveVisibleWorkshopIds(sb, userId);

  if (scope.workshopIds && scope.workshopIds.length === 0) {
    return [];
  }

  let query = (sb as any)
    .from('workshops')
    .select('id, name, address, phone, contact_name, email, taller_number, created_at')
    .order('name', { ascending: true });

  if (scope.workshopIds) {
    query = query.in('id', scope.workshopIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[Supabase] Error fetching workshops:', error.message);
    throw new Error(error.message);
  }
  return data ?? [];
}


export async function fetchAllOrders(
  sb: SupabaseClientType,
  userId: string
): Promise<Order[]> {
  const scope = await resolveVisibleWorkshopIds(sb, userId);

  // Taller sin taller asignado → sin pedidos
  if (scope.role === 'taller' && scope.workshopIds && scope.workshopIds.length === 0) {
    return [];
  }

  let ordersQuery = (sb as any)
    .from('orders')
    .select('id, workshop_id, vehicle_brand, vehicle_model, vehicle_version, vehicle_year, internal_order_number, order_number, workshop_order_number, assigned_vendor_id, status, created_at, updated_at, deleted_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (scope.role === 'taller' && scope.workshopIds) {
    // Taller: solo sus propios pedidos
    ordersQuery = ordersQuery.in('workshop_id', scope.workshopIds);
  }
  // Vendedor y Admin: sin filtro → ven todos los pedidos (sistema colaborativo)
  // El control de acciones se hace en la UI según assignedVendorId

  const { data: rows, error } = await ordersQuery;

  if (error) {
    console.error('[Supabase] Error fetching orders:', error.message);
    throw new Error(error.message);
  }
  if (!rows || rows.length === 0) {
    return [];
  }

  const orderIds = rows.map((r: any) => r.id);
  const workshopIds = [...new Set(rows.map((r: any) => r.workshop_id).filter(Boolean))];

  const [workshopsRes, itemsRes, quotesRes, eventsRes] = await Promise.all([
    !workshopIds || workshopIds.length === 0
      ? Promise.resolve({ data: [] })
      : (sb as any).from('workshops').select('id, name, address, phone, contact_name, email, taller_number, created_at').in('id', workshopIds),
    !orderIds || orderIds.length === 0
      ? Promise.resolve({ data: [] })
      : (sb as any).from('order_items').select('id, order_id, part_name, description, quality, quantity, codigo_catalogo, created_at').in('order_id', orderIds),
    !orderIds || orderIds.length === 0
      ? Promise.resolve({ data: [] })
      : (sb as any).from('quotes').select('id, order_id, vendor_id, notes, status, sent_at, created_at').in('order_id', orderIds),
    !orderIds || orderIds.length === 0
      ? Promise.resolve({ data: [] })
      : (sb as any).from('order_events').select('id, order_id, user_id, action, comment, created_at').in('order_id', orderIds).order('created_at', { ascending: true }),
  ]);

  const workshops: any[] = workshopsRes.data ?? [];
  const orderItems: any[] = itemsRes.data ?? [];
  const itemIds = orderItems.map((i: any) => i.id);

  let orderImages: any[] = [];
  if (!itemIds || itemIds.length === 0) {
    // skip query
  } else {
    const { data: imgRows, error: imgErr } = await (sb as any)
      .from('order_images')
      .select('id, order_item_id, url, storage_path, created_at')
      .in('order_item_id', itemIds);
    if (imgErr) {
      console.error('[Supabase] Error fetching order_images:', imgErr.message);
      throw new Error(imgErr.message);
    }
    // Regenerar URLs desde storage_path para garantizar acceso correcto al bucket
    orderImages = (imgRows ?? []).map((img: any) => {
      if (img.storage_path && !(img.url ?? '').startsWith('data:')) {
        const { data: urlData } = sb.storage
          .from('order-images')
          .getPublicUrl(String(img.storage_path));
        return { ...img, url: urlData.publicUrl };
      }
      return img;
    });
  }
  const quotes: any[] = quotesRes.data ?? [];
  const allEvents: any[] = eventsRes.data ?? [];

  const quoteIds = quotes.map((q: any) => q.id);
  let allItems: any[] = [];
  if (!quoteIds || quoteIds.length === 0) {
    // skip query
  } else {
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
  if (!quoteItemIds || quoteItemIds.length === 0) {
    // skip query
  } else {
    const { data: qiiRows, error: qiiErr } = await (sb as any)
      .from('quote_item_images')
      .select('id, quote_item_id, url, storage_path, created_at')
      .in('quote_item_id', quoteItemIds);
    if (qiiErr) {
      console.warn('[Supabase] quote_item_images (¿migración pendiente?):', qiiErr.message);
    } else {
      quoteItemImages = (qiiRows ?? []).map((img: any) => {
        if (img.storage_path && !(img.url ?? '').startsWith('data:')) {
          const { data: urlData } = sb.storage
            .from('quote-images')
            .getPublicUrl(String(img.storage_path));
          return { ...img, url: urlData.publicUrl };
        }
        return img;
      });
    }
  }

  const imagesByQuoteItemId: Record<string, any[]> = {};
  for (const img of quoteItemImages) {
    const k = img.quote_item_id as string;
    if (!imagesByQuoteItemId[k]) imagesByQuoteItemId[k] = [];
    imagesByQuoteItemId[k].push(img);
  }

  // Resolver nombres de usuario (eventos + vendedores asignados)
  const uniqueUserIds = [
    ...new Set([
      ...allEvents.map((e: any) => e.user_id),
      ...rows.map((r: any) => r.assigned_vendor_id),
    ].filter(Boolean)),
  ] as string[];
  const userNames: Record<string, string> = {};
  if (uniqueUserIds && uniqueUserIds.length > 0) {
    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        userNames[uid] = await resolveUserName(sb, uid);
      })
    );
  }

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

    const assignedVendorName = row.assigned_vendor_id ? userNames[row.assigned_vendor_id] : undefined;

    return mapOrder(
      row,
      relatedOrderItems,
      relatedImages,
      workshop ? mapWorkshop(workshop) : undefined,
      quote ? mapQuote(quote, items, imagesByItem) : undefined,
      events,
      assignedVendorName
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

export async function deleteOrderInDB(
  sb: SupabaseClientType,
  orderId: string,
  deletedById?: string
): Promise<boolean> {
  const { error } = await (sb as any)
    .from('orders')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_id: deletedById ?? null,
    })
    .eq('id', orderId);
  if (error) {
    console.error('[Supabase] Error soft-deleting order:', error.message);
    return false;
  }
  return true;
}

export async function fetchDeletedOrders(
  sb: SupabaseClientType,
  limit = 100
): Promise<Order[]> {
  const { data: rows, error } = await (sb as any)
    .from('orders')
    .select('id, workshop_id, vehicle_brand, vehicle_model, vehicle_version, vehicle_year, internal_order_number, order_number, workshop_order_number, assigned_vendor_id, status, created_at, updated_at, deleted_at, deleted_by_id')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Supabase] Error fetching deleted orders:', error.message);
    throw new Error(error.message);
  }
  if (!rows || rows.length === 0) return [];

  const workshopIds = [...new Set(rows.map((r: any) => r.workshop_id).filter(Boolean))];
  const [workshopsRes] = await Promise.all([
    workshopIds.length === 0
      ? Promise.resolve({ data: [] })
      : (sb as any).from('workshops').select('id, name, address, phone, contact_name, email, taller_number, created_at').in('id', workshopIds),
  ]);

  const workshops: any[] = workshopsRes.data ?? [];

  return rows.map((r: any) => {
    const ws = workshops.find((w: any) => w.id === r.workshop_id);
    return {
      id: r.id,
      workshopId: r.workshop_id,
      workshop: ws ? mapWorkshop(ws) : undefined,
      vehicleBrand: r.vehicle_brand,
      vehicleModel: r.vehicle_model,
      vehicleVersion: r.vehicle_version,
      vehicleYear: r.vehicle_year,
      internalOrderNumber: r.internal_order_number ?? undefined,
      orderNumber: r.order_number ?? undefined,
      workshopOrderNumber: r.workshop_order_number ?? undefined,
      assignedVendorId: r.assigned_vendor_id ?? undefined,
      items: [],
      status: r.status,
      events: [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
    } as Order;
  });
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

  // Asignación automática: si la orden no tiene vendedor asignado, lo seteamos
  // con el vendedor que cotizó. Admin puede reasignar después.
  const { data: orderRow } = await (sb as any)
    .from('orders')
    .select('assigned_vendor_id')
    .eq('id', orderId)
    .maybeSingle();

  const updatePayload: Record<string, unknown> = { status: 'cotizado', updated_at: now };
  if (orderRow && !(orderRow as { assigned_vendor_id: string | null }).assigned_vendor_id) {
    updatePayload.assigned_vendor_id = vendorId;
  }

  await (sb as any).from('orders').update(updatePayload).eq('id', orderId);

  await insertEvent(sb, orderId, vendorId, 'cotizacion_enviada', 'Cotización enviada al taller.');
  return true;
}

export async function updateQuoteItemsApproval(
  sb: SupabaseClientType,
  approvedIds: string[],
  rejectedIds: string[]
): Promise<boolean> {
  const results = await Promise.all([
    !approvedIds || approvedIds.length === 0
      ? Promise.resolve({ error: null })
      : (sb as any).from('quote_items').update({ approved: true }).in('id', approvedIds),
    !rejectedIds || rejectedIds.length === 0
      ? Promise.resolve({ error: null })
      : (sb as any).from('quote_items').update({ approved: false }).in('id', rejectedIds),
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
  const { data: rows, error } = await (sb as any)
    .from('orders')
    .select('id, workshop_id, vehicle_brand, vehicle_model, vehicle_version, vehicle_year, internal_order_number, order_number, workshop_order_number, assigned_vendor_id, status, created_at, updated_at')
    .eq('id', orderId)
    .limit(1);

  if (error) {
    console.error('[Supabase] Error fetching order by id:', error.message);
    throw new Error(error.message);
  }

  if (!rows || rows.length === 0) {
    return null;
  }

  const current = rows[0];
  const related = await fetchAllOrdersForIds(sb, [current.id], [current.workshop_id]);
  return related[0] ?? null;
}

/** Cotización del pedido (quote_items con image_url). */
export async function fetchQuoteByOrderId(sb: SupabaseClientType, orderId: string): Promise<Quote | null> {
  const order = await fetchOrderById(sb, orderId);
  return order?.quote ?? null;
}

async function fetchAllOrdersForIds(
  sb: SupabaseClientType,
  orderIds: string[],
  workshopIds: string[]
): Promise<Order[]> {
  const { data: rows, error } = await (sb as any)
    .from('orders')
    .select('id, workshop_id, vehicle_brand, vehicle_model, vehicle_version, vehicle_year, internal_order_number, order_number, workshop_order_number, assigned_vendor_id, status, created_at, updated_at')
    .in('id', orderIds);

  if (error) {
    console.error('[Supabase] Error fetching scoped orders:', error.message);
    throw new Error(error.message);
  }

  if (!rows || rows.length === 0) {
    return [];
  }

  const [workshopsRes, itemsRes, quotesRes, eventsRes] = await Promise.all([
    (sb as any).from('workshops').select('id, name, address, phone, contact_name, email, taller_number, created_at').in('id', workshopIds),
    (sb as any).from('order_items').select('id, order_id, part_name, description, quality, quantity, codigo_catalogo, created_at').in('order_id', orderIds),
    (sb as any).from('quotes').select('id, order_id, vendor_id, notes, status, sent_at, created_at').in('order_id', orderIds),
    (sb as any).from('order_events').select('id, order_id, user_id, action, comment, created_at').in('order_id', orderIds).order('created_at', { ascending: true }),
  ]);

  const workshops: any[] = workshopsRes.data ?? [];
  const orderItems: any[] = itemsRes.data ?? [];
  const itemIds = orderItems.map((i: any) => i.id);
  const quotes: any[] = quotesRes.data ?? [];
  const allEvents: any[] = eventsRes.data ?? [];

  let orderImages: any[] = [];
  if (itemIds.length > 0) {
    const { data: imgRows, error: imgErr } = await (sb as any)
      .from('order_images')
      .select('id, order_item_id, url, storage_path, created_at')
      .in('order_item_id', itemIds);
    if (imgErr) throw new Error(imgErr.message);
    orderImages = (imgRows ?? []).map((img: any) => {
      if (img.storage_path && !(img.url ?? '').startsWith('data:')) {
        const { data: urlData } = sb.storage
          .from('order-images')
          .getPublicUrl(String(img.storage_path));
        return { ...img, url: urlData.publicUrl };
      }
      return img;
    });
  }

  const quoteIds = quotes.map((q: any) => q.id);
  let allItems: any[] = [];
  if (quoteIds.length > 0) {
    const { data: qiRows, error: qiErr } = await (sb as any)
      .from('quote_items')
      .select('id, quote_id, order_item_id, part_name, description, quality, manufacturer, supplier, price, quantity_offered, image_url, notes, approved, created_at')
      .in('quote_id', quoteIds);
    if (qiErr) throw new Error(qiErr.message);
    allItems = qiRows ?? [];
  }

  const quoteItemIds = allItems.map((i: any) => i.id);
  let quoteItemImages: any[] = [];
  if (quoteItemIds.length > 0) {
    const { data: qiiRows } = await (sb as any)
      .from('quote_item_images')
      .select('id, quote_item_id, url, storage_path, created_at')
      .in('quote_item_id', quoteItemIds);
    quoteItemImages = (qiiRows ?? []).map((img: any) => {
      if (img.storage_path && !(img.url ?? '').startsWith('data:')) {
        const { data: urlData } = sb.storage
          .from('quote-images')
          .getPublicUrl(String(img.storage_path));
        return { ...img, url: urlData.publicUrl };
      }
      return img;
    });
  }

  const imagesByQuoteItemId: Record<string, any[]> = {};
  for (const img of quoteItemImages) {
    const key = img.quote_item_id as string;
    if (!imagesByQuoteItemId[key]) imagesByQuoteItemId[key] = [];
    imagesByQuoteItemId[key].push(img);
  }

  const uniqueUserIds = [
    ...new Set([...allEvents.map((e: any) => e.user_id), ...rows.map((r: any) => r.assigned_vendor_id)].filter(Boolean)),
  ] as string[];
  const userNames: Record<string, string> = {};
  if (uniqueUserIds.length > 0) {
    await Promise.all(uniqueUserIds.map(async uid => {
      userNames[uid] = await resolveUserName(sb, uid);
    }));
  }

  return rows.map((row: any) => {
    const workshop = workshops.find((w: any) => w.id === row.workshop_id);
    const quote = quotes.find((q: any) => q.order_id === row.id);
    const items = allItems.filter((i: any) => i.quote_id === quote?.id);
    const imagesByItem: Record<string, any[]> = {};
    for (const item of items) {
      imagesByItem[item.id] = imagesByQuoteItemId[item.id] ?? [];
    }
    const relatedOrderItems = orderItems.filter((i: any) => i.order_id === row.id);
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
      events,
      row.assigned_vendor_id ? userNames[row.assigned_vendor_id] : undefined
    );
  });
}

// ============================================================
// ADMIN: MÉTRICAS Y ASIGNACIÓN
// ============================================================

/** Lista de vendedores (y admins) activos, para el selector de asignación. */
export async function fetchVendors(
  sb: SupabaseClientType
): Promise<Array<{ id: string; name: string; role: 'vendedor' | 'admin' }>> {
  const { data, error } = await (sb as any)
    .from('profiles')
    .select('id, name, role')
    .in('role', ['vendedor', 'admin'])
    .order('name', { ascending: true });

  if (error) {
    console.error('[Supabase] Error fetching vendors:', error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as Array<{ id: string; name: string; role: 'vendedor' | 'admin' }>;
}

/** Rendimiento por vendedor, desde la vista v_vendor_metrics. */
export async function fetchVendorMetrics(sb: SupabaseClientType): Promise<VendorPerformance[]> {
  const { data, error } = await (sb as any)
    .from('v_vendor_metrics')
    .select(
      'vendor_id, vendor_name, total_pedidos, pendientes, en_revision, cotizados, aprobados, aprobados_parcial, rechazados, cerrados, monto_aprobado'
    );

  if (error) {
    console.error('[Supabase] Error fetching vendor metrics:', error.message);
    throw new Error(error.message);
  }

  return (data ?? []).map((r: any) => ({
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    totalPedidos: Number(r.total_pedidos) || 0,
    pendientes: Number(r.pendientes) || 0,
    enRevision: Number(r.en_revision) || 0,
    cotizados: Number(r.cotizados) || 0,
    aprobados: Number(r.aprobados) || 0,
    aprobadosParcial: Number(r.aprobados_parcial) || 0,
    rechazados: Number(r.rechazados) || 0,
    cerrados: Number(r.cerrados) || 0,
    montoAprobado: Number(r.monto_aprobado) || 0,
  }));
}

/** Snapshot global para el dashboard del admin. */
export async function fetchAdminDashboardMetrics(
  sb: SupabaseClientType
): Promise<AdminDashboardMetrics> {
  const [ordersRes, profilesRes, workshopsRes, quoteApprovedRes] = await Promise.all([
    (sb as any).from('orders').select('status'),
    (sb as any).from('profiles').select('role'),
    (sb as any).from('workshops').select('id'),
    (sb as any)
      .from('quote_items')
      .select('price, quantity_offered, approved')
      .eq('approved', true),
  ]);

  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (workshopsRes.error) throw new Error(workshopsRes.error.message);
  if (quoteApprovedRes.error) throw new Error(quoteApprovedRes.error.message);

  const orders: Array<{ status: OrderStatus }> = ordersRes.data ?? [];
  const profiles: Array<{ role: 'taller' | 'vendedor' | 'admin' }> = profilesRes.data ?? [];
  const workshops: Array<{ id: string }> = workshopsRes.data ?? [];
  const approvedItems: Array<{ price: number; quantity_offered: number | null }> =
    quoteApprovedRes.data ?? [];

  const montoAprobado = approvedItems.reduce(
    (sum, it) => sum + Number(it.price) * (it.quantity_offered ?? 1),
    0
  );

  return {
    totalPedidos: orders.length,
    pendientes: orders.filter(o => o.status === 'pendiente').length,
    enRevision: orders.filter(o => o.status === 'en_revision').length,
    cotizados: orders.filter(o => o.status === 'cotizado').length,
    aprobados: orders.filter(o => o.status === 'aprobado').length,
    aprobadosParcial: orders.filter(o => o.status === 'aprobado_parcial').length,
    rechazados: orders.filter(o => o.status === 'rechazado').length,
    cerrados: orders.filter(o => o.status === 'cerrado').length,
    montoAprobado,
    totalTalleres: workshops.length,
    totalVendedores: profiles.filter(p => p.role === 'vendedor' || p.role === 'admin').length,
  };
}

export async function fetchAdminMonthlyMetricsReport(
  sb: SupabaseClientType
): Promise<AdminMonthlyMetricsReport> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const { data: monthOrders, error: monthOrdersError } = await (sb as any)
    .from('orders')
    .select('id, vehicle_brand, vehicle_model, status, assigned_vendor_id, created_at')
    .gte('created_at', monthStart);

  if (monthOrdersError) {
    throw new Error(monthOrdersError.message);
  }

  const orders = (monthOrders ?? []) as Array<{
    id: string;
    vehicle_brand: string;
    vehicle_model: string;
    status: OrderStatus;
    assigned_vendor_id: string | null;
    created_at: string;
  }>;

  const orderIds = orders.map(order => order.id);

  const [quotesRes, quoteItemsRes, orderItemsRes, vendorMetrics] = await Promise.all([
    orderIds.length === 0
      ? Promise.resolve({ data: [] })
      : (sb as any).from('quotes').select('id, order_id, vendor_id').in('order_id', orderIds),
    orderIds.length === 0
      ? Promise.resolve({ data: [] })
      : (sb as any)
          .from('quote_items')
          .select('id, quote_id, price, quantity_offered, approved, part_name'),
    orderIds.length === 0
      ? Promise.resolve({ data: [] })
      : (sb as any).from('order_items').select('id, order_id, part_name').in('order_id', orderIds),
    fetchVendorMetrics(sb),
  ]);

  const quotes = (quotesRes.data ?? []) as Array<{ id: string; order_id: string; vendor_id: string }>;
  const quotesByOrderId = new Map(quotes.map(quote => [quote.order_id, quote]));
  const quoteIds = new Set(quotes.map(quote => quote.id));
  const monthlyQuoteItems = ((quoteItemsRes.data ?? []) as Array<{
    id: string;
    quote_id: string;
    price: number;
    quantity_offered: number | null;
    approved: boolean | null;
    part_name: string;
  }>).filter(item => quoteIds.has(item.quote_id));
  const orderItems = (orderItemsRes.data ?? []) as Array<{ id: string; order_id: string; part_name: string }>;

  const billedPerOrder = new Map<string, number>();
  for (const item of monthlyQuoteItems) {
    if (item.approved !== true) continue;
    const quote = quotes.find(row => row.id === item.quote_id);
    if (!quote) continue;
    billedPerOrder.set(
      quote.order_id,
      (billedPerOrder.get(quote.order_id) ?? 0) + Number(item.price) * (item.quantity_offered ?? 1)
    );
  }

  const totalFacturadoMes = Array.from(billedPerOrder.values()).reduce((sum, current) => sum + current, 0);
  const ticketPromedioMes = orders.length > 0 ? totalFacturadoMes / orders.length : 0;

  const statusLabels: Record<OrderStatus, string> = {
    pendiente:        'Pendiente',
    en_revision:      'En revisión',
    cotizado:         'Cotizado',
    aprobado:         'Aprobado',
    aprobado_parcial: 'Aprobado parcial',
    rechazado:        'Rechazado',
    cerrado:          'Cerrado',
    cerrado_pagado:   'Cerrado · Pagado',
    en_conflicto:     'En conflicto',
  };

  const pedidosPorEstado = (Object.keys(statusLabels) as OrderStatus[]).map(status => ({
    status,
    label: statusLabels[status],
    total: orders.filter(order => order.status === status).length,
  }));

  const topByCount = (values: string[], fallback: string) => {
    if (values.length === 0) return fallback;
    const counts = values.reduce<Record<string, number>>((acc, value) => {
      const key = value.trim();
      if (!key) return acc;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const [top] =
      Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    return top?.[0] ?? fallback;
  };

  const vendorMap = new Map<string, MonthlyVendorMetrics>();
  const vendorNames = new Map(vendorMetrics.map(vendor => [vendor.vendorId, vendor.vendorName]));

  for (const order of orders) {
    const quote = quotesByOrderId.get(order.id);
    const vendorId = order.assigned_vendor_id ?? quote?.vendor_id;
    if (!vendorId) continue;

    const current = vendorMap.get(vendorId) ?? {
      vendorId,
      vendorName: vendorNames.get(vendorId) ?? 'Sin nombre',
      pedidosAtendidos: 0,
      pedidosCotizados: 0,
      pedidosAprobados: 0,
      totalFacturado: 0,
    };

    current.pedidosAtendidos += 1;
    if (quote) current.pedidosCotizados += 1;
    if (order.status === 'aprobado' || order.status === 'aprobado_parcial') current.pedidosAprobados += 1;
    current.totalFacturado += billedPerOrder.get(order.id) ?? 0;

    vendorMap.set(vendorId, current);
  }

  const vendedores = Array.from(vendorMap.values()).sort(
    (a, b) => b.totalFacturado - a.totalFacturado || a.vendorName.localeCompare(b.vendorName, 'es')
  );

  return {
    monthLabel,
    totalPedidosMes: orders.length,
    totalFacturadoMes,
    ticketPromedioMes,
    pedidosPorEstado,
    vendedores,
    topMarca: topByCount(orders.map(order => order.vehicle_brand), 'Sin datos'),
    topModelo: topByCount(orders.map(order => order.vehicle_model), 'Sin datos'),
    topProducto: topByCount(orderItems.map(item => item.part_name), 'Sin datos'),
  };
}

export async function fetchProfilesDirectory(sb: SupabaseClientType): Promise<ProfileDirectoryEntry[]> {
  const { data: profiles, error } = await (sb as any)
    .from('profiles')
    .select('id, name, role, phone, workshop_id, assigned_workshops')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const workshopIds = [...new Set((profiles ?? []).map((profile: any) => profile.workshop_id).filter(Boolean))];
  const assignedIds = [...new Set((profiles ?? []).flatMap((profile: any) => profile.assigned_workshops ?? []))];
  const allWorkshopIds = [...new Set([...workshopIds, ...assignedIds])];

  const { data: workshops, error: workshopsError } =
    allWorkshopIds.length === 0
      ? { data: [], error: null }
      : await (sb as any)
          .from('workshops')
          .select('id, name, email')
          .in('id', allWorkshopIds);

  if (workshopsError) {
    throw new Error(workshopsError.message);
  }

  const workshopMap = new Map<string, { id: string; name: string; email: string | null }>(
    (workshops ?? []).map((workshop: any) => [
      workshop.id,
      {
        id: workshop.id,
        name: workshop.name,
        email: workshop.email ?? null,
      },
    ])
  );

  return (profiles ?? []).map((profile: any) => ({
    id: profile.id,
    name: profile.name,
    role: profile.role,
    phone: profile.phone,
    email: profile.workshop_id ? workshopMap.get(profile.workshop_id)?.email ?? null : null,
    workshopId: profile.workshop_id ?? null,
    workshopName: profile.workshop_id ? workshopMap.get(profile.workshop_id)?.name ?? null : null,
    assignedWorkshops: (profile.assigned_workshops ?? []).map((id: string) => workshopMap.get(id)?.name ?? id),
  }));
}

// ============================================================
// COLA GENERAL: TOMAR / LIBERAR
// ============================================================

/**
 * Un vendedor toma un pedido de la cola general (self-assign).
 * Race-condition proof: solo actualiza si el pedido sigue sin asignar.
 */
export async function takeOrderInDB(
  sb: SupabaseClientType,
  orderId: string,
  vendorId: string
): Promise<boolean> {
  const { error } = await (sb as any)
    .from('orders')
    .update({ assigned_vendor_id: vendorId, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('assigned_vendor_id', null); // solo si no está tomado

  if (error) {
    console.error('[Supabase] Error taking order:', error.message);
    return false;
  }

  await insertEvent(sb, orderId, vendorId, 'pedido_tomado', 'Pedido tomado de la cola por el vendedor.');
  return true;
}

/**
 * Un vendedor libera su pedido a la cola general.
 * Solo puede liberar un pedido que le pertenece (o admin via assignOrderToVendor).
 */
export async function releaseOrderInDB(
  sb: SupabaseClientType,
  orderId: string,
  vendorId: string
): Promise<boolean> {
  const { error } = await (sb as any)
    .from('orders')
    .update({ assigned_vendor_id: null, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('assigned_vendor_id', vendorId); // solo el dueño puede liberar

  if (error) {
    console.error('[Supabase] Error releasing order:', error.message);
    return false;
  }

  await insertEvent(sb, orderId, vendorId, 'pedido_liberado', 'Pedido liberado a la cola general.');
  return true;
}

/** Reasignar un pedido a otro vendedor (solo admin). */
export async function assignOrderToVendor(
  sb: SupabaseClientType,
  orderId: string,
  vendorId: string | null
): Promise<boolean> {
  const { error } = await (sb as any)
    .from('orders')
    .update({ assigned_vendor_id: vendorId, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    console.error('[Supabase] Error assigning order:', error.message);
    return false;
  }
  return true;
}

// ============================================================
// BLOQUES 3 & 4: ESTADOS DE CIERRE, RECLAMOS Y MÉTRICAS
// ============================================================

/**
 * Admin marca un pedido como pagado (cerrado → cerrado_pagado).
 * Solo funciona si el pedido está en estado 'cerrado' o 'en_conflicto'.
 */
export async function markOrderPaidInDB(
  sb: SupabaseClientType,
  orderId: string,
  adminId: string
): Promise<boolean> {
  const { error } = await (sb as any)
    .from('orders')
    .update({ status: 'cerrado_pagado', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .in('status', ['cerrado', 'en_conflicto']); // permite resolver conflictos también

  if (error) {
    console.error('[Supabase] Error marking order as paid:', error.message);
    return false;
  }

  await insertEvent(
    sb,
    orderId,
    adminId,
    'pedido_pagado',
    'Pago confirmado por el administrador.'
  );
  return true;
}

/**
 * Taller inicia un reclamo en un pedido cerrado (cerrado → en_conflicto).
 * El motivo del reclamo se guarda como comentario en el evento.
 */
export async function initiateClaimInDB(
  sb: SupabaseClientType,
  orderId: string,
  userId: string,
  reason: string
): Promise<boolean> {
  const { error } = await (sb as any)
    .from('orders')
    .update({ status: 'en_conflicto', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'cerrado'); // solo desde estado cerrado

  if (error) {
    console.error('[Supabase] Error initiating claim:', error.message);
    return false;
  }

  await insertEvent(sb, orderId, userId, 'reclamo_iniciado', reason);
  return true;
}

/**
 * KPIs del dashboard admin basados en pedidos cerrado_pagado.
 * Llama al RPC get_admin_kpis(p_start, p_end).
 * Si el RPC no existe aún (migración pendiente), retorna ceros.
 */
export async function fetchAdminKPIs(
  sb: SupabaseClientType,
  startDate: string,
  endDate: string
): Promise<AdminKPIResult> {
  const { data, error } = await (sb as any).rpc('get_admin_kpis', {
    p_start: startDate,
    p_end: endDate,
  });

  if (error) {
    console.warn('[Supabase] get_admin_kpis RPC error (¿migración pendiente?):', error.message);
    return { totalFacturado: 0, ticketPromedio: 0, totalCompletados: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { totalFacturado: 0, ticketPromedio: 0, totalCompletados: 0 };

  return {
    totalFacturado:    Number(row.total_facturado)   || 0,
    ticketPromedio:    Number(row.ticket_promedio)   || 0,
    totalCompletados:  Number(row.total_completados) || 0,
  };
}

/**
 * Ranking de vendedores por facturación (RPC get_vendor_ranking).
 * Si el RPC no existe, retorna array vacío.
 */
export async function fetchVendorRanking(
  sb: SupabaseClientType,
  startDate: string,
  endDate: string
): Promise<VendorRankEntry[]> {
  const { data, error } = await (sb as any).rpc('get_vendor_ranking', {
    p_start: startDate,
    p_end: endDate,
  });

  if (error) {
    console.warn('[Supabase] get_vendor_ranking RPC error:', error.message);
    return [];
  }

  return (data ?? []).map((r: any) => ({
    vendorId:        r.vendor_id,
    vendorName:      r.vendor_name,
    pedidosCerrados: Number(r.pedidos_cerrados) || 0,
    montoFacturado:  Number(r.monto_facturado)  || 0,
  }));
}

/**
 * Ranking de talleres por volumen de compra (RPC get_workshop_ranking).
 * Si el RPC no existe, retorna array vacío.
 */
export async function fetchWorkshopRanking(
  sb: SupabaseClientType,
  startDate: string,
  endDate: string
): Promise<WorkshopRankEntry[]> {
  const { data, error } = await (sb as any).rpc('get_workshop_ranking', {
    p_start: startDate,
    p_end: endDate,
  });

  if (error) {
    console.warn('[Supabase] get_workshop_ranking RPC error:', error.message);
    return [];
  }

  return (data ?? []).map((r: any) => ({
    workshopId:    r.workshop_id,
    workshopName:  r.workshop_name,
    totalPedidos:  Number(r.total_pedidos)  || 0,
    montoComprado: Number(r.monto_comprado) || 0,
  }));
}

/**
 * Cuenta los pedidos actualmente en conflicto.
 * Usado para el banner de alerta en el dashboard admin.
 */
export async function fetchConflictCount(sb: SupabaseClientType): Promise<number> {
  const { count, error } = await (sb as any)
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'en_conflicto');

  if (error) {
    console.error('[Supabase] Error fetching conflict count:', error.message);
    return 0;
  }
  return count ?? 0;
}

// ============================================================
// CATÁLOGO DE VEHÍCULOS
// ============================================================

/**
 * Devuelve el catálogo completo de vehículos como JSON anidado:
 * { "Audi": { "A3": ["A3 02/04", "A3 05/08"], ... }, ... }
 * Se carga una sola vez en el formulario de nuevo pedido.
 */
export async function fetchVehiclesCatalog(
  sb: SupabaseClientType
): Promise<Record<string, Record<string, string[]>>> {
  // PostgREST default limit is 1000 rows — override with 10000 to cover any realistic catalog.
  // Current dataset: ~2000 rows. This single fetch is cached client-side in vehiclesCatalog state.
  const { data, error } = await (sb as any)
    .from('vehiculos')
    .select('marca, modelo, version')
    .order('marca', { ascending: true })
    .order('modelo', { ascending: true })
    .order('version', { ascending: true })
    .limit(10000);

  if (error) {
    console.error('[Supabase] Error fetching vehiculos catalog:', error.message);
    return {};
  }
  if (!data || data.length === 0) return {};

  const catalog: Record<string, Record<string, string[]>> = {};
  for (const row of data as { marca: string; modelo: string; version: string }[]) {
    if (!catalog[row.marca]) catalog[row.marca] = {};
    if (!catalog[row.marca][row.modelo]) catalog[row.marca][row.modelo] = [];
    catalog[row.marca][row.modelo].push(row.version);
  }
  return catalog;
}
