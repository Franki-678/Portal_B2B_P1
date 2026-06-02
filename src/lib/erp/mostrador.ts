/**
 * Mostrador POS — Data Access Layer
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PosClient {
  id:         string;
  dni:        string | null;
  full_name:  string;
  phone:      string | null;
  email:      string | null;
  address:    string | null;
  notes:      string | null;
  created_at: string;
  created_by: string | null;
}

export interface PosClientHistory {
  id:             string;
  client_id:      string;
  changed_by:     string;
  changed_at:     string;
  field_changes:  Record<string, { old: unknown; new: unknown }>;
  profile?:       { name: string };
}

export interface PosOrder {
  id:              string;
  client_id:       string | null;
  vendor_id:       string;
  vehicle_details: PosVehicleDetails | null;
  total_amount:    number;
  status:          'open' | 'closed' | 'cancelled';
  notes:           string | null;
  created_at:      string;
  closed_at:       string | null;
  client?:         PosClient | null;
  vendor?:         { id: string; name: string } | null;
  items?:          PosOrderItem[];
}

export interface PosVehicleDetails {
  brand:  string;
  model:  string;
  year:   string;
  engine: string;
  plate:  string;
}

export interface PosOrderItem {
  id:          string;
  pos_order_id: string;
  part_name:   string;
  description: string | null;
  quantity:    number;
  unit_price:  number;
  subtotal:    number;
}

const sb = (client: SupabaseClient) => client as any;

// ─── Clientes ─────────────────────────────────────────────────────────────

export async function searchClients(
  client: SupabaseClient,
  query: string,
  limit = 10
): Promise<PosClient[]> {
  const q = query.trim();
  if (!q) return [];

  const { data } = await sb(client)
    .from('pos_clients')
    .select('*')
    .or(`full_name.ilike.%${q}%,dni.ilike.%${q}%`)
    .order('full_name')
    .limit(limit);

  return (data ?? []) as PosClient[];
}

export async function createClient(
  client: SupabaseClient,
  data: Omit<PosClient, 'id' | 'created_at'>,
  userId: string
): Promise<PosClient | null> {
  const { data: created } = await sb(client)
    .from('pos_clients')
    .insert({ ...data, created_by: userId })
    .select()
    .single();

  return created as PosClient | null;
}

export async function updateClient(
  client: SupabaseClient,
  clientId: string,
  updates: Partial<Omit<PosClient, 'id' | 'created_at'>>,
  userId: string,
  original: PosClient
): Promise<void> {
  // Calcular cambios para el historial
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, newVal] of Object.entries(updates)) {
    const oldVal = (original as any)[key];
    if (oldVal !== newVal) changes[key] = { old: oldVal, new: newVal };
  }

  await sb(client).from('pos_clients').update(updates).eq('id', clientId);

  if (Object.keys(changes).length > 0) {
    await sb(client).from('pos_client_history').insert({
      client_id:     clientId,
      changed_by:    userId,
      field_changes: changes,
    });
  }
}

export async function getClientById(
  client: SupabaseClient,
  clientId: string
): Promise<PosClient | null> {
  const { data } = await sb(client)
    .from('pos_clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();
  return data as PosClient | null;
}

export async function getClientHistory(
  client: SupabaseClient,
  clientId: string
): Promise<PosClientHistory[]> {
  const { data } = await sb(client)
    .from('pos_client_history')
    .select('*, profile:profiles(name)')
    .eq('client_id', clientId)
    .order('changed_at', { ascending: false });
  return (data ?? []) as PosClientHistory[];
}

export async function listClients(
  client: SupabaseClient,
  opts: { search?: string; page?: number; perPage?: number } = {}
): Promise<{ data: PosClient[]; count: number }> {
  const { search, page = 0, perPage = 20 } = opts;
  let q = sb(client)
    .from('pos_clients')
    .select('*', { count: 'exact' })
    .order('full_name');

  if (search?.trim()) q = q.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%`);
  q = q.range(page * perPage, page * perPage + perPage - 1);

  const { data, count } = await q;
  return { data: (data ?? []) as PosClient[], count: count ?? 0 };
}

// ─── Pedidos ──────────────────────────────────────────────────────────────

export async function createOrder(
  client: SupabaseClient,
  params: {
    clientId:       string | null;
    vendorId:       string;
    vehicleDetails: PosVehicleDetails | null;
    items:          { part_name: string; description: string; quantity: number; unit_price: number }[];
    notes:          string;
  }
): Promise<PosOrder | null> {
  const { clientId, vendorId, vehicleDetails, items, notes } = params;
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const { data: order } = await sb(client)
    .from('pos_orders')
    .insert({
      client_id:       clientId,
      vendor_id:       vendorId,
      vehicle_details: vehicleDetails,
      total_amount:    total,
      status:          'closed',
      notes:           notes || null,
      closed_at:       new Date().toISOString(),
      updated_by:      vendorId,
    })
    .select()
    .single();

  if (!order) return null;

  if (items.length > 0) {
    await sb(client).from('pos_order_items').insert(
      items.map(i => ({ pos_order_id: order.id, ...i }))
    );
  }

  return order as PosOrder;
}

export async function listOrders(
  client: SupabaseClient,
  opts: {
    vendorId?:  string;
    status?:    string;
    dateFrom?:  string;
    dateTo?:    string;
    search?:    string;
    page?:      number;
    perPage?:   number;
  } = {}
): Promise<{ data: PosOrder[]; count: number }> {
  const { vendorId, status, dateFrom, dateTo, page = 0, perPage = 25 } = opts;

  let q = sb(client)
    .from('pos_orders')
    .select(`
      *,
      client:pos_clients(id, full_name, dni, phone),
      vendor:profiles(id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (vendorId) q = q.eq('vendor_id', vendorId);
  if (status)   q = q.eq('status', status);
  if (dateFrom) q = q.gte('created_at', dateFrom);
  if (dateTo)   q = q.lte('created_at', dateTo);
  q = q.range(page * perPage, page * perPage + perPage - 1);

  const { data, count } = await q;
  return { data: (data ?? []) as PosOrder[], count: count ?? 0 };
}

export async function getOrderWithItems(
  client: SupabaseClient,
  orderId: string
): Promise<PosOrder | null> {
  const { data } = await sb(client)
    .from('pos_orders')
    .select(`
      *,
      client:pos_clients(*),
      vendor:profiles(id, name),
      items:pos_order_items(*)
    `)
    .eq('id', orderId)
    .single();
  return data as PosOrder | null;
}

export async function updateOrder(
  client: SupabaseClient,
  orderId: string,
  updates: Partial<PosOrder>,
  userId: string
): Promise<void> {
  await sb(client).from('pos_orders').update({ ...updates, updated_by: userId }).eq('id', orderId);
}

// ─── Métricas POS ─────────────────────────────────────────────────────────

export interface PosDailyMetric {
  date:  string;
  total: number;
  count: number;
}

export async function getDailyMetrics(
  client: SupabaseClient,
  days = 30
): Promise<PosDailyMetric[]> {
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await sb(client)
    .from('pos_orders')
    .select('created_at, total_amount')
    .eq('status', 'closed')
    .gte('created_at', from)
    .order('created_at');

  const map: Record<string, { total: number; count: number }> = {};
  for (const row of (data ?? []) as any[]) {
    const day = row.created_at.slice(0, 10);
    if (!map[day]) map[day] = { total: 0, count: 0 };
    map[day].total += Number(row.total_amount) || 0;
    map[day].count += 1;
  }
  return Object.entries(map).map(([date, v]) => ({ date, ...v }));
}

export async function getVendorRanking(
  client: SupabaseClient,
  monthOffset = 0
): Promise<{ vendorId: string; name: string; total: number; count: number }[]> {
  const now   = new Date();
  const month = now.getMonth() + monthOffset;
  const year  = now.getFullYear() + Math.floor(month / 12);
  const m     = ((month % 12) + 12) % 12;
  const from  = new Date(year, m, 1).toISOString();
  const to    = new Date(year, m + 1, 1).toISOString();

  const { data } = await sb(client)
    .from('pos_orders')
    .select('vendor_id, total_amount, profiles!inner(name)')
    .eq('status', 'closed')
    .gte('created_at', from)
    .lt('created_at', to);

  const map: Record<string, { name: string; total: number; count: number }> = {};
  for (const row of (data ?? []) as any[]) {
    const vid = row.vendor_id;
    if (!map[vid]) map[vid] = { name: row.profiles?.name ?? 'Vendedor', total: 0, count: 0 };
    map[vid].total += Number(row.total_amount) || 0;
    map[vid].count += 1;
  }
  return Object.entries(map)
    .map(([vendorId, v]) => ({ vendorId, ...v }))
    .sort((a, b) => b.total - a.total);
}
