-- ============================================================
-- PORTAL B2B AUTOPARTES — Schema Supabase (Idempotente)
-- ============================================================
-- Ejecutar este script en el SQL Editor de Supabase
-- Diseñado para no fallar si los objetos ya existen.
-- ============================================================

-- EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- TIPOS (ENUMS) - Creación segura condicional
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('taller', 'vendedor');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_quality') THEN
        CREATE TYPE order_quality AS ENUM ('alta', 'media', 'baja');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM (
          'pendiente', 'en_revision', 'cotizado',
          'aprobado_parcial', 'aprobado', 'rechazado', 'cerrado'
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_status') THEN
        CREATE TYPE quote_status AS ENUM ('borrador', 'enviada');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_action') THEN
        CREATE TYPE event_action AS ENUM (
          'pedido_creado', 'pedido_en_revision', 'cotizacion_enviada',
          'cotizacion_aprobada', 'cotizacion_rechazada',
          'cotizacion_aprobada_parcial', 'pedido_cerrado', 'comentario'
        );
    END IF;
END$$;

-- ────────────────────────────────────────────────────────────
-- TALLERES
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workshops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  contact_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- PERFILES (extends auth.users)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'taller',
  workshop_id UUID REFERENCES workshops(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role;
  v_name TEXT;
  v_workshop_id UUID;
BEGIN
  -- Manejo seguro del rol por si viene data inválida en los metadatos
  BEGIN
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'taller');
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_role := 'taller';
  END;

  v_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.email, 'Usuario nuevo');

  -- Si el rol asignado es taller, creamos su entidad workshop automáticamente
  IF v_role = 'taller' THEN
    INSERT INTO public.workshops (name, phone, address, email)
    VALUES (
      v_name,
      NEW.raw_user_meta_data->>'phone',
      NEW.raw_user_meta_data->>'address',
      NEW.email
    )
    RETURNING id INTO v_workshop_id;
  END IF;

  INSERT INTO public.profiles (id, name, role, workshop_id)
  VALUES (NEW.id, v_name, v_role, v_workshop_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminamos el trigger si existe, y lo recreamos
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────────────────────────
-- PEDIDOS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID NOT NULL REFERENCES workshops(id),
  vehicle_brand TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_version TEXT NOT NULL,
  vehicle_year INT NOT NULL,
  internal_order_number TEXT,
  status order_status NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aseguramos que las columnas existan por si la tabla ya había sido creada antes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_order_number TEXT;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- ÍTEMS DE PEDIDO
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL,
  description TEXT,
  quality order_quality NOT NULL DEFAULT 'media',
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- IMÁGENES DE REPUESTO (Asociadas al ítem)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- COTIZACIONES
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES profiles(id),
  notes TEXT,
  status quote_status NOT NULL DEFAULT 'borrador',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- ÍTEMS DE COTIZACIÓN
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  part_name TEXT NOT NULL,
  description TEXT,
  quality order_quality NOT NULL DEFAULT 'media',
  manufacturer TEXT,
  supplier TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  notes TEXT,
  approved BOOLEAN DEFAULT NULL,   -- NULL=pendiente, TRUE=aprobado, FALSE=rechazado
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- HISTORIAL DE EVENTOS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  action event_action NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────

ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- ─── PROFILES ───
DROP POLICY IF EXISTS "profiles: owner can read" ON profiles;
CREATE POLICY "profiles: owner can read" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles: owner can update" ON profiles;
CREATE POLICY "profiles: owner can update" ON profiles
  FOR UPDATE USING (auth.uid() = id);


-- ─── WORKSHOPS ───
DROP POLICY IF EXISTS "workshops: taller can read own" ON workshops;
CREATE POLICY "workshops: taller can read own" ON workshops
  FOR SELECT USING (
    id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid()
    )
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );


-- ─── ORDERS ───
DROP POLICY IF EXISTS "orders: taller can see own" ON orders;
CREATE POLICY "orders: taller can see own" ON orders
  FOR SELECT USING (
    workshop_id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller'
    )
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

DROP POLICY IF EXISTS "orders: taller can insert" ON orders;
CREATE POLICY "orders: taller can insert" ON orders
  FOR INSERT WITH CHECK (
    workshop_id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller'
    )
  );

DROP POLICY IF EXISTS "orders: vendor can update" ON orders;
CREATE POLICY "orders: vendor can update" ON orders
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
    OR
    workshop_id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid()
    )
  );


-- ─── ORDER ITEMS ───
DROP POLICY IF EXISTS "order_items: taller can see own items" ON order_items;
CREATE POLICY "order_items: taller can see own items" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE workshop_id IN (SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller')
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

DROP POLICY IF EXISTS "order_items: taller can insert" ON order_items;
CREATE POLICY "order_items: taller can insert" ON order_items
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT id FROM orders WHERE workshop_id IN (SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller')
    )
  );


-- ─── ORDER IMAGES ───
DROP POLICY IF EXISTS "order_images: readable" ON order_images;
CREATE POLICY "order_images: readable" ON order_images
  FOR SELECT USING (true); -- Permitimos lectura pública/autenticada para simplificar vistas

DROP POLICY IF EXISTS "order_images: taller can insert" ON order_images;
CREATE POLICY "order_images: taller can insert" ON order_images
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );


-- ─── QUOTES ───
DROP POLICY IF EXISTS "quotes: taller can read" ON quotes;
CREATE POLICY "quotes: taller can read" ON quotes
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE workshop_id IN (
        SELECT workshop_id FROM profiles WHERE id = auth.uid()
      )
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

DROP POLICY IF EXISTS "quotes: vendor can insert" ON quotes;
CREATE POLICY "quotes: vendor can insert" ON quotes
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

DROP POLICY IF EXISTS "quotes: vendor can update" ON quotes;
CREATE POLICY "quotes: vendor can update" ON quotes
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );


-- ─── QUOTE ITEMS ───
DROP POLICY IF EXISTS "quote_items: readable" ON quote_items;
CREATE POLICY "quote_items: readable" ON quote_items
  FOR SELECT USING (
    quote_id IN (SELECT id FROM quotes)
  );

DROP POLICY IF EXISTS "quote_items: vendor can insert" ON quote_items;
CREATE POLICY "quote_items: vendor can insert" ON quote_items
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

DROP POLICY IF EXISTS "quote_items: taller can update approved" ON quote_items;
CREATE POLICY "quote_items: taller can update approved" ON quote_items
  FOR UPDATE USING (true);


-- ─── ORDER EVENTS ───
DROP POLICY IF EXISTS "order_events: readable" ON order_events;
CREATE POLICY "order_events: readable" ON order_events
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE workshop_id IN (
        SELECT workshop_id FROM profiles WHERE id = auth.uid()
      )
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

DROP POLICY IF EXISTS "order_events: insertable" ON order_events;
CREATE POLICY "order_events: insertable" ON order_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ────────────────────────────────────────────────────────────
-- ÍNDICES (Creación segura)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_workshop ON orders(workshop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_updated ON orders(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_order ON quotes(order_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON order_events(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKETS (ejecutar desde Supabase Dashboard -> Storage)
-- ────────────────────────────────────────────────────────────
-- (Descomentar en un entorno limpio si la API pública está habilitada)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('order-images', 'order-images', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('quote-images', 'quote-images', false) ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- FIN DEL SCHEMA
-- ────────────────────────────────────────────────────────────
-- IMPORTANTE: Los usuarios 'vendedor' deben crearse manualmente 
-- desde el dashboard de Supabase (Authentication > Add User) y 
-- luego establecer su metadato {"role": "vendedor", "name": "Vendedor"}
-- Los 'talleres' se registran automáticamente desde la app.

