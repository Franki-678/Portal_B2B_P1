-- =============================================================
-- Migración: Soft Delete en pedidos (orders)
-- Ejecutar en: Supabase SQL Editor > Run
-- =============================================================

-- 1. Agregar columna deleted_at
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Agregar columna deleted_by_id (quién eliminó el pedido)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Índice para queries de admin (buscar eliminados rápido)
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 4. Índice parcial para queries normales (excluir eliminados, muy rápido)
CREATE INDEX IF NOT EXISTS idx_orders_active ON orders(created_at DESC)
  WHERE deleted_at IS NULL;

-- 5. RLS: verificar que las políticas existentes se mantienen
--    (no hay políticas nuevas que agregar; el filtro deleted_at IS NULL
--     se aplica en la query desde el código, no a nivel de RLS)

-- VERIFICACIÓN: después de correr, debería mostrar las columnas nuevas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('deleted_at', 'deleted_by_id')
ORDER BY column_name;
