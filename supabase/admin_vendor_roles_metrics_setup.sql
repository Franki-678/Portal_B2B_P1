-- ============================================================
-- PORTAL B2B - SETUP COMPLETO
-- Proyecto: Portal Juan | Org: PB2B P2
-- Última actualización: 2026-04-16
-- ============================================================
-- ORDEN DE EJECUCIÓN:
--   1. Este archivo (schema + RLS + funciones)
--   2. Crear usuarios en Auth (o usar el bloque DO $$ al final)
--   3. Ejecutar bloque de datos: workshops + perfiles
-- ============================================================

-- ============================================================
-- 1. SCHEMA - TABLAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'taller' CHECK (role IN ('admin', 'vendedor', 'taller')),
  workshop_id UUID,
  assigned_workshops UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workshops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID REFERENCES public.workshops(id),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente','en_revision','cotizado','aprobado','aprobado_parcial','rechazado','cerrado')),
  vehicle_brand TEXT,
  vehicle_model TEXT,
  vehicle_version TEXT,
  vehicle_year TEXT,
  internal_order TEXT,
  notes TEXT,
  total DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL,
  description TEXT,
  quality TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  codigo_catalogo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id),
  seller_id UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'pendiente',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.order_items(id),
  part_name TEXT,
  description TEXT,
  quality TEXT,
  manufacturer TEXT,
  supplier TEXT,
  price DECIMAL(10,2),
  quantity_offered INTEGER,
  image_url TEXT,
  notes TEXT,
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quote_item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_item_id UUID REFERENCES public.quote_items(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.catalogo_repuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT,
  descripcion TEXT,
  marca TEXT,
  anios TEXT,
  tipo_pieza TEXT,
  origen TEXT,
  precio NUMERIC,
  stock_cba BOOLEAN DEFAULT false,
  imagen_url TEXT,
  codigo_tipo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_order_images_item_id       ON public.order_images(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id      ON public.order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_quotes_order_id            ON public.quotes(order_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id       ON public.quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_workshops ON public.profiles USING gin(assigned_workshops);
CREATE INDEX IF NOT EXISTS idx_catalogo_marca             ON public.catalogo_repuestos(marca);
CREATE INDEX IF NOT EXISTS idx_catalogo_codigo            ON public.catalogo_repuestos(codigo);
CREATE INDEX IF NOT EXISTS idx_orders_workshop_id         ON public.orders(workshop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status              ON public.orders(status);

-- ============================================================
-- 3. FUNCIONES RLS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT p.role::text FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_workshop_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT p.workshop_id FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_assigned_workshops()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(p.assigned_workshops, ARRAY[]::uuid[])
  FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_distinct_marcas()
RETURNS TABLE(marca TEXT) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT DISTINCT c.marca FROM public.catalogo_repuestos c
  WHERE c.marca IS NOT NULL AND c.marca <> ''
  ORDER BY c.marca ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workshop_id()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_workshops()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_distinct_marcas()        TO authenticated;

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshops          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_item_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_repuestos ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  auth.uid() = id
  OR public.get_my_role() = 'admin'
  OR (public.get_my_role() = 'vendedor' AND (profiles.role IN ('vendedor','admin') OR profiles.workshop_id = ANY(public.get_my_assigned_workshops())))
  OR (public.get_my_role() = 'taller' AND profiles.role IN ('vendedor','admin'))
);
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.get_my_role() = 'admin');

-- workshops
DROP POLICY IF EXISTS "workshops_select" ON public.workshops;
CREATE POLICY "workshops_select" ON public.workshops FOR SELECT USING (
  public.get_my_role() = 'admin'
  OR (public.get_my_role() = 'vendedor' AND id = ANY(public.get_my_assigned_workshops()))
  OR id = public.get_my_workshop_id()
);
DROP POLICY IF EXISTS "workshops_insert" ON public.workshops;
CREATE POLICY "workshops_insert" ON public.workshops FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','vendedor'));
DROP POLICY IF EXISTS "workshops_update" ON public.workshops;
CREATE POLICY "workshops_update" ON public.workshops FOR UPDATE USING (
  public.get_my_role() = 'admin'
  OR (public.get_my_role() = 'vendedor' AND id = ANY(public.get_my_assigned_workshops()))
);

-- orders
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT USING (
  public.get_my_role() = 'admin'
  OR (public.get_my_role() = 'vendedor' AND workshop_id = ANY(public.get_my_assigned_workshops()))
  OR workshop_id = public.get_my_workshop_id()
);
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders FOR INSERT WITH CHECK (
  public.get_my_role() = 'admin'
  OR (public.get_my_role() = 'taller' AND workshop_id = public.get_my_workshop_id())
);
DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders FOR UPDATE USING (
  public.get_my_role() = 'admin'
  OR (public.get_my_role() = 'vendedor' AND workshop_id = ANY(public.get_my_assigned_workshops()))
  OR (public.get_my_role() = 'taller' AND workshop_id = public.get_my_workshop_id())
);

-- order_items
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT USING (
  public.get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (
    (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
    OR o.workshop_id = public.get_my_workshop_id()
  ))
);
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT WITH CHECK (
  public.get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.workshop_id = public.get_my_workshop_id())
);

-- order_images
DROP POLICY IF EXISTS "order_images_select" ON public.order_images;
CREATE POLICY "order_images_select" ON public.order_images FOR SELECT USING (
  public.get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = order_images.order_item_id AND (
      (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
      OR o.workshop_id = public.get_my_workshop_id()
    ))
);
DROP POLICY IF EXISTS "order_images_insert" ON public.order_images;
CREATE POLICY "order_images_insert" ON public.order_images FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- order_events
DROP POLICY IF EXISTS "order_events_select" ON public.order_events;
CREATE POLICY "order_events_select" ON public.order_events FOR SELECT USING (
  public.get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id AND (
    (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
    OR o.workshop_id = public.get_my_workshop_id()
  ))
);
DROP POLICY IF EXISTS "order_events_insert" ON public.order_events;
CREATE POLICY "order_events_insert" ON public.order_events FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.get_my_role() IN ('vendedor','admin')
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id
      AND public.get_my_role() = 'taller' AND o.workshop_id = public.get_my_workshop_id())
  )
);

-- quotes
DROP POLICY IF EXISTS "quotes_select" ON public.quotes;
CREATE POLICY "quotes_select" ON public.quotes FOR SELECT USING (
  public.get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = quotes.order_id AND (
    (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
    OR o.workshop_id = public.get_my_workshop_id()
  ))
);
DROP POLICY IF EXISTS "quotes_insert_vendor" ON public.quotes;
CREATE POLICY "quotes_insert_vendor" ON public.quotes FOR INSERT WITH CHECK (public.get_my_role() IN ('vendedor','admin'));
DROP POLICY IF EXISTS "quotes_update_vendor" ON public.quotes;
CREATE POLICY "quotes_update_vendor" ON public.quotes FOR UPDATE USING (public.get_my_role() IN ('vendedor','admin'));

-- quote_items
DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
CREATE POLICY "quote_items_select" ON public.quote_items FOR SELECT USING (
  public.get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.quotes q JOIN public.orders o ON o.id = q.order_id
    WHERE q.id = quote_items.quote_id AND (
      (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
      OR o.workshop_id = public.get_my_workshop_id()
    ))
);
DROP POLICY IF EXISTS "quote_items_insert_vendor" ON public.quote_items;
CREATE POLICY "quote_items_insert_vendor" ON public.quote_items FOR INSERT WITH CHECK (public.get_my_role() IN ('vendedor','admin'));
DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
CREATE POLICY "quote_items_update" ON public.quote_items FOR UPDATE USING (
  public.get_my_role() IN ('vendedor','admin')
  OR EXISTS (SELECT 1 FROM public.quotes q JOIN public.orders o ON o.id = q.order_id
    WHERE q.id = quote_items.quote_id AND public.get_my_role() = 'taller'
    AND o.workshop_id = public.get_my_workshop_id())
);

-- quote_item_images
DROP POLICY IF EXISTS "quote_item_images_select" ON public.quote_item_images;
CREATE POLICY "quote_item_images_select" ON public.quote_item_images FOR SELECT USING (
  public.get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.quote_items qi JOIN public.quotes q ON q.id = qi.quote_id
    JOIN public.orders o ON o.id = q.order_id
    WHERE qi.id = quote_item_images.quote_item_id AND (
      (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
      OR o.workshop_id = public.get_my_workshop_id()
    ))
);
DROP POLICY IF EXISTS "quote_item_images_insert" ON public.quote_item_images;
CREATE POLICY "quote_item_images_insert" ON public.quote_item_images FOR INSERT WITH CHECK (public.get_my_role() IN ('vendedor','admin'));

-- catalogo_repuestos
DROP POLICY IF EXISTS "catalogo_select" ON public.catalogo_repuestos;
CREATE POLICY "catalogo_select" ON public.catalogo_repuestos FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 5. STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES
  ('order-images',   'order-images',   false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic'], NOW(), NOW()),
  ('quote-images',   'quote-images',   false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic'], NOW(), NOW()),
  ('catalog-images', 'catalog-images', true,  5242880,  ARRAY['image/jpeg','image/png','image/webp'],              NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- Storage policies
DROP POLICY IF EXISTS "order_images_upload"  ON storage.objects;
DROP POLICY IF EXISTS "order_images_read"    ON storage.objects;
DROP POLICY IF EXISTS "order_images_delete"  ON storage.objects;
DROP POLICY IF EXISTS "quote_images_upload"  ON storage.objects;
DROP POLICY IF EXISTS "quote_images_read"    ON storage.objects;
DROP POLICY IF EXISTS "quote_images_delete"  ON storage.objects;
DROP POLICY IF EXISTS "catalog_images_read"  ON storage.objects;
DROP POLICY IF EXISTS "catalog_images_upload" ON storage.objects;

CREATE POLICY "order_images_upload"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'order-images');
CREATE POLICY "order_images_read"    ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'order-images');
CREATE POLICY "order_images_delete"  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'order-images' AND public.get_my_role() IN ('admin','vendedor'));
CREATE POLICY "quote_images_upload"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'quote-images' AND public.get_my_role() IN ('admin','vendedor'));
CREATE POLICY "quote_images_read"    ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'quote-images');
CREATE POLICY "quote_images_delete"  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'quote-images' AND public.get_my_role() IN ('admin','vendedor'));
CREATE POLICY "catalog_images_read"  ON storage.objects FOR SELECT TO public USING (bucket_id = 'catalog-images');
CREATE POLICY "catalog_images_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'catalog-images' AND public.get_my_role() = 'admin');

-- ============================================================
-- 6. USUARIOS DE PRUEBA
-- Contraseña para todos: pb2b1234
-- ============================================================
-- NOTA: El bloque DO $$ requiere que los emails NO existan previamente en auth.users.
-- Si hay que re-ejecutar, borrar primero desde Authentication > Users en el dashboard.

DO $$
DECLARE
  uid_juan    UUID := gen_random_uuid();
  uid_v1      UUID := gen_random_uuid();
  uid_v2      UUID := gen_random_uuid();
  uid_taller  UUID := gen_random_uuid();
  pwd_hash    TEXT := crypt('pb2b1234', gen_salt('bf', 10));
  wid_taller  UUID := gen_random_uuid();
BEGIN
  -- Limpiar previos si existen
  DELETE FROM auth.identities WHERE provider_id IN ('pb2b.vendedor@gmail.com','pb2b.v1@gmail.com','pb2b.v2@gmail.com','pb2b.taller@gmail.com');
  DELETE FROM auth.users WHERE email IN ('pb2b.vendedor@gmail.com','pb2b.v1@gmail.com','pb2b.v2@gmail.com','pb2b.taller@gmail.com');

  -- Auth users
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES
    (uid_juan,   '00000000-0000-0000-0000-000000000000', 'pb2b.vendedor@gmail.com', pwd_hash, NOW(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"Juan"}',        NOW(), NOW(), '', ''),
    (uid_v1,     '00000000-0000-0000-0000-000000000000', 'pb2b.v1@gmail.com',       pwd_hash, NOW(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"Vendedor1"}',    NOW(), NOW(), '', ''),
    (uid_v2,     '00000000-0000-0000-0000-000000000000', 'pb2b.v2@gmail.com',       pwd_hash, NOW(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"Vendedor2"}',    NOW(), NOW(), '', ''),
    (uid_taller, '00000000-0000-0000-0000-000000000000', 'pb2b.taller@gmail.com',   pwd_hash, NOW(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"Taller Test"}',  NOW(), NOW(), '', '');

  -- Identidades (login por email)
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), uid_juan,   'pb2b.vendedor@gmail.com', jsonb_build_object('sub', uid_juan::text,   'email', 'pb2b.vendedor@gmail.com'), 'email', NOW(), NOW(), NOW()),
    (gen_random_uuid(), uid_v1,     'pb2b.v1@gmail.com',       jsonb_build_object('sub', uid_v1::text,     'email', 'pb2b.v1@gmail.com'),       'email', NOW(), NOW(), NOW()),
    (gen_random_uuid(), uid_v2,     'pb2b.v2@gmail.com',       jsonb_build_object('sub', uid_v2::text,     'email', 'pb2b.v2@gmail.com'),       'email', NOW(), NOW(), NOW()),
    (gen_random_uuid(), uid_taller, 'pb2b.taller@gmail.com',   jsonb_build_object('sub', uid_taller::text, 'email', 'pb2b.taller@gmail.com'),   'email', NOW(), NOW(), NOW());

  -- Perfiles (sin workshop_id aún para taller)
  INSERT INTO public.profiles (id, name, role, workshop_id, assigned_workshops)
  VALUES
    (uid_juan,   'Juan',        'admin',   NULL, ARRAY[]::uuid[]),
    (uid_v1,     'Vendedor1',   'vendedor', NULL, ARRAY[]::uuid[]),
    (uid_v2,     'Vendedor2',   'vendedor', NULL, ARRAY[]::uuid[]),
    (uid_taller, 'Taller Test', 'taller',  NULL, NULL);

  -- Workshop para Taller Test
  INSERT INTO public.workshops (id, profile_id, name, email, phone, address)
  VALUES (wid_taller, uid_taller, 'Taller Test', 'pb2b.taller@gmail.com', '351-000-0000', 'Córdoba, Argentina');

  -- Asignar workshop_id al perfil del taller y assigned_workshops a admin + vendedores
  UPDATE public.profiles SET workshop_id = wid_taller WHERE id = uid_taller;
  UPDATE public.profiles SET assigned_workshops = ARRAY[wid_taller]::uuid[] WHERE id IN (uid_juan, uid_v1, uid_v2);

  RAISE NOTICE 'Setup OK - Juan:% V1:% V2:% Taller:% WS:%', uid_juan, uid_v1, uid_v2, uid_taller, wid_taller;
END $$;
