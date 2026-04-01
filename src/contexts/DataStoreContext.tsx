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
import { generateId } from '@/lib/utils';
import { isSupabaseConfigured, getSupabaseClient } from '@/lib/supabase/client';
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
  createOrder: (data: {
    workshopId: string;
    workshop?: import("@/lib/types").Workshop;
    vehicleBrand: string;
    vehicleModel: string;
    vehicleVersion: string;
    vehicleYear: number;
    items: {
      partName: string;
      description: string;
      quality: import("@/lib/types").OrderQuality;
      quantity: number;
      images: File[];
    }[];
  }) => Promise<Order>;
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
      items: (Omit<QuoteItem, 'id' | 'quoteId'> & { imageFile?: File })[];
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

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(usingSupabase);

  // ─── Carga inicial desde Supabase ─────────────────────────

  const refreshOrders = useCallback(async () => {
    if (!usingSupabase) return;
    const sb = getSupabaseClient();
    setIsLoading(true);
    try {
      const data = await fetchAllOrders(sb);
      setOrders(data);
    } catch (err) {
      console.error('[DataStore] Error loading orders from Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  }, [usingSupabase]);

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
      data: {
        workshopId: string;
        workshop?: import("@/lib/types").Workshop;
        vehicleBrand: string;
        vehicleModel: string;
        vehicleVersion: string;
        vehicleYear: number;
        items: {
          partName: string;
          description: string;
          quality: import("@/lib/types").OrderQuality;
          quantity: number;
          images: File[];
        }[];
      }
    ): Promise<import("@/lib/types").Order> => {
      const sb = getSupabaseClient();
      const orderId = await createOrderInDB(
        sb,
        {
          workshopId: data.workshopId,
          vehicleBrand: data.vehicleBrand,
          vehicleModel: data.vehicleModel,
          vehicleVersion: data.vehicleVersion,
          vehicleYear: data.vehicleYear,
          items: data.items.map(i => ({
            partName: i.partName,
            description: i.description,
            quality: i.quality,
            quantity: i.quantity,
            images: i.images,
          })),
        },
        data.workshop?.id ?? data.workshopId
      );

      if (orderId) {
        await refreshOrders();
        const created = orders.find(o => o.id === orderId);
        if (created) return created;
      }
      
      throw new Error("No se pudo crear el pedido en la base de datos");
    },
    [refreshOrders, orders]
  );

  const approveQuote = useCallback(
    async (orderId: string, userId: string, userName: string) => {
      const sb = getSupabaseClient();
      const order = orders.find(o => o.id === orderId);
      const allIds = order?.quote?.items.map(i => i.id) ?? [];
      await updateQuoteItemsApproval(sb, allIds, []);
      await updateOrderStatus(sb, orderId, 'aprobado', userId, 'cotizacion_aprobada', 'Cotización aprobada en su totalidad.');
      await refreshOrders();
    },
    [orders, refreshOrders]
  );

  const rejectQuote = useCallback(
    async (orderId: string, userId: string, userName: string, comment: string) => {
      const sb = getSupabaseClient();
      await updateOrderStatus(sb, orderId, 'rechazado', userId, 'cotizacion_rechazada', comment);
      await refreshOrders();
    },
    [refreshOrders]
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
      const sb = getSupabaseClient();
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
    },
    [refreshOrders]
  );

  // ============================================================
  // VENDEDOR ACTIONS
  // ============================================================

  const setOrderInReview = useCallback(
    async (orderId: string, userId: string, userName: string, comment?: string) => {
      const sb = getSupabaseClient();
      await updateOrderStatus(sb, orderId, 'en_revision', userId, 'pedido_en_revision', comment);
      await refreshOrders();
    },
    [refreshOrders]
  );

  const submitQuote = useCallback(
    async (
      orderId: string,
      quoteData: {
        notes: string;
        items: (Omit<QuoteItem, 'id' | 'quoteId'> & { imageFile?: File })[];
        vendorId: string;
        vendorName: string;
      }
    ) => {
      const sb = getSupabaseClient();
      await createQuoteInDB(
        sb,
        orderId,
        quoteData.vendorId,
        quoteData.notes,
        quoteData.items.map(({ approved, ...rest }) => rest)
      );
      await refreshOrders();
    },
    [refreshOrders]
  );

  const closeOrder = useCallback(
    async (orderId: string, userId: string, userName: string, comment?: string) => {
      const sb = getSupabaseClient();
      await updateOrderStatus(sb, orderId, 'cerrado', userId, 'pedido_cerrado', comment);
      await refreshOrders();
    },
    [refreshOrders]
  );

  // ============================================================
  // RENDER
  // ============================================================

  if (!usingSupabase) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-950 text-white font-sans">
        <div className="bg-rose-500/10 border border-rose-500/50 rounded-2xl p-8 max-w-lg w-full">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-rose-500 mb-4 tracking-tight">Error de Configuración</h2>
          <p className="text-sm text-zinc-300 mb-4 font-medium leading-relaxed">
            La conexión con Supabase es requerida para el funcionamiento del portal B2B. Por favor configurá las variables de entorno en <span className="text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">.env.local</span> dentro del directorio <span className="text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">portal-b2b</span>.
          </p>
          <pre className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-xs overflow-x-auto text-rose-300 mb-4 shadow-inner">
NEXT_PUBLIC_SUPABASE_URL="https://tu-proyecto.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
          </pre>
          <p className="text-xs font-semibold text-rose-400">
            El sistema se ha bloqueado para prevenir pérdida de datos, ya que no se permite el uso de mock data.
          </p>
        </div>
      </div>
    );
  }

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
