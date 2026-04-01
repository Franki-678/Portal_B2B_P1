-- ============================================================
-- PORTAL B2B AUTOPARTES — Schema Supabase
-- ============================================================
-- Ejecutar este script en el SQL Editor de Supabase
-- ============================================================

-- EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- TIPOS (ENUMS)
-- ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('taller', 'vendedor');
CREATE TYPE order_quality AS ENUM ('alta', 'media', 'baja');
CREATE TYPE order_status AS ENUM (
  'pendiente', 'en_revision', 'cotizado',
  'aprobado_parcial', 'aprobado', 'rechazado', 'cerrado'
);
CREATE TYPE quote_status AS ENUM ('borrador', 'enviada');
CREATE TYPE event_action AS ENUM (
  'pedido_creado', 'pedido_en_revision', 'cotizacion_enviada',
  'cotizacion_aprobada', 'cotizacion_rechazada',
  'cotizacion_aprobada_parcial', 'pedido_cerrado', 'comentario'
);

-- ────────────────────────────────────────────────────────────
-- TALLERES
-- ────────────────────────────────────────────────────────────

CREATE TABLE workshops (
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

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'taller',
  workshop_id UUID REFERENCES workshops(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'taller')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────────────────────────
-- PEDIDOS
-- ────────────────────────────────────────────────────────────

CREATE TABLE orders (
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

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- ÍTEMS DE PEDIDO
-- ────────────────────────────────────────────────────────────

CREATE TABLE order_items (
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

CREATE TABLE order_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- COTIZACIONES
-- ────────────────────────────────────────────────────────────

CREATE TABLE quotes (
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

CREATE TABLE quote_items (
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

CREATE TABLE order_events (
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

-- Perfil: siempre puede verse a sí mismo
CREATE POLICY "profiles: owner can read" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles: owner can update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Talleres: el taller puede ver el suyo, el vendedor todos
CREATE POLICY "workshops: taller can read own" ON workshops
  FOR SELECT USING (
    id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid()
    )
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Pedidos: taller ve los suyos, vendedor ve todos
CREATE POLICY "orders: taller can see own" ON orders
  FOR SELECT USING (
    workshop_id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller'
    )
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

CREATE POLICY "orders: taller can insert" ON orders
  FOR INSERT WITH CHECK (
    workshop_id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller'
    )
  );

CREATE POLICY "orders: vendor can update" ON orders
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
    OR
    workshop_id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Order Items: heredan visibilidad del pedido
CREATE POLICY "order_items: taller can see own items" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE workshop_id IN (SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller')
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

CREATE POLICY "order_items: taller can insert" ON order_items
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT id FROM orders WHERE workshop_id IN (SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller')
    )
  );

-- Order Images: heredan visibilidad 
CREATE POLICY "order_images: readable" ON order_images
  FOR SELECT USING (true); -- Permitimos lectura pública/autenticada para simplificar vistas

CREATE POLICY "order_images: taller can insert" ON order_images
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Cotizaciones: taller puede ver las de sus pedidos, vendedor puede CRUD
CREATE POLICY "quotes: taller can read" ON quotes
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE workshop_id IN (
        SELECT workshop_id FROM profiles WHERE id = auth.uid()
      )
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

CREATE POLICY "quotes: vendor can insert" ON quotes
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

CREATE POLICY "quotes: vendor can update" ON quotes
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Quote items (mismo patrón que quotes)
CREATE POLICY "quote_items: readable" ON quote_items
  FOR SELECT USING (
    quote_id IN (SELECT id FROM quotes)
  );

CREATE POLICY "quote_items: vendor can insert" ON quote_items
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

CREATE POLICY "quote_items: taller can update approved" ON quote_items
  FOR UPDATE USING (true); -- Puede restringirse más

-- Order events: visible para todos los involucrados
CREATE POLICY "order_events: readable" ON order_events
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE workshop_id IN (
        SELECT workshop_id FROM profiles WHERE id = auth.uid()
      )
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

CREATE POLICY "order_events: insertable" ON order_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ────────────────────────────────────────────────────────────
-- ÍNDICES
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_orders_workshop ON orders(workshop_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_updated ON orders(updated_at DESC);
CREATE INDEX idx_quotes_order ON quotes(order_id);
CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX idx_events_order ON order_events(order_id);
CREATE INDEX idx_events_created ON order_events(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKETS (ejecutar desde Supabase Dashboard o API)
-- ────────────────────────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public) VALUES ('order-images', 'order-images', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('quote-images', 'quote-images', false);
