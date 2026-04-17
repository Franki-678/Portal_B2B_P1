'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Order, Quote, QuoteItem, OrderEvent, OrderStatus } from '@/lib/types';
import { calculateQuoteTotal, generateId, quoteLineTotal } from '@/lib/utils';
import { isSupabaseConfigured, getSupabaseClient } from '@/lib/supabase/client';
import { postNotify } from '@/lib/email/client-notify';
import {
  fetchAllOrders,
  createOrderInDB,
  updateOrderStatus,
  createQuoteInDB,
  updateQuoteItemsApproval,
  fetchAllWorkshops,
  fetchOrderById,
  deleteOrderInDB,
  takeOrderInDB,
  releaseOrderInDB,
} from '@/lib/supabase/queries';

// ============================================================
// TIPOS DEL STORE
// ============================================================

const WORKSHOPS_CACHE_MS = 5 * 60 * 1000;

interface DataStoreContextType {
  orders: Order[];
  workshops: any[]; // Todos los talleres
  /** True si cualquier bloque de datos está cargando (compatibilidad). */
  isLoading: boolean;
  isLoadingOrders: boolean;
  isLoadingWorkshops: boolean;
  /** Mensaje si falló la carga desde Supabase (sin datos mock). */
  loadError: string | null;
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
    internalOrderNumber?: string;
    items: {
      partName: string;
      codigoCatalogo?: string | null;
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
  getAllWorkshops: () => any[];
  setOrderInReview: (orderId: string, userId: string, userName: string, comment?: string) => Promise<void>;
  submitQuote: (
    orderId: string,
    quoteData: {
      notes: string;
      items: (Omit<QuoteItem, 'id' | 'quoteId' | 'images'> & { imageFile?: File; imageFiles?: File[] })[];
      vendorId: string;
      vendorName: string;
    }
  ) => Promise<void>;
  closeOrder: (orderId: string, userId: string, userName: string, comment?: string) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<boolean>;
  /** Vendedor toma un pedido de la cola general (self-assign). */
  takeOrder: (orderId: string) => Promise<boolean>;
  /** Vendedor libera su pedido de vuelta a la cola. */
  releaseOrder: (orderId: string) => Promise<boolean>;
  /** Recarga pedidos; talleres solo si venció la caché o forceWorkshops. */
  refreshData: (opts?: { forceWorkshops?: boolean; silent?: boolean }) => Promise<void>;
  /** Fuerza recarga de pedidos y talleres (botón Reintentar). */
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
  const { user, isLoading: authLoading } = useAuth();
  const usingSupabase = isSupabaseConfigured();

  const [orders, setOrders] = useState<Order[]>([]);
  const [workshops, setWorkshops] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingWorkshops, setIsLoadingWorkshops] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const workshopsRef = useRef<any[]>([]);
  const lastWorkshopsFetchRef = useRef(0);

  useEffect(() => {
    workshopsRef.current = workshops;
  }, [workshops]);

  const isLoading = authLoading || isLoadingOrders || isLoadingWorkshops;

  // ─── Carga desde Supabase (tras auth; talleres con caché 5 min) ──

  const refreshData = useCallback(
    async (opts?: { forceWorkshops?: boolean; silent?: boolean }) => {
      if (!usingSupabase || !user) return;
      const sb = getSupabaseClient();
      setLoadError(null);

      const now = Date.now();
      const workshopsStale =
        Boolean(opts?.forceWorkshops) ||
        lastWorkshopsFetchRef.current === 0 ||
        now - lastWorkshopsFetchRef.current >= WORKSHOPS_CACHE_MS;

      if (!opts?.silent) {
        setIsLoadingOrders(true);
        if (workshopsStale) setIsLoadingWorkshops(true);
      }

      try {
        const ordersData = await fetchAllOrders(sb, user.id);

        const workshopsData = workshopsStale
          ? await fetchAllWorkshops(sb, user.id).then(data => {
              lastWorkshopsFetchRef.current = Date.now();
              return data;
            })
          : workshopsRef.current;

        setOrders(ordersData);
        if (!ordersData || ordersData.length === 0) {
          if (workshopsStale) {
            setWorkshops(workshopsData);
          }
          return;
        }
        if (workshopsStale) {
          setWorkshops(workshopsData);
        }
      } catch (err) {
        console.error('[DataStore] Error loading data from Supabase:', err);
        const message =
          err instanceof Error ? err.message : 'No se pudieron cargar los datos. Intentá de nuevo más tarde.';
        setLoadError(message);
      } finally {
        if (!opts?.silent) {
          setIsLoadingOrders(false);
          setIsLoadingWorkshops(false);
        }
      }
    },
    [usingSupabase, user]
  );

  const refreshOrders = useCallback(async () => {
    await refreshData({ forceWorkshops: true });
  }, [refreshData]);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setWorkshops([]);
      setLoadError(null);
      lastWorkshopsFetchRef.current = 0;
      setIsLoadingOrders(false);
      setIsLoadingWorkshops(false);
    }
  }, [user]);

  useEffect(() => {
    if (!usingSupabase) return;
    if (authLoading || !user) return;
    setIsLoadingOrders(true);
    // Primer carga al autenticarse. Si falla, reintenta una sola vez tras 3 segundos.
    void refreshData().catch(() => {
      setTimeout(() => void refreshData({ silent: true }), 3_000);
    });
  }, [usingSupabase, user, authLoading, refreshData]);

  useEffect(() => {
    if (authLoading && !user) {
      setIsLoadingOrders(true);
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    // 5 minutos entre polls — reduce egress de Supabase
    const interval = setInterval(() => {
      void refreshData({ silent: true });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, refreshData]);

  useEffect(() => {
    if (!user) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshData({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [user, refreshData]);

  // ─── Helper para actualizar estado local ──────────────────

  const updateLocalOrder = useCallback(
    (orderId: string, updater: (order: Order) => Order) => {
      setOrders(prev => prev.map(o => (o.id === orderId ? updater(o) : o)));
    },
    []
  );

  const getAllWorkshops = useCallback(() => [...workshops], [workshops]);

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

  const getAllOrders = useCallback(() => [...orders], [orders]);

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
        internalOrderNumber?: string;
        items: {
          partName: string;
          codigoCatalogo?: string | null;
          description: string;
          quality: import("@/lib/types").OrderQuality;
          quantity: number;
          images: File[];
        }[];
      }
    ): Promise<import("@/lib/types").Order> => {

      if (!data.workshopId) {
        throw new Error("Tu taller no está configurado correctamente. Contactá al administrador.");
      }

      const sb = getSupabaseClient();
      const orderId = await createOrderInDB(
        sb,
        {
          workshopId: data.workshopId,
          vehicleBrand: data.vehicleBrand,
          vehicleModel: data.vehicleModel,
          vehicleVersion: data.vehicleVersion,
          vehicleYear: data.vehicleYear,
          internalOrderNumber: data.internalOrderNumber,
          items: data.items.map(i => ({
            partName: i.partName,
            codigoCatalogo: i.codigoCatalogo ?? null,
            description: i.description,
            quality: i.quality,
            quantity: i.quantity,
            images: i.images,
          })),
        },
        data.workshopId // Using genuine workshopId as userId for the event instead of the mock fallback
      );

      if (orderId) {
        await refreshData();
        const full = await fetchOrderById(sb, orderId);
        if (full?.workshop) {
          postNotify('vendor_new_order', orderId, {
            order: full,
            workshop: full.workshop,
          });
        }
        // Evitamos buscar en `orders` (stale closure), devolvemos el objeto mínimo necesario
        // para que el router.push en el UI funcione.
        return { id: orderId } as import("@/lib/types").Order;
      }
      
      throw new Error("No se pudo crear el pedido en la base de datos");
    },
    [refreshData]
  );

  const approveQuote = useCallback(
    async (orderId: string, userId: string, userName: string) => {
      const sb = getSupabaseClient();
      const order = orders.find(o => o.id === orderId);
      const allIds = order?.quote?.items.map(i => i.id) ?? [];
      await updateQuoteItemsApproval(sb, allIds, []);
      await updateOrderStatus(sb, orderId, 'aprobado', userId, 'cotizacion_aprobada', 'Cotización aprobada en su totalidad.');
      await refreshData();
      const full = await fetchOrderById(sb, orderId);
      if (full?.workshop && full.quote) {
        const total = calculateQuoteTotal(full.quote.items);
        postNotify('vendor_quote_response', orderId, {
          order: full,
          workshop: full.workshop,
          response: { kind: 'aprobado', totalApproved: total },
        });
      }
    },
    [orders, refreshData]
  );

  const rejectQuote = useCallback(
    async (orderId: string, userId: string, userName: string, comment: string) => {
      const sb = getSupabaseClient();
      await updateOrderStatus(sb, orderId, 'rechazado', userId, 'cotizacion_rechazada', comment);
      await refreshData();
      const full = await fetchOrderById(sb, orderId);
      if (full?.workshop) {
        postNotify('vendor_quote_response', orderId, {
          order: full,
          workshop: full.workshop,
          response: { kind: 'rechazado', totalApproved: 0 },
        });
      }
    },
    [refreshData]
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
      await refreshData();
      const full = await fetchOrderById(sb, orderId);
      if (full?.workshop && full.quote) {
        const total = full.quote.items
          .filter(i => i.approved === true)
          .reduce((s, i) => s + quoteLineTotal(i), 0);
        postNotify('vendor_quote_response', orderId, {
          order: full,
          workshop: full.workshop,
          response: { kind: 'aprobado_parcial', totalApproved: total },
        });
      }
    },
    [refreshData]
  );

  // ============================================================
  // VENDEDOR ACTIONS
  // ============================================================

  const setOrderInReview = useCallback(
    async (orderId: string, userId: string, userName: string, comment?: string) => {
      const sb = getSupabaseClient();
      await updateOrderStatus(sb, orderId, 'en_revision', userId, 'pedido_en_revision', comment);
      await refreshData();
      const full = await fetchOrderById(sb, orderId);
      const tallerEmail = full?.workshop?.email?.trim();
      if (full && tallerEmail) {
        postNotify('taller_order_in_review', orderId, {
          order: full,
          tallerEmail,
        });
      }
    },
    [refreshData]
  );

  const submitQuote = useCallback(
    async (
      orderId: string,
      quoteData: {
        notes: string;
        items: (Omit<QuoteItem, 'id' | 'quoteId' | 'images'> & { imageFile?: File; imageFiles?: File[] })[];
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
      await refreshData();
      const full = await fetchOrderById(sb, orderId);
      const tallerEmail = full?.workshop?.email?.trim();
      if (full?.quote && tallerEmail) {
        postNotify('taller_quote_received', orderId, {
          order: full,
          quote: full.quote,
          tallerEmail,
        });
      }
    },
    [refreshData]
  );

  const closeOrder = useCallback(
    async (orderId: string, userId: string, userName: string, comment?: string) => {
      const sb = getSupabaseClient();
      await updateOrderStatus(sb, orderId, 'cerrado', userId, 'pedido_cerrado', comment);
      await refreshData();
      const full = await fetchOrderById(sb, orderId);
      const tallerEmail = full?.workshop?.email?.trim();
      if (full && tallerEmail) {
        postNotify('taller_order_closed', orderId, {
          order: full,
          tallerEmail,
        });
      }
    },
    [refreshData]
  );

  const deleteOrder = useCallback(async (orderId: string): Promise<boolean> => {
    const sb = getSupabaseClient();
    const ok = await deleteOrderInDB(sb, orderId);
    if (ok) {
      setOrders(prev => prev.filter(o => o.id !== orderId));
    }
    return ok;
  }, []);

  const takeOrder = useCallback(
    async (orderId: string): Promise<boolean> => {
      if (!user) return false;
      const sb = getSupabaseClient();
      const ok = await takeOrderInDB(sb, orderId, user.id);
      if (ok) {
        // Optimistic update: asignar al usuario actual
        updateLocalOrder(orderId, order => ({
          ...order,
          assignedVendorId: user.id,
          assignedVendorName: user.name,
        }));
        void refreshData({ silent: true });
      }
      return ok;
    },
    [user, updateLocalOrder, refreshData]
  );

  const releaseOrder = useCallback(
    async (orderId: string): Promise<boolean> => {
      if (!user) return false;
      const sb = getSupabaseClient();
      const ok = await releaseOrderInDB(sb, orderId, user.id);
      if (ok) {
        // Optimistic update: liberar asignación
        updateLocalOrder(orderId, order => ({
          ...order,
          assignedVendorId: undefined,
          assignedVendorName: undefined,
        }));
        void refreshData({ silent: true });
      }
      return ok;
    },
    [user, updateLocalOrder, refreshData]
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
        workshops,
        isLoading,
        isLoadingOrders,
        isLoadingWorkshops,
        loadError,
        isUsingSupabase: usingSupabase,
        getWorkshopOrders,
        getOrderById,
        createOrder,
        approveQuote,
        rejectQuote,
        approveQuotePartial,
        getAllOrders,
        getAllWorkshops,
        setOrderInReview,
        submitQuote,
        closeOrder,
        deleteOrder,
        takeOrder,
        releaseOrder,
        refreshData,
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
