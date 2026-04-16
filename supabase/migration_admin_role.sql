-- ============================================================
-- MIGRACIÓN: Rol ADMIN (Juan) — idempotente, segura de reejecutar
-- ============================================================
-- Ejecutar en Supabase SQL Editor.
--
-- Qué hace:
-- 1) Agrega el valor 'admin' al enum user_role (si no existe).
-- 2) Actualiza get_my_role() (ya devuelve text, queda tal cual).
-- 3) Extiende las policies que solo habilitaban 'vendedor' para
--    que 'admin' tenga al menos los mismos permisos que vendedor.
-- 4) Agrega un campo opcional orders.assigned_vendor_id para
--    poder asignar pedidos a un vendedor específico y medir
--    rendimiento por vendedor. Backfill desde quotes.vendor_id.
-- 5) Crea una vista materializable public.v_vendor_metrics
--    con totales agregados por vendedor (cantidad de pedidos
--    atendidos, cotizados, aprobados, rechazados, monto aprobado).
-- ============================================================

-- 1) ENUM ---------------------------------------------------------

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
END$$;

-- 2) ORDERS: assigned_vendor_id ----------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_vendor_id UUID REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_vendor
  ON public.orders(assigned_vendor_id);

-- Backfill: si el pedido tiene quote, se asigna al vendor que cotizó.
UPDATE public.orders o
SET assigned_vendor_id = q.vendor_id
FROM public.quotes q
WHERE q.order_id = o.id
  AND o.assigned_vendor_id IS NULL
  AND q.vendor_id IS NOT NULL;

-- 3) POLICIES: extender 'vendedor' → 'vendedor' ∪ 'admin' --------
-- Rehacemos solo las que filtraban por rol.

-- PROFILES: admin puede leer a todos.
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.get_my_role() IN ('vendedor', 'admin')
    OR (public.get_my_role() = 'taller' AND profiles.role = 'vendedor')
  );

-- WORKSHOPS
DROP POLICY IF EXISTS "workshops_select" ON public.workshops;
CREATE POLICY "workshops_select" ON public.workshops
  FOR SELECT USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR id = public.get_my_workshop_id()
  );

-- ORDERS
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR workshop_id = public.get_my_workshop_id()
  );

DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR (
      public.get_my_role() = 'taller'
      AND workshop_id = public.get_my_workshop_id()
    )
  );

-- ORDER ITEMS
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

-- ORDER IMAGES
DROP POLICY IF EXISTS "order_images_select" ON public.order_images;
CREATE POLICY "order_images_select" ON public.order_images
  FOR SELECT USING (
    public.get_my_role() IN ('vendedor', 'admin')
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

-- QUOTES
DROP POLICY IF EXISTS "quotes_select" ON public.quotes;
CREATE POLICY "quotes_select" ON public.quotes
  FOR SELECT USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = quotes.order_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

DROP POLICY IF EXISTS "quotes_insert_vendor" ON public.quotes;
CREATE POLICY "quotes_insert_vendor" ON public.quotes
  FOR INSERT WITH CHECK (public.get_my_role() IN ('vendedor', 'admin'));

DROP POLICY IF EXISTS "quotes_update_vendor" ON public.quotes;
CREATE POLICY "quotes_update_vendor" ON public.quotes
  FOR UPDATE USING (public.get_my_role() IN ('vendedor', 'admin'));

-- QUOTE ITEMS
DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
CREATE POLICY "quote_items_select" ON public.quote_items
  FOR SELECT USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      INNER JOIN public.orders o ON o.id = q.order_id
      WHERE q.id = quote_items.quote_id
        AND o.workshop_id = public.get_my_workshop_id()
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
      SELECT 1 FROM public.quotes q
      INNER JOIN public.orders o ON o.id = q.order_id
      WHERE q.id = quote_items.quote_id
        AND o.workshop_id = public.get_my_workshop_id()
        AND public.get_my_role() = 'taller'
    )
  );

-- QUOTE ITEM IMAGES
DROP POLICY IF EXISTS "quote_item_images_select" ON public.quote_item_images;
CREATE POLICY "quote_item_images_select" ON public.quote_item_images
  FOR SELECT USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.quote_items qi
      INNER JOIN public.quotes q ON q.id = qi.quote_id
      INNER JOIN public.orders o ON o.id = q.order_id
      WHERE qi.id = quote_item_images.quote_item_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

DROP POLICY IF EXISTS "quote_item_images_insert" ON public.quote_item_images;
CREATE POLICY "quote_item_images_insert" ON public.quote_item_images
  FOR INSERT WITH CHECK (public.get_my_role() IN ('vendedor', 'admin'));

-- ORDER EVENTS
DROP POLICY IF EXISTS "order_events_select" ON public.order_events;
CREATE POLICY "order_events_select" ON public.order_events
  FOR SELECT USING (
    public.get_my_role() IN ('vendedor', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_events.order_id
        AND o.workshop_id = public.get_my_workshop_id()
    )
  );

DROP POLICY IF EXISTS "order_events_insert" ON public.order_events;
CREATE POLICY "order_events_insert" ON public.order_events
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.get_my_role() IN ('vendedor', 'admin')
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_events.order_id
          AND o.workshop_id = public.get_my_workshop_id()
          AND public.get_my_role() = 'taller'
      )
    )
  );

-- 4) VISTA DE MÉTRICAS POR VENDEDOR ------------------------------
-- Usa assigned_vendor_id (o vendor_id de la cotización si no está asignado)
-- y agrega totales aprobados en ARS.

CREATE OR REPLACE VIEW public.v_vendor_metrics AS
WITH vendor_of AS (
  SELECT
    o.id                                     AS order_id,
    COALESCE(o.assigned_vendor_id, q.vendor_id) AS vendor_id,
    o.status,
    o.created_at
  FROM public.orders o
  LEFT JOIN public.quotes q ON q.order_id = o.id
),
approved_totals AS (
  SELECT
    v.vendor_id,
    v.order_id,
    SUM(qi.price * COALESCE(qi.quantity_offered, 1)) FILTER (WHERE qi.approved = true) AS approved_amount
  FROM vendor_of v
  LEFT JOIN public.quotes q       ON q.order_id = v.order_id
  LEFT JOIN public.quote_items qi ON qi.quote_id = q.id
  GROUP BY v.vendor_id, v.order_id
)
SELECT
  p.id                                           AS vendor_id,
  p.name                                         AS vendor_name,
  COUNT(v.order_id)                              AS total_pedidos,
  COUNT(*) FILTER (WHERE v.status = 'pendiente')           AS pendientes,
  COUNT(*) FILTER (WHERE v.status = 'en_revision')         AS en_revision,
  COUNT(*) FILTER (WHERE v.status = 'cotizado')            AS cotizados,
  COUNT(*) FILTER (WHERE v.status = 'aprobado')            AS aprobados,
  COUNT(*) FILTER (WHERE v.status = 'aprobado_parcial')    AS aprobados_parcial,
  COUNT(*) FILTER (WHERE v.status = 'rechazado')           AS rechazados,
  COUNT(*) FILTER (WHERE v.status = 'cerrado')             AS cerrados,
  COALESCE(SUM(at.approved_amount), 0)           AS monto_aprobado
FROM public.profiles p
LEFT JOIN vendor_of v         ON v.vendor_id = p.id
LEFT JOIN approved_totals at  ON at.vendor_id = p.id AND at.order_id = v.order_id
WHERE p.role IN ('vendedor', 'admin')
GROUP BY p.id, p.name
ORDER BY p.name;

-- La vista respeta RLS de las tablas base; admin/vendedor la ven.

-- 5) UPGRADE DE JUAN: vendedor → admin ---------------------------
-- Cambia el rol del usuario existente al rol 'admin'.
-- Ejecutar DESPUÉS de que el enum 'admin' haya sido agregado por (1).
-- En algunos entornos Postgres exige que el ALTER TYPE esté commiteado
-- antes de poder usar el nuevo valor; si lanza error "unsafe use of new
-- value", corré primero hasta acá y volvé a correr este bloque.

UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'pb2b.vendedor.test@gmail.com'
);

-- Fin
