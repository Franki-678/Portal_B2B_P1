-- ─────────────────────────────────────────────────────────────────────────────
-- T104: Optimización RLS initplan — (select auth.uid()) en lugar de auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
--
-- PROBLEMA:
--   PostgreSQL re-evalúa auth.uid() (y auth.role()) para CADA FILA cuando aparece
--   directamente en la expresión USING / WITH CHECK de una policy RLS.
--   Con 35 policies afectadas, esto generaba 5.8 MILLONES de sequential scans
--   en la tabla profiles (19 filas) en el período auditado.
--
-- SOLUCIÓN:
--   Envolver auth.uid() dentro de un sub-SELECT: (select auth.uid())
--   Esto fuerza al planner a calcular el valor UNA SOLA VEZ por query (init plan)
--   y reutilizarlo para todas las filas, en lugar de recalcularlo N veces.
--
-- PATRÓN DE CAMBIO:
--   ANTES : auth.uid() IS NOT NULL
--   DESPUÉS: (select auth.uid()) IS NOT NULL
--
--   ANTES : p.id = auth.uid()
--   DESPUÉS: p.id = (select auth.uid())
--
-- PROCEDIMIENTO:
--   DROP + CREATE para cada policy afectada (no existe ALTER POLICY en PG).
--   Las policies NO afectadas (USING (true), WITH CHECK (true), etc.) se omiten.
--
-- REFERENCIA:
--   https://supabase.com/docs/guides/database/postgres/row-level-security
--   #call-functions-with-select
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. TABLA: profiles
-- ════════════════════════════════════════════════════════════════════════════

-- profiles_delete: solo puede borrar su propio perfil
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = id);

-- profiles_update: solo puede actualizar su propio perfil
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- profiles_admin_update: admin puede actualizar cualquier perfil
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = (select auth.uid())
        AND me.role = 'admin'::user_role
    )
  )
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. TABLA: orders
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND (
          p.role = ANY (ARRAY['admin'::user_role, 'vendedor'::user_role])
          OR (p.role = 'taller'::user_role AND p.workshop_id = orders.workshop_id)
        )
    )
  );

DROP POLICY IF EXISTS orders_insert ON public.orders;
CREATE POLICY orders_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update ON public.orders
  FOR UPDATE TO authenticated
  USING  ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS orders_delete ON public.orders;
CREATE POLICY orders_delete ON public.orders
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. TABLA: order_items
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS order_items_select ON public.order_items;
CREATE POLICY order_items_select ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE o.id = order_items.order_id
        AND (
          p.role = ANY (ARRAY['admin'::user_role, 'vendedor'::user_role])
          OR (p.role = 'taller'::user_role AND p.workshop_id = o.workshop_id)
        )
    )
  );

DROP POLICY IF EXISTS order_items_insert ON public.order_items;
CREATE POLICY order_items_insert ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS order_items_update ON public.order_items;
CREATE POLICY order_items_update ON public.order_items
  FOR UPDATE TO authenticated
  USING  ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS order_items_delete ON public.order_items;
CREATE POLICY order_items_delete ON public.order_items
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. TABLA: order_images
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS order_images_select ON public.order_images;
CREATE POLICY order_images_select ON public.order_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE oi.id = order_images.order_item_id
        AND (
          p.role = ANY (ARRAY['admin'::user_role, 'vendedor'::user_role])
          OR (p.role = 'taller'::user_role AND p.workshop_id = o.workshop_id)
        )
    )
  );

DROP POLICY IF EXISTS order_images_insert ON public.order_images;
CREATE POLICY order_images_insert ON public.order_images
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS order_images_update ON public.order_images;
CREATE POLICY order_images_update ON public.order_images
  FOR UPDATE TO authenticated
  USING  ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS order_images_delete ON public.order_images;
CREATE POLICY order_images_delete ON public.order_images
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. TABLA: order_events
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS order_events_select ON public.order_events;
CREATE POLICY order_events_select ON public.order_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE o.id = order_events.order_id
        AND (
          p.role = ANY (ARRAY['admin'::user_role, 'vendedor'::user_role])
          OR (p.role = 'taller'::user_role AND p.workshop_id = o.workshop_id)
        )
    )
  );

DROP POLICY IF EXISTS order_events_insert ON public.order_events;
CREATE POLICY order_events_insert ON public.order_events
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. TABLA: quotes
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS quotes_select ON public.quotes;
CREATE POLICY quotes_select ON public.quotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE o.id = quotes.order_id
        AND (
          p.role = ANY (ARRAY['admin'::user_role, 'vendedor'::user_role])
          OR (p.role = 'taller'::user_role AND p.workshop_id = o.workshop_id)
        )
    )
  );

DROP POLICY IF EXISTS quotes_insert ON public.quotes;
CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS quotes_update ON public.quotes;
CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE TO authenticated
  USING  ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS quotes_delete ON public.quotes;
CREATE POLICY quotes_delete ON public.quotes
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. TABLA: quote_items
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS quote_items_select ON public.quote_items;
CREATE POLICY quote_items_select ON public.quote_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.orders o ON o.id = q.order_id
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE q.id = quote_items.quote_id
        AND (
          p.role = ANY (ARRAY['admin'::user_role, 'vendedor'::user_role])
          OR (p.role = 'taller'::user_role AND p.workshop_id = o.workshop_id)
        )
    )
  );

DROP POLICY IF EXISTS quote_items_insert ON public.quote_items;
CREATE POLICY quote_items_insert ON public.quote_items
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS quote_items_update ON public.quote_items;
CREATE POLICY quote_items_update ON public.quote_items
  FOR UPDATE TO authenticated
  USING  ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS quote_items_delete ON public.quote_items;
CREATE POLICY quote_items_delete ON public.quote_items
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. TABLA: quote_item_images
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS quote_item_images_select ON public.quote_item_images;
CREATE POLICY quote_item_images_select ON public.quote_item_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.quote_items qi
      JOIN public.quotes q ON q.id = qi.quote_id
      JOIN public.orders o ON o.id = q.order_id
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE qi.id = quote_item_images.quote_item_id
        AND (
          p.role = ANY (ARRAY['admin'::user_role, 'vendedor'::user_role])
          OR (p.role = 'taller'::user_role AND p.workshop_id = o.workshop_id)
        )
    )
  );

DROP POLICY IF EXISTS quote_item_images_insert ON public.quote_item_images;
CREATE POLICY quote_item_images_insert ON public.quote_item_images
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS quote_item_images_update ON public.quote_item_images;
CREATE POLICY quote_item_images_update ON public.quote_item_images
  FOR UPDATE TO authenticated
  USING  ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS quote_item_images_delete ON public.quote_item_images;
CREATE POLICY quote_item_images_delete ON public.quote_item_images
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 9. TABLA: claim_images
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS taller_select_own_claim_images ON public.claim_images;
CREATE POLICY taller_select_own_claim_images ON public.claim_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.profiles p ON p.workshop_id = o.workshop_id
      WHERE o.id = claim_images.order_id
        AND p.id = (select auth.uid())
        AND p.role = 'taller'::user_role
    )
  );

DROP POLICY IF EXISTS vendor_admin_select_claim_images ON public.claim_images;
CREATE POLICY vendor_admin_select_claim_images ON public.claim_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = ANY (ARRAY['vendedor'::user_role, 'admin'::user_role])
    )
  );

DROP POLICY IF EXISTS taller_insert_claim_images ON public.claim_images;
CREATE POLICY taller_insert_claim_images ON public.claim_images
  FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.profiles p ON p.workshop_id = o.workshop_id
      WHERE o.id = claim_images.order_id
        AND p.id = (select auth.uid())
        AND p.role = 'taller'::user_role
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 10. TABLA: workshops
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS workshops_update ON public.workshops;
CREATE POLICY workshops_update ON public.workshops
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = 'admin'::user_role
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS workshops_delete ON public.workshops;
CREATE POLICY workshops_delete ON public.workshops
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = 'admin'::user_role
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 11. TABLA: catalogo_repuestos
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS catalogo_repuestos_insert ON public.catalogo_repuestos;
CREATE POLICY catalogo_repuestos_insert ON public.catalogo_repuestos
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN (ejecutar manualmente para confirmar):
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SELECT tablename, policyname, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
--   AND qual NOT LIKE '%(select auth.uid())%'
--   AND (with_check IS NULL OR with_check NOT LIKE '%(select auth.uid())%');
--
-- Resultado esperado: 0 filas (ninguna policy usa auth.uid() sin select).
-- ─────────────────────────────────────────────────────────────────────────────
