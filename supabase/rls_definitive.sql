-- ============================================================
-- PORTAL B2B — Políticas RLS definitivas
-- Ejecutar TODO el script en Supabase SQL Editor (una sola vez).
-- Usa funciones SECURITY DEFINER STABLE para evitar recursión RLS.
-- ============================================================

-- ─── Funciones helper (sin subqueries repetidas a profiles en cada política) ───

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::text FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_workshop_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.workshop_id FROM public.profiles p WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workshop_id() TO authenticated;

-- ─── Eliminar políticas existentes en tablas públicas ───

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles',
        'workshops',
        'orders',
        'order_items',
        'order_images',
        'quotes',
        'quote_items',
        'quote_item_images',
        'order_events'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ─── PROFILES ───

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.get_my_role() = 'vendedor'
    OR (public.get_my_role() = 'taller' AND profiles.role = 'vendedor')
  );

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ─── WORKSHOPS ───

CREATE POLICY "workshops_select" ON public.workshops
  FOR SELECT USING (
    public.get_my_role() = 'vendedor'
    OR id = public.get_my_workshop_id()
  );

CREATE POLICY "workshops_update_taller_own" ON public.workshops
  FOR UPDATE USING (
    public.get_my_role() = 'taller'
    AND id = public.get_my_workshop_id()
  );

-- ─── ORDERS ───

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    public.get_my_role() = 'vendedor'
    OR workshop_id = public.get_my_workshop_id()
  );

CREATE POLICY "orders_insert_taller" ON public.orders
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'taller'
    AND workshop_id = public.get_my_workshop_id()
    AND workshop_id IS NOT NULL
  );

CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE USING (
    public.get_my_role() = 'vendedor'
    OR (
      public.get_my_role() = 'taller'
      AND workshop_id = public.get_my_workshop_id()
    )
  );

-- ─── ORDER ITEMS ───

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    public.get_my_role() = 'vendedor'
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

CREATE POLICY "order_items_insert" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.workshop_id = public.get_my_workshop_id()
        AND public.get_my_role() = 'taller'
    )
  );

-- ─── ORDER IMAGES ───

CREATE POLICY "order_images_select" ON public.order_images
  FOR SELECT USING (
    public.get_my_role() = 'vendedor'
    OR (
      public.get_my_workshop_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.order_items oi
        INNER JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.id = order_images.order_item_id
          AND o.workshop_id = public.get_my_workshop_id()
      )
    )
  );

CREATE POLICY "order_images_insert" ON public.order_images
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      INNER JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_images.order_item_id
        AND o.workshop_id = public.get_my_workshop_id()
        AND public.get_my_role() = 'taller'
    )
  );

-- ─── QUOTES ───

CREATE POLICY "quotes_select" ON public.quotes
  FOR SELECT USING (
    public.get_my_role() = 'vendedor'
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = quotes.order_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

CREATE POLICY "quotes_insert_vendor" ON public.quotes
  FOR INSERT WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "quotes_update_vendor" ON public.quotes
  FOR UPDATE USING (public.get_my_role() = 'vendedor');

-- ─── QUOTE ITEMS ───

CREATE POLICY "quote_items_select" ON public.quote_items
  FOR SELECT USING (
    public.get_my_role() = 'vendedor'
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      INNER JOIN public.orders o ON o.id = q.order_id
      WHERE q.id = quote_items.quote_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

CREATE POLICY "quote_items_insert_vendor" ON public.quote_items
  FOR INSERT WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "quote_items_update" ON public.quote_items
  FOR UPDATE USING (
    public.get_my_role() = 'vendedor'
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      INNER JOIN public.orders o ON o.id = q.order_id
      WHERE q.id = quote_items.quote_id
        AND o.workshop_id = public.get_my_workshop_id()
        AND public.get_my_role() = 'taller'
    )
  );

-- ─── QUOTE ITEM IMAGES ───

CREATE POLICY "quote_item_images_select" ON public.quote_item_images
  FOR SELECT USING (
    public.get_my_role() = 'vendedor'
    OR EXISTS (
      SELECT 1 FROM public.quote_items qi
      INNER JOIN public.quotes q ON q.id = qi.quote_id
      INNER JOIN public.orders o ON o.id = q.order_id
      WHERE qi.id = quote_item_images.quote_item_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

CREATE POLICY "quote_item_images_insert" ON public.quote_item_images
  FOR INSERT WITH CHECK (public.get_my_role() = 'vendedor');

-- ─── ORDER EVENTS ───

CREATE POLICY "order_events_select" ON public.order_events
  FOR SELECT USING (
    public.get_my_role() = 'vendedor'
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_events.order_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

CREATE POLICY "order_events_insert" ON public.order_events
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.get_my_role() = 'vendedor'
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_events.order_id
          AND o.workshop_id = public.get_my_workshop_id()
          AND public.get_my_role() = 'taller'
      )
    )
  );

-- ============================================================
-- STORAGE (buckets: order-images, quote-images)
-- Ajustá los nombres si tus buckets difieren.
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- Lectura pública (bucket público / getPublicUrl)
CREATE POLICY "storage_objects_read_public"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('order-images', 'quote-images'));

-- Subida: cualquier usuario autenticado a esos buckets
CREATE POLICY "storage_objects_insert_auth"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('order-images', 'quote-images'));

-- Fin
