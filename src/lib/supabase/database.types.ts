// ============================================================
// TIPOS DE BASE DE DATOS — generados para Supabase
// Sincronizados con supabase/schema.sql
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      workshops: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          phone: string | null;
          contact_name: string | null;
          email: string | null;
          taller_number: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          contact_name?: string | null;
          email?: string | null;
          taller_number?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workshops']['Insert']>;
      };
      profiles: {
        Row: {
          id: string;
          name: string;
          role: 'taller' | 'vendedor' | 'admin';
          workshop_id: string | null;
          assigned_workshops: string[] | null;
          phone: string | null;
          company_name: string | null;
          company_address: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          role?: 'taller' | 'vendedor' | 'admin';
          workshop_id?: string | null;
          assigned_workshops?: string[] | null;
          phone?: string | null;
          company_name?: string | null;
          company_address?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      orders: {
        Row: {
          id: string;
          workshop_id: string;
          vehicle_brand: string;
          vehicle_model: string;
          vehicle_version: string;
          vehicle_year: number;
          internal_order_number: string | null;
          order_number: string | null;
          workshop_order_number: number | null;
          assigned_vendor_id: string | null;
          status:
            | 'pendiente'
            | 'en_revision'
            | 'cotizado'
            | 'aprobado_parcial'
            | 'aprobado'
            | 'rechazado'
            | 'cerrado';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workshop_id: string;
          vehicle_brand: string;
          vehicle_model: string;
          vehicle_version: string;
          vehicle_year: number;
          internal_order_number?: string | null;
          order_number?: string | null;
          workshop_order_number?: number | null;
          assigned_vendor_id?: string | null;
          status?: Database['public']['Tables']['orders']['Row']['status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          part_name: string;
          description: string | null;
          quality: 'alta' | 'media' | 'baja';
          quantity: number;
          codigo_catalogo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          part_name: string;
          description?: string | null;
          quality?: 'alta' | 'media' | 'baja';
          quantity?: number;
          codigo_catalogo?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>;
      };
      catalogo_repuestos: {
        Row: {
          id: string;
          codigo: string;
          descripcion: string;
          marca: string | null;
          anios: string | null;
          tipo_pieza: string | null;
          origen: string | null;
          precio: number | null;
          stock_cba: boolean;
          imagen_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          codigo: string;
          descripcion: string;
          marca?: string | null;
          anios?: string | null;
          tipo_pieza?: string | null;
          origen?: string | null;
          precio?: number | null;
          stock_cba?: boolean;
          imagen_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['catalogo_repuestos']['Insert']>;
      };
      order_images: {
        Row: {
          id: string;
          order_item_id: string;
          url: string;
          storage_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_item_id: string;
          url: string;
          storage_path?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_images']['Insert']>;
      };
      quotes: {
        Row: {
          id: string;
          order_id: string;
          vendor_id: string;
          notes: string | null;
          status: 'borrador' | 'enviada';
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          vendor_id: string;
          notes?: string | null;
          status?: 'borrador' | 'enviada';
          sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['quotes']['Insert']>;
      };
      quote_items: {
        Row: {
          id: string;
          quote_id: string;
          order_item_id: string | null;
          part_name: string;
          description: string | null;
          quality: 'alta' | 'media' | 'baja';
          manufacturer: string | null;
          supplier: string | null;
          price: number;
          quantity_offered: number;
          image_url: string | null;
          notes: string | null;
          approved: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          quote_id: string;
          order_item_id?: string | null;
          part_name: string;
          description?: string | null;
          quality?: 'alta' | 'media' | 'baja';
          manufacturer?: string | null;
          supplier?: string | null;
          price?: number;
          quantity_offered?: number;
          image_url?: string | null;
          notes?: string | null;
          approved?: boolean | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['quote_items']['Insert']>;
      };
      quote_item_images: {
        Row: {
          id: string;
          quote_item_id: string;
          url: string;
          storage_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          quote_item_id: string;
          url: string;
          storage_path?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['quote_item_images']['Insert']>;
      };
      order_events: {
        Row: {
          id: string;
          order_id: string;
          user_id: string;
          action:
            | 'pedido_creado'
            | 'pedido_en_revision'
            | 'cotizacion_enviada'
            | 'cotizacion_aprobada'
            | 'cotizacion_rechazada'
            | 'cotizacion_aprobada_parcial'
            | 'pedido_cerrado'
            | 'comentario';
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          user_id: string;
          action: Database['public']['Tables']['order_events']['Row']['action'];
          comment?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_events']['Insert']>;
      };
    };
  };
};

// ─── Helpers de tipo ──────────────────────────────────────────

export type DbOrder = Database['public']['Tables']['orders']['Row'];
export type DbOrderItem = Database['public']['Tables']['order_items']['Row'];
export type DbOrderImage = Database['public']['Tables']['order_images']['Row'];
export type DbQuote = Database['public']['Tables']['quotes']['Row'];
export type DbQuoteItem = Database['public']['Tables']['quote_items']['Row'];
export type DbQuoteItemImage = Database['public']['Tables']['quote_item_images']['Row'];
export type DbOrderEvent = Database['public']['Tables']['order_events']['Row'];
export type DbWorkshop = Database['public']['Tables']['workshops']['Row'];
export type DbProfile = Database['public']['Tables']['profiles']['Row'];
export type DbCatalogoRepuesto = Database['public']['Tables']['catalogo_repuestos']['Row'];

// ─── Vistas ───────────────────────────────────────────────────
// Reflejo de public.v_vendor_metrics (creada en migration_admin_role.sql).
export interface DbVendorMetrics {
  vendor_id: string;
  vendor_name: string;
  total_pedidos: number;
  pendientes: number;
  en_revision: number;
  cotizados: number;
  aprobados: number;
  aprobados_parcial: number;
  rechazados: number;
  cerrados: number;
  monto_aprobado: number;
}
