-- ============================================================
-- MIGRACIÓN: Bloques 3 & 4
-- Nuevos estados, lógica de reclamos y RPCs de métricas admin
-- ============================================================
-- Ejecutar en Supabase SQL Editor (una sola vez).
-- ============================================================

-- ─── 1. Actualizar CHECK de orders.status ────────────────────
DO $$
BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'pendiente',
      'en_revision',
      'cotizado',
      'aprobado',
      'aprobado_parcial',
      'rechazado',
      'cerrado',
      'cerrado_pagado',   -- nuevo: admin confirma pago
      'en_conflicto'      -- nuevo: taller inicia reclamo
    )
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'No se pudo actualizar CHECK de orders.status: %', SQLERRM;
END $$;

-- ─── 2. Actualizar CHECK de order_events.action ──────────────
DO $$
BEGIN
  ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_action_check;
  ALTER TABLE order_events ADD CONSTRAINT order_events_action_check CHECK (
    action IN (
      'pedido_creado',
      'pedido_en_revision',
      'pedido_tomado',
      'pedido_liberado',
      'cotizacion_enviada',
      'cotizacion_aprobada',
      'cotizacion_rechazada',
      'cotizacion_aprobada_parcial',
      'pedido_cerrado',
      'pedido_pagado',      -- nuevo: admin marca como pagado
      'reclamo_iniciado',   -- nuevo: taller inicia reclamo
      'comentario'
    )
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'No se pudo actualizar CHECK de order_events.action: %', SQLERRM;
END $$;

-- ─── 3. Índice para conflictos activos ───────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_en_conflicto
  ON orders (status, updated_at DESC)
  WHERE status = 'en_conflicto';

-- ─── 4. Índice para cerrado_pagado (base de métricas) ────────
CREATE INDEX IF NOT EXISTS idx_orders_cerrado_pagado
  ON orders (status, updated_at DESC)
  WHERE status = 'cerrado_pagado';

-- ─── 5. Vista de conflictos activos ──────────────────────────
CREATE OR REPLACE VIEW v_conflictos_activos AS
SELECT
  o.id,
  o.workshop_id,
  w.name AS workshop_name,
  o.assigned_vendor_id,
  p.name AS vendor_name,
  o.vehicle_brand,
  o.vehicle_model,
  o.vehicle_year,
  o.updated_at
FROM orders o
LEFT JOIN workshops w ON w.id = o.workshop_id
LEFT JOIN profiles p ON p.id = o.assigned_vendor_id
WHERE o.status = 'en_conflicto';

COMMENT ON VIEW v_conflictos_activos IS
  'Pedidos en estado en_conflicto con datos del taller y vendedor asignado.';

-- ─── 6. RPC: get_admin_kpis ──────────────────────────────────
-- Retorna KPIs basados SOLO en pedidos cerrado_pagado.
CREATE OR REPLACE FUNCTION get_admin_kpis(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE(
  total_facturado  numeric,
  ticket_promedio  numeric,
  total_completados bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(qi.price * qi.quantity_offered), 0)::numeric AS total_facturado,
    CASE
      WHEN COUNT(DISTINCT o.id) > 0
        THEN (COALESCE(SUM(qi.price * qi.quantity_offered), 0) / COUNT(DISTINCT o.id))::numeric
      ELSE 0::numeric
    END AS ticket_promedio,
    COUNT(DISTINCT o.id)::bigint AS total_completados
  FROM orders o
  JOIN quotes q ON q.order_id = o.id
  JOIN quote_items qi ON qi.quote_id = q.id
  WHERE o.status = 'cerrado_pagado'
    AND qi.approved = TRUE
    AND o.updated_at >= p_start
    AND o.updated_at <= p_end;
$$;

-- ─── 7. RPC: get_vendor_ranking ──────────────────────────────
-- Top 10 vendedores por monto facturado en pedidos cerrado_pagado.
CREATE OR REPLACE FUNCTION get_vendor_ranking(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE(
  vendor_id       uuid,
  vendor_name     text,
  pedidos_cerrados bigint,
  monto_facturado  numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.assigned_vendor_id                              AS vendor_id,
    p.name                                            AS vendor_name,
    COUNT(DISTINCT o.id)::bigint                      AS pedidos_cerrados,
    COALESCE(SUM(qi.price * qi.quantity_offered), 0)::numeric AS monto_facturado
  FROM orders o
  JOIN profiles p ON p.id = o.assigned_vendor_id
  JOIN quotes q   ON q.order_id = o.id
  JOIN quote_items qi ON qi.quote_id = q.id
  WHERE o.status = 'cerrado_pagado'
    AND qi.approved = TRUE
    AND o.updated_at >= p_start
    AND o.updated_at <= p_end
    AND o.assigned_vendor_id IS NOT NULL
  GROUP BY o.assigned_vendor_id, p.name
  ORDER BY monto_facturado DESC
  LIMIT 10;
$$;

-- ─── 8. RPC: get_workshop_ranking ────────────────────────────
-- Top 10 talleres por monto comprado en pedidos cerrado_pagado.
CREATE OR REPLACE FUNCTION get_workshop_ranking(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE(
  workshop_id   uuid,
  workshop_name text,
  total_pedidos bigint,
  monto_comprado numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.workshop_id                                     AS workshop_id,
    w.name                                            AS workshop_name,
    COUNT(DISTINCT o.id)::bigint                      AS total_pedidos,
    COALESCE(SUM(qi.price * qi.quantity_offered), 0)::numeric AS monto_comprado
  FROM orders o
  JOIN workshops w ON w.id = o.workshop_id
  JOIN quotes q    ON q.order_id = o.id
  JOIN quote_items qi ON qi.quote_id = q.id
  WHERE o.status = 'cerrado_pagado'
    AND qi.approved = TRUE
    AND o.updated_at >= p_start
    AND o.updated_at <= p_end
  GROUP BY o.workshop_id, w.name
  ORDER BY monto_comprado DESC
  LIMIT 10;
$$;

-- ─── 9. Actualizar v_vendor_metrics ──────────────────────────
-- cerrado_pagado se cuenta como "cerrado" en las métricas por vendedor.
CREATE OR REPLACE VIEW v_vendor_metrics AS
WITH vendor_orders AS (
  SELECT
    o.assigned_vendor_id AS vendor_id,
    CASE
      WHEN o.status IN ('cerrado_pagado', 'en_conflicto') THEN 'cerrado'
      ELSE o.status
    END AS status,
    p.name AS vendor_name
  FROM orders o
  JOIN profiles p ON p.id = o.assigned_vendor_id
  WHERE o.assigned_vendor_id IS NOT NULL
    AND p.role IN ('vendedor', 'admin')
),
approved_amounts AS (
  SELECT
    o.assigned_vendor_id AS vendor_id,
    SUM(qi.price * qi.quantity_offered) AS monto_aprobado
  FROM orders o
  JOIN quotes q ON q.order_id = o.id
  JOIN quote_items qi ON qi.quote_id = q.id
  WHERE qi.approved = TRUE
    AND o.assigned_vendor_id IS NOT NULL
  GROUP BY o.assigned_vendor_id
)
SELECT
  vo.vendor_id,
  MAX(vo.vendor_name)                                          AS vendor_name,
  COUNT(*)::int                                                AS total_pedidos,
  COUNT(*) FILTER (WHERE vo.status = 'pendiente')::int        AS pendientes,
  COUNT(*) FILTER (WHERE vo.status = 'en_revision')::int      AS en_revision,
  COUNT(*) FILTER (WHERE vo.status = 'cotizado')::int         AS cotizados,
  COUNT(*) FILTER (WHERE vo.status = 'aprobado')::int         AS aprobados,
  COUNT(*) FILTER (WHERE vo.status = 'aprobado_parcial')::int AS aprobados_parcial,
  COUNT(*) FILTER (WHERE vo.status = 'rechazado')::int        AS rechazados,
  COUNT(*) FILTER (WHERE vo.status = 'cerrado')::int          AS cerrados,
  COALESCE(aa.monto_aprobado, 0)                              AS monto_aprobado
FROM vendor_orders vo
LEFT JOIN approved_amounts aa ON aa.vendor_id = vo.vendor_id
GROUP BY vo.vendor_id, aa.monto_aprobado;

COMMENT ON VIEW v_vendor_metrics IS
  'Métricas de rendimiento por vendedor. cerrado_pagado y en_conflicto se cuentan como cerrado.';
