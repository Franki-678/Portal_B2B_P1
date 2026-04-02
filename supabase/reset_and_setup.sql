-- ============================================================
-- PORTAL B2B AUTOPARTES — Reset Completo y Setup
-- ============================================================
-- Ejecutar completo en: Supabase Dashboard → SQL Editor
-- Este script es 100% idempotente: se puede ejecutar N veces
-- sin errores. Borra todo y lo recrea limpio.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- SECCIÓN 1: LIMPIEZA TOTAL (orden correcto por FK)
-- ────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS order_events  CASCADE;
DROP TABLE IF EXISTS quote_items   CASCADE;
DROP TABLE IF EXISTS quotes        CASCADE;
DROP TABLE IF EXISTS order_images  CASCADE;
DROP TABLE IF EXISTS order_items   CASCADE;
DROP TABLE IF EXISTS orders        CASCADE;
DROP TABLE IF EXISTS profiles      CASCADE;
DROP TABLE IF EXISTS workshops     CASCADE;

DROP TYPE IF EXISTS event_action   CASCADE;
DROP TYPE IF EXISTS quote_status   CASCADE;
DROP TYPE IF EXISTS order_status   CASCADE;
DROP TYPE IF EXISTS order_quality  CASCADE;
DROP TYPE IF EXISTS user_role      CASCADE;

-- Eliminar funciones/triggers previos
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user()   CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;


-- ────────────────────────────────────────────────────────────
-- SECCIÓN 2: EXTENSIONES
-- ────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ────────────────────────────────────────────────────────────
-- SECCIÓN 3: TIPOS ENUM
-- ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('taller', 'vendedor');

CREATE TYPE order_quality AS ENUM ('alta', 'media', 'baja');

CREATE TYPE order_status AS ENUM (
  'pendiente',
  'en_revision',
  'cotizado',
  'aprobado_parcial',
  'aprobado',
  'rechazado',
  'cerrado'
);

CREATE TYPE quote_status AS ENUM ('borrador', 'enviada');

CREATE TYPE event_action AS ENUM (
  'pedido_creado',
  'pedido_en_revision',
  'cotizacion_enviada',
  'cotizacion_aprobada',
  'cotizacion_rechazada',
  'cotizacion_aprobada_parcial',
  'pedido_cerrado',
  'comentario'
);


-- ────────────────────────────────────────────────────────────
-- SECCIÓN 4: TABLAS
-- ────────────────────────────────────────────────────────────

-- 4.1 — TALLERES
CREATE TABLE workshops (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT        NOT NULL,
  address      TEXT,
  phone        TEXT,
  contact_name TEXT,
  email        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 — PERFILES (extiende auth.users 1:1)
CREATE TABLE profiles (
  id          UUID       PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT       NOT NULL,
  role        user_role  NOT NULL DEFAULT 'taller',
  workshop_id UUID       REFERENCES workshops(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4.3 — PEDIDOS
CREATE TABLE orders (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id           UUID         NOT NULL REFERENCES workshops(id) ON DELETE RESTRICT,
  vehicle_brand         TEXT         NOT NULL,
  vehicle_model         TEXT         NOT NULL,
  vehicle_version       TEXT         NOT NULL,
  vehicle_year          INT          NOT NULL,
  internal_order_number TEXT,
  status                order_status NOT NULL DEFAULT 'pendiente',
  created_at            TIMESTAMPTZ  DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  DEFAULT NOW()
);

-- 4.4 — ÍTEMS DE PEDIDO
CREATE TABLE order_items (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  part_name   TEXT          NOT NULL,
  description TEXT,
  quality     order_quality NOT NULL DEFAULT 'media',
  quantity    INT           NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ   DEFAULT NOW()
);

-- 4.5 — IMÁGENES DE ÍTEM
CREATE TABLE order_images (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID        NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  url           TEXT        NOT NULL,
  storage_path  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4.6 — COTIZACIONES (una por pedido)
CREATE TABLE quotes (
  id        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id  UUID         NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id UUID         NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  notes     TEXT,
  status    quote_status NOT NULL DEFAULT 'borrador',
  sent_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.7 — ÍTEMS DE COTIZACIÓN
CREATE TABLE quote_items (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id      UUID          NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  order_item_id UUID          REFERENCES order_items(id) ON DELETE SET NULL,
  part_name     TEXT          NOT NULL,
  description   TEXT,
  quality       order_quality NOT NULL DEFAULT 'media',
  manufacturer  TEXT,
  supplier      TEXT,
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url     TEXT,
  notes         TEXT,
  approved      BOOLEAN       DEFAULT NULL,  -- NULL=pendiente, TRUE=aprobado, FALSE=rechazado
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- 4.8 — HISTORIAL DE EVENTOS
CREATE TABLE order_events (
  id       UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id  UUID         NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  action   event_action NOT NULL,
  comment  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────
-- SECCIÓN 5: FUNCIONES Y TRIGGERS
-- ────────────────────────────────────────────────────────────

-- 5.1 — Auto-update updated_at en orders
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


-- 5.2 — Trigger robusto: crea perfil + workshop al registrarse un usuario
--
-- Cuando supabase.auth.signUp() se ejecuta desde la app, este trigger:
--   1. Lee el nombre y rol desde raw_user_meta_data
--   2. Si el rol es 'taller', crea un workshop automáticamente
--   3. Crea el perfil vinculado al workshop (o sin él si es vendedor)
--   4. ON CONFLICT DO NOTHING evita errores si el trigger se lanza dos veces
--   5. El bloque EXCEPTION captura cualquier error y lo loguea sin abortar
--      la creación del usuario en auth.users

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role        user_role := 'taller';
  v_name        TEXT;
  v_workshop_id UUID;
BEGIN
  -- Nombre: desde metadata, o el email, o valor por defecto
  v_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NEW.email,
    'Usuario nuevo'
  );

  -- Rol: desde metadata con manejo seguro de valores inválidos
  BEGIN
    v_role := COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'taller'
    );
  EXCEPTION WHEN OTHERS THEN
    v_role := 'taller';
  END;

  -- Si es taller, crear workshop automáticamente
  IF v_role = 'taller' THEN
    BEGIN
      INSERT INTO public.workshops (name, contact_name, email)
      VALUES (
        COALESCE(
          NULLIF(TRIM(NEW.raw_user_meta_data->>'workshop_name'), ''),
          v_name
        ),
        v_name,
        NEW.email
      )
      RETURNING id INTO v_workshop_id;
    EXCEPTION WHEN OTHERS THEN
      -- Si falla la creación del workshop, continuar sin workshop_id
      v_workshop_id := NULL;
      RAISE WARNING 'handle_new_user: no se pudo crear workshop para %. Error: %', NEW.email, SQLERRM;
    END;
  END IF;

  -- Crear perfil del usuario
  INSERT INTO public.profiles (id, name, role, workshop_id)
  VALUES (NEW.id, v_name, v_role, v_workshop_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Error global: logueamos pero NO abortamos la creación del usuario
  RAISE WARNING 'handle_new_user: error inesperado para %. Error: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger sobre auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ────────────────────────────────────────────────────────────
-- SECCIÓN 6: ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────

ALTER TABLE workshops    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;


-- ─── PROFILES ───────────────────────────────────────────────
-- Cada usuario ve su propio perfil; vendedor ve todos
CREATE POLICY "profiles: select"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Cada usuario puede actualizar solo su propio perfil
CREATE POLICY "profiles: update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Solo el sistema (trigger SECURITY DEFINER) puede insertar perfiles
-- No se crea política INSERT → el trigger no la necesita porque
-- SECURITY DEFINER corre como el owner de la función (postgres)


-- ─── WORKSHOPS ──────────────────────────────────────────────
-- Taller ve solo su workshop; vendedor ve todos
CREATE POLICY "workshops: select"
  ON workshops FOR SELECT
  USING (
    id IN (SELECT workshop_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Solo el trigger (sistema) puede insertar workshops — no se define
-- política INSERT para usuarios normales


-- ─── ORDERS ─────────────────────────────────────────────────
-- Taller ve sus pedidos; vendedor ve todos
CREATE POLICY "orders: select"
  ON orders FOR SELECT
  USING (
    workshop_id IN (
      SELECT workshop_id FROM profiles
      WHERE id = auth.uid() AND role = 'taller'
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Cualquier taller autenticado con workshop puede insertar
CREATE POLICY "orders: insert"
  ON orders FOR INSERT
  WITH CHECK (
    workshop_id IN (
      SELECT workshop_id FROM profiles
      WHERE id = auth.uid() AND role = 'taller'
    )
  );

-- Vendedor actualiza cualquier orden; taller actualiza las suyas
CREATE POLICY "orders: update"
  ON orders FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
    OR workshop_id IN (
      SELECT workshop_id FROM profiles WHERE id = auth.uid()
    )
  );


-- ─── ORDER ITEMS ────────────────────────────────────────────
-- Taller ve sus ítems; vendedor ve todos
CREATE POLICY "order_items: select"
  ON order_items FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE workshop_id IN (
        SELECT workshop_id FROM profiles WHERE id = auth.uid()
      )
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Cualquier usuario autenticado puede insertar ítems
-- (el pedido ya valida que el workshop sea el correcto)
CREATE POLICY "order_items: insert"
  ON order_items FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─── ORDER IMAGES ───────────────────────────────────────────
-- Todos los autenticados pueden ver imágenes
CREATE POLICY "order_images: select"
  ON order_images FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Cualquier autenticado puede subir imágenes
CREATE POLICY "order_images: insert"
  ON order_images FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─── QUOTES ─────────────────────────────────────────────────
-- Taller ve cotizaciones de sus pedidos; vendedor ve todas
CREATE POLICY "quotes: select"
  ON quotes FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE workshop_id IN (
        SELECT workshop_id FROM profiles WHERE id = auth.uid()
      )
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Solo vendedor puede crear cotizaciones
CREATE POLICY "quotes: insert"
  ON quotes FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Solo vendedor puede actualizar cotizaciones
CREATE POLICY "quotes: update"
  ON quotes FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );


-- ─── QUOTE ITEMS ────────────────────────────────────────────
-- Todos los autenticados pueden ver ítems de cotización
CREATE POLICY "quote_items: select"
  ON quote_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Solo vendedor puede insertar ítems de cotización
CREATE POLICY "quote_items: insert"
  ON quote_items FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
  );

-- Cualquier autenticado puede actualizar (para aprobaciones del taller)
CREATE POLICY "quote_items: update"
  ON quote_items FOR UPDATE
  USING (auth.uid() IS NOT NULL);


-- ─── ORDER EVENTS ───────────────────────────────────────────
-- Todos los autenticados pueden ver el historial
CREATE POLICY "order_events: select"
  ON order_events FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Cualquier autenticado puede registrar eventos
CREATE POLICY "order_events: insert"
  ON order_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);


-- ────────────────────────────────────────────────────────────
-- SECCIÓN 7: ÍNDICES DE RENDIMIENTO
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_profiles_workshop    ON profiles(workshop_id);
CREATE INDEX idx_orders_workshop      ON orders(workshop_id);
CREATE INDEX idx_orders_status        ON orders(status);
CREATE INDEX idx_orders_updated       ON orders(updated_at DESC);
CREATE INDEX idx_order_items_order    ON order_items(order_id);
CREATE INDEX idx_order_images_item    ON order_images(order_item_id);
CREATE INDEX idx_quotes_order         ON quotes(order_id);
CREATE INDEX idx_quote_items_quote    ON quote_items(quote_id);
CREATE INDEX idx_events_order         ON order_events(order_id);
CREATE INDEX idx_events_created       ON order_events(created_at DESC);


-- ────────────────────────────────────────────────────────────
-- SECCIÓN 8: STORAGE BUCKETS (opcional)
-- ────────────────────────────────────────────────────────────
-- Descomentar si se habilita Supabase Storage:
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('order-images', 'order-images', false)
--   ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('quote-images', 'quote-images', false)
--   ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- FIN DEL SCRIPT
-- ────────────────────────────────────────────────────────────
-- PRÓXIMOS PASOS MANUALES:
--
-- 1. Crear cuenta de VENDEDOR desde Supabase Dashboard:
--    Authentication → Users → Add User
--    Email: vendedor01@demo.com  Contraseña: (la que elijas)
--    Luego en la tabla profiles actualizar el role a 'vendedor':
--    UPDATE profiles SET role = 'vendedor', name = 'Vendedor Principal'
--    WHERE id = '<uuid del usuario recién creado>';
--
-- 2. Los talleres se registran solos desde la app (/login → Nuevo Taller)
--    El trigger crea el perfil y workshop automáticamente.
-- ────────────────────────────────────────────────────────────
