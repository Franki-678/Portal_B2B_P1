-- Portal B2B - setup admin / vendedor / metricas
-- Ejecutar en Supabase SQL Editor.

-- ============================================================
-- 1. LIMPIEZA DE DATOS
-- ============================================================

DELETE FROM order_events;
DELETE FROM quote_item_images;
DELETE FROM quote_items;
DELETE FROM quotes;
DELETE FROM order_images;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM profiles;
DELETE FROM workshops;

SELECT 'orders' AS tabla, COUNT(*) AS filas FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'order_events', COUNT(*) FROM order_events
UNION ALL SELECT 'quotes', COUNT(*) FROM quotes
UNION ALL SELECT 'quote_items', COUNT(*) FROM quote_items
UNION ALL SELECT 'workshops', COUNT(*) FROM workshops
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles;

-- ============================================================
-- 2. ESTRUCTURA
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'admin';
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_workshops UUID[];

CREATE OR REPLACE FUNCTION public.get_distinct_marcas()
RETURNS TABLE(marca TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT DISTINCT c.marca
  FROM public.catalogo_repuestos c
  WHERE c.marca IS NOT NULL AND c.marca <> ''
  ORDER BY c.marca ASC;
$$;

CREATE INDEX IF NOT EXISTS idx_order_images_item_id ON public.order_images(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON public.order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_quotes_order_id ON public.quotes(order_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON public.quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_workshops ON public.profiles USING gin(assigned_workshops);

-- ============================================================
-- 3. HELPERS RLS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::text
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_workshop_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.workshop_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_assigned_workshops()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.assigned_workshops, ARRAY[]::uuid[])
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workshop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_workshops() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_distinct_marcas() TO authenticated;

-- ============================================================
-- 4. RLS POR ROL
-- ============================================================

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'vendedor'
      AND (
        profiles.role IN ('vendedor', 'admin')
        OR profiles.workshop_id = ANY(public.get_my_assigned_workshops())
      )
    )
    OR (
      public.get_my_role() = 'taller'
      AND profiles.role IN ('vendedor', 'admin')
    )
  );

DROP POLICY IF EXISTS "workshops_select" ON public.workshops;
CREATE POLICY "workshops_select" ON public.workshops
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'vendedor'
      AND id = ANY(public.get_my_assigned_workshops())
    )
    OR id = public.get_my_workshop_id()
  );

DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'vendedor'
      AND workshop_id = ANY(public.get_my_assigned_workshops())
    )
    OR workshop_id = public.get_my_workshop_id()
  );

DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE USING (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'vendedor'
      AND workshop_id = ANY(public.get_my_assigned_workshops())
    )
    OR (
      public.get_my_role() = 'taller'
      AND workshop_id = public.get_my_workshop_id()
    )
  );

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
          OR o.workshop_id = public.get_my_workshop_id()
        )
    )
  );

DROP POLICY IF EXISTS "order_images_select" ON public.order_images;
CREATE POLICY "order_images_select" ON public.order_images
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_images.order_item_id
        AND (
          (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
          OR o.workshop_id = public.get_my_workshop_id()
        )
    )
  );

DROP POLICY IF EXISTS "quotes_select" ON public.quotes;
CREATE POLICY "quotes_select" ON public.quotes
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = quotes.order_id
        AND (
          (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
          OR o.workshop_id = public.get_my_workshop_id()
        )
    )
  );

DROP POLICY IF EXISTS "quotes_insert_vendor" ON public.quotes;
CREATE POLICY "quotes_insert_vendor" ON public.quotes
  FOR INSERT WITH CHECK (public.get_my_role() IN ('vendedor', 'admin'));

DROP POLICY IF EXISTS "quotes_update_vendor" ON public.quotes;
CREATE POLICY "quotes_update_vendor" ON public.quotes
  FOR UPDATE USING (public.get_my_role() IN ('vendedor', 'admin'));

DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
CREATE POLICY "quote_items_select" ON public.quote_items
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.orders o ON o.id = q.order_id
      WHERE q.id = quote_items.quote_id
        AND (
          (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
          OR o.workshop_id = public.get_my_workshop_id()
        )
    )
  );

DROP POLICY IF EXISTS "quote_items_insert_vendor" ON public.quote_items;
CREATE POLICY "quote_items_insert_vendor" ON public.quote_items
  FOR INSERT WITH CHECK (public.get_my_role() IN ('vendedor', 'admin'));

DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
CREATE POLICY "quote_items_update" ON public.quote_items
  FOR UPDATE USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.orders o ON o.id = q.order_id
      WHERE q.id = quote_items.quote_id
        AND public.get_my_role() = 'taller'
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

DROP POLICY IF EXISTS "quote_item_images_select" ON public.quote_item_images;
CREATE POLICY "quote_item_images_select" ON public.quote_item_images
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.quote_items qi
      JOIN public.quotes q ON q.id = qi.quote_id
      JOIN public.orders o ON o.id = q.order_id
      WHERE qi.id = quote_item_images.quote_item_id
        AND (
          (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
          OR o.workshop_id = public.get_my_workshop_id()
        )
    )
  );

DROP POLICY IF EXISTS "quote_item_images_insert" ON public.quote_item_images;
CREATE POLICY "quote_item_images_insert" ON public.quote_item_images
  FOR INSERT WITH CHECK (public.get_my_role() IN ('vendedor', 'admin'));

DROP POLICY IF EXISTS "order_events_select" ON public.order_events;
CREATE POLICY "order_events_select" ON public.order_events
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_events.order_id
        AND (
          (public.get_my_role() = 'vendedor' AND o.workshop_id = ANY(public.get_my_assigned_workshops()))
          OR o.workshop_id = public.get_my_workshop_id()
        )
    )
  );

DROP POLICY IF EXISTS "order_events_insert" ON public.order_events;
CREATE POLICY "order_events_insert" ON public.order_events
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.get_my_role() IN ('vendedor', 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = order_events.order_id
          AND public.get_my_role() = 'taller'
          AND o.workshop_id = public.get_my_workshop_id()
      )
    )
  );

-- ============================================================
-- 5. USUARIOS DE PRUEBA - PERFILS
-- Crear primero los usuarios en Authentication y luego ejecutar esto.
-- ============================================================

INSERT INTO public.profiles (id, name, role, assigned_workshops)
SELECT id, 'Admin Test', 'admin', ARRAY[]::uuid[]
FROM auth.users
WHERE email = 'pb2b.admin.test@gmail.com'
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    role = EXCLUDED.role,
    assigned_workshops = EXCLUDED.assigned_workshops;

INSERT INTO public.profiles (id, name, role, assigned_workshops)
SELECT id, 'Vendedor Test 1', 'vendedor', ARRAY[]::uuid[]
FROM auth.users
WHERE email = 'pb2b.vendedor1.test@gmail.com'
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    role = EXCLUDED.role,
    assigned_workshops = EXCLUDED.assigned_workshops;

INSERT INTO public.profiles (id, name, role, assigned_workshops)
SELECT id, 'Vendedor Test 2', 'vendedor', ARRAY[]::uuid[]
FROM auth.users
WHERE email = 'pb2b.vendedor2.test@gmail.com'
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    role = EXCLUDED.role,
    assigned_workshops = EXCLUDED.assigned_workshops;
