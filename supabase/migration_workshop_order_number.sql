-- ============================================================
-- MIGRACIÓN: Auto-incremento de workshop_order_number por taller
-- Ejecutar en Supabase SQL Editor (una vez)
-- ============================================================

-- 1. Función que asigna workshop_order_number antes de insertar
CREATE OR REPLACE FUNCTION set_workshop_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workshop_order_number IS NULL THEN
    SELECT COALESCE(MAX(workshop_order_number), 0) + 1
      INTO NEW.workshop_order_number
      FROM orders
     WHERE workshop_id = NEW.workshop_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger que llama a la función en cada INSERT
DROP TRIGGER IF EXISTS trg_set_workshop_order_number ON orders;
CREATE TRIGGER trg_set_workshop_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_workshop_order_number();

-- 3. Backfill de pedidos existentes con workshop_order_number = NULL
DO $$
DECLARE
  ws_id uuid;
BEGIN
  FOR ws_id IN
    SELECT DISTINCT workshop_id FROM orders WHERE workshop_order_number IS NULL
  LOOP
    UPDATE orders AS o
       SET workshop_order_number = sub.rn
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
          FROM orders
         WHERE workshop_id = ws_id
           AND workshop_order_number IS NULL
      ) sub
     WHERE o.id = sub.id;
  END LOOP;
END;
$$;

-- 4. Verificación (opcional)
-- SELECT workshop_id, workshop_order_number, id, created_at
--   FROM orders ORDER BY workshop_id, workshop_order_number;
