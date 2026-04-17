-- ============================================================
-- MIGRACIÓN: Cola de vendedores y nuevos event_actions
-- ============================================================
-- Ejecutar en Supabase SQL Editor (una sola vez).
--
-- Agrega los valores 'pedido_tomado' y 'pedido_liberado' al tipo
-- de acción de eventos (si la columna usa un tipo ENUM o CHECK).
-- ============================================================

-- 1. Si order_events.action usa un tipo ENUM de PostgreSQL:
-- (Descomentar si corresponde)
--
-- ALTER TYPE order_event_action ADD VALUE IF NOT EXISTS 'pedido_tomado';
-- ALTER TYPE order_event_action ADD VALUE IF NOT EXISTS 'pedido_liberado';

-- 2. Si order_events.action usa una columna TEXT con CHECK constraint,
--    actualizamos el constraint:
DO $$
BEGIN
  -- Intentar actualizar el CHECK si existe
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'order_events' AND column_name = 'action'
  ) THEN
    -- Eliminar constraint viejo y recrear con los nuevos valores
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
          'comentario'
        )
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'No se pudo actualizar el CHECK de action: %', SQLERRM;
    END;
  END IF;
END $$;

-- 3. Índice de performance para la "cola general" (pedidos sin asignar)
CREATE INDEX IF NOT EXISTS idx_orders_unassigned_queue
  ON orders (status, created_at DESC)
  WHERE assigned_vendor_id IS NULL;

-- 4. Índice para pedidos por vendedor asignado
CREATE INDEX IF NOT EXISTS idx_orders_assigned_vendor
  ON orders (assigned_vendor_id, updated_at DESC)
  WHERE assigned_vendor_id IS NOT NULL;

-- ============================================================
-- VISTA actualizada: v_vendor_metrics
-- Incluye pedidos por asignación directa (assigned_vendor_id)
-- ============================================================
CREATE OR REPLACE VIEW v_vendor_metrics AS
WITH vendor_orders AS (
  SELECT
    o.assigned_vendor_id AS vendor_id,
    o.status,
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
  MAX(vo.vendor_name) AS vendor_name,
  COUNT(*)::int AS total_pedidos,
  COUNT(*) FILTER (WHERE vo.status = 'pendiente')::int AS pendientes,
  COUNT(*) FILTER (WHERE vo.status = 'en_revision')::int AS en_revision,
  COUNT(*) FILTER (WHERE vo.status = 'cotizado')::int AS cotizados,
  COUNT(*) FILTER (WHERE vo.status = 'aprobado')::int AS aprobados,
  COUNT(*) FILTER (WHERE vo.status = 'aprobado_parcial')::int AS aprobados_parcial,
  COUNT(*) FILTER (WHERE vo.status = 'rechazado')::int AS rechazados,
  COUNT(*) FILTER (WHERE vo.status = 'cerrado')::int AS cerrados,
  COALESCE(aa.monto_aprobado, 0) AS monto_aprobado
FROM vendor_orders vo
LEFT JOIN approved_amounts aa ON aa.vendor_id = vo.vendor_id
GROUP BY vo.vendor_id, aa.monto_aprobado;

COMMENT ON VIEW v_vendor_metrics IS
  'Métricas de rendimiento por vendedor. Actualizada para usar assigned_vendor_id (cola de asignación directa).';
