'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { Order, Quote, QuoteItem, OrderEvent, OrderStatus } from '@/lib/types';
import { MOCK_ORDERS, MOCK_WORKSHOPS } from '@/lib/mock-data';
import { generateId } from '@/lib/utils';
import { isSupabaseConfigured, getSupabaseClientOrNull, SupabaseClientType } from '@/lib/supabase/client';
import {
  fetchAllOrders,
  createOrderInDB,
  updateOrderStatus,
  createQuoteInDB,
  updateQuoteItemsApproval,
} from '@/lib/supabase/queries';

// ============================================================
// TIPOS DEL STORE
// ============================================================

interface DataStoreContextType {
  orders: Order[];
  isLoading: boolean;
  isUsingSupabase: boolean;
  // Taller
  getWorkshopOrders: (workshopId: string) => Order[];
  getOrderById: (id: string) => Order | undefined;
  createOrder: (
    data: Omit<Order, 'id' | 'events' | 'status' | 'images' | 'createdAt' | 'updatedAt'>
  ) => Promise<Order>;
  approveQuote: (orderId: string, userId: string, userName: string) => Promise<void>;
  rejectQuote: (orderId: string, userId: string, userName: string, comment: string) => Promise<void>;
  approveQuotePartial: (
    orderId: string,
    userId: string,
    userName: string,
    approvedItemIds: string[],
    rejectedItemIds: string[],
    comment?: string
  ) => Promise<void>;
  // Vendedor
  getAllOrders: () => Order[];
  setOrderInReview: (orderId: string, userId: string, userName: string, comment?: string) => Promise<void>;
  submitQuote: (
    orderId: string,
    quoteData: {
      notes: string;
      items: Omit<QuoteItem, 'id' | 'quoteId'>[];
      vendorId: string;
      vendorName: string;
    }
  ) => Promise<void>;
  closeOrder: (orderId: string, userId: string, userName: string, comment?: string) => Promise<void>;
  refreshOrders: () => Promise<void>;
}

// ============================================================
// CONTEXT
// ============================================================

const DataStoreContext = createContext<DataStoreContextType | null>(null);

// ============================================================
// HELPER: crear evento local
// ============================================================

function makeEvent(
  orderId: string,
  userId: string,
  userName: string,
  action: OrderEvent['action'],
  comment?: string
): OrderEvent {
  return {
    id: generateId(),
    orderId,
    userId,
    userName,
    action,
    comment,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================
// PROVIDER
// ============================================================

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const usingSupabase = isSupabaseConfigured();
  const sb = getSupabaseClientOrNull() as SupabaseClientType | null;

  const [orders, setOrders] = useState<Order[]>(usingSupabase ? [] : MOCK_ORDERS);
  const [isLoading, setIsLoading] = useState(usingSupabase);

  // ─── Carga inicial desde Supabase ─────────────────────────

  const refreshOrders = useCallback(async () => {
    if (!usingSupabase || !sb) return;
    setIsLoading(true);
    try {
      const data = await fetchAllOrders(sb);
      setOrders(data);
    } catch (err) {
      console.error('[DataStore] Error loading orders from Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  }, [usingSupabase, sb]);

  useEffect(() => {
    if (usingSupabase) {
      refreshOrders();
    }
  }, [usingSupabase, refreshOrders]);

  // ─── Helper para actualizar estado local ──────────────────

  const updateLocalOrder = useCallback(
    (orderId: string, updater: (order: Order) => Order) => {
      setOrders(prev => prev.map(o => (o.id === orderId ? updater(o) : o)));
    },
    []
  );

  // ============================================================
  // GETTERS
  // ============================================================

  const getWorkshopOrders = useCallback(
    (workshopId: string) => orders.filter(o => o.workshopId === workshopId),
    [orders]
  );

  const getOrderById = useCallback(
    (id: string) => orders.find(o => o.id === id),
    [orders]
  );

  const getAllOrders = useCallback(
    () =>
      [...orders].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [orders]
  );

  // ============================================================
  // TALLER ACTIONS
  // ============================================================

  const createOrder = useCallback(
    async (
      data: Omit<Order, 'id' | 'events' | 'status' | 'images' | 'createdAt' | 'updatedAt'>
    ): Promise<Order> => {
      const now = new Date().toISOString();

      // ── SUPABASE MODE ──────────────────────────────────────
      if (usingSupabase && sb) {
        const orderId = await createOrderInDB(
          sb,
          {
            workshopId: data.workshopId,
            vehicleBrand: data.vehicleBrand,
            vehicleModel: data.vehicleModel,
            vehicleYear: data.vehicleYear,
            partName: data.partName,
            description: data.description,
            quality: data.quality,
          },
          data.workshop?.id ?? data.workshopId
        );

        if (orderId) {
          await refreshOrders();
          const created = orders.find(o => o.id === orderId);
          if (created) return created;
        }
      }

      // ── MOCK MODE (fallback) ────────────────────────────────
      const workshop = MOCK_WORKSHOPS.find(w => w.id === data.workshopId);
      const newOrder: Order = {
        ...data,
        id: `order-${generateId()}`,
        status: 'pendiente',
        images: [],
        events: [],
        workshop: data.workshop || workshop,
        createdAt: now,
        updatedAt: now,
      };
      const firstEvent = makeEvent(
        newOrder.id,
        data.workshop?.id ?? 'unknown',
        data.workshop?.name ?? 'Taller',
        'pedido_creado',
        'Pedido ingresado desde el portal.'
      );
      newOrder.events = [firstEvent];
      setOrders(prev => [newOrder, ...prev]);
      return newOrder;
    },
    [usingSupabase, sb, refreshOrders, orders]
  );

  const approveQuote = useCallback(
    async (orderId: string, userId: string, userName: string) => {
      if (usingSupabase && sb) {
        const order = orders.find(o => o.id === orderId);
        const allIds = order?.quote?.items.map(i => i.id) ?? [];
        await updateQuoteItemsApproval(sb, allIds, []);
        await updateOrderStatus(sb, orderId, 'aprobado', userId, 'cotizacion_aprobada', 'Cotización aprobada en su totalidad.');
        await refreshOrders();
        return;
      }

      // Mock
      updateLocalOrder(orderId, order => ({
        ...order,
        status: 'aprobado' as OrderStatus,
        updatedAt: new Date().toISOString(),
        quote: order.quote
          ? { ...order.quote, items: order.quote.items.map(i => ({ ...i, approved: true })) }
          : undefined,
        events: [...order.events, makeEvent(orderId, userId, userName, 'cotizacion_aprobada', 'Cotización aprobada en su totalidad.')],
      }));
    },
    [usingSupabase, sb, orders, refreshOrders, updateLocalOrder]
  );

  const rejectQuote = useCallback(
    async (orderId: string, userId: string, userName: string, comment: string) => {
      if (usingSupabase && sb) {
        await updateOrderStatus(sb, orderId, 'rechazado', userId, 'cotizacion_rechazada', comment);
        await refreshOrders();
        return;
      }

      updateLocalOrder(orderId, order => ({
        ...order,
        status: 'rechazado' as OrderStatus,
        updatedAt: new Date().toISOString(),
        events: [...order.events, makeEvent(orderId, userId, userName, 'cotizacion_rechazada', comment)],
      }));
    },
    [usingSupabase, sb, refreshOrders, updateLocalOrder]
  );

  const approveQuotePartial = useCallback(
    async (
      orderId: string,
      userId: string,
      userName: string,
      approvedItemIds: string[],
      rejectedItemIds: string[],
      comment?: string
    ) => {
      if (usingSupabase && sb) {
        await updateQuoteItemsApproval(sb, approvedItemIds, rejectedItemIds);
        await updateOrderStatus(
          sb,
          orderId,
          'aprobado_parcial',
          userId,
          'cotizacion_aprobada_parcial',
          comment || 'Cotización aprobada parcialmente.'
        );
        await refreshOrders();
        return;
      }

      updateLocalOrder(orderId, order => ({
        ...order,
        status: 'aprobado_parcial' as OrderStatus,
        updatedAt: new Date().toISOString(),
        quote: order.quote
          ? {
              ...order.quote,
              items: order.quote.items.map(item => ({
                ...item,
                approved: approvedItemIds.includes(item.id)
                  ? true
                  : rejectedItemIds.includes(item.id)
                  ? false
                  : null,
              })),
            }
          : undefined,
        events: [
          ...order.events,
          makeEvent(orderId, userId, userName, 'cotizacion_aprobada_parcial', comment || 'Cotización aprobada parcialmente.'),
        ],
      }));
    },
    [usingSupabase, sb, refreshOrders, updateLocalOrder]
  );

  // ============================================================
  // VENDEDOR ACTIONS
  // ============================================================

  const setOrderInReview = useCallback(
    async (orderId: string, userId: string, userName: string, comment?: string) => {
      if (usingSupabase && sb) {
        await updateOrderStatus(sb, orderId, 'en_revision', userId, 'pedido_en_revision', comment);
        await refreshOrders();
        return;
      }

      updateLocalOrder(orderId, order => ({
        ...order,
        status: 'en_revision' as OrderStatus,
        updatedAt: new Date().toISOString(),
        events: [...order.events, makeEvent(orderId, userId, userName, 'pedido_en_revision', comment)],
      }));
    },
    [usingSupabase, sb, refreshOrders, updateLocalOrder]
  );

  const submitQuote = useCallback(
    async (
      orderId: string,
      quoteData: {
        notes: string;
        items: Omit<QuoteItem, 'id' | 'quoteId'>[];
        vendorId: string;
        vendorName: string;
      }
    ) => {
      if (usingSupabase && sb) {
        await createQuoteInDB(
          sb,
          orderId,
          quoteData.vendorId,
          quoteData.notes,
          quoteData.items.map(({ approved, ...rest }) => rest)
        );
        await refreshOrders();
        return;
      }

      // Mock
      const quoteId = `quote-${generateId()}`;
      const now = new Date().toISOString();
      const newQuote: Quote = {
        id: quoteId,
        orderId,
        vendorId: quoteData.vendorId,
        notes: quoteData.notes,
        status: 'enviada',
        items: quoteData.items.map(item => ({
          ...item,
          id: generateId(),
          quoteId,
          approved: null,
        })),
        sentAt: now,
        createdAt: now,
      };
      updateLocalOrder(orderId, order => ({
        ...order,
        status: 'cotizado' as OrderStatus,
        quote: newQuote,
        updatedAt: now,
        events: [
          ...order.events,
          makeEvent(orderId, quoteData.vendorId, quoteData.vendorName, 'cotizacion_enviada', 'Cotización enviada al taller.'),
        ],
      }));
    },
    [usingSupabase, sb, refreshOrders, updateLocalOrder]
  );

  const closeOrder = useCallback(
    async (orderId: string, userId: string, userName: string, comment?: string) => {
      if (usingSupabase && sb) {
        await updateOrderStatus(sb, orderId, 'cerrado', userId, 'pedido_cerrado', comment);
        await refreshOrders();
        return;
      }

      updateLocalOrder(orderId, order => ({
        ...order,
        status: 'cerrado' as OrderStatus,
        updatedAt: new Date().toISOString(),
        events: [...order.events, makeEvent(orderId, userId, userName, 'pedido_cerrado', comment)],
      }));
    },
    [usingSupabase, sb, refreshOrders, updateLocalOrder]
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <DataStoreContext.Provider
      value={{
        orders,
        isLoading,
        isUsingSupabase: usingSupabase,
        getWorkshopOrders,
        getOrderById,
        createOrder,
        approveQuote,
        rejectQuote,
        approveQuotePartial,
        getAllOrders,
        setOrderInReview,
        submitQuote,
        closeOrder,
        refreshOrders,
      }}
    >
      {children}
    </DataStoreContext.Provider>
  );
}

export function useDataStore() {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error('useDataStore debe usarse dentro de DataStoreProvider');
  return ctx;
}
