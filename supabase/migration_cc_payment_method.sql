-- ============================================================
-- MIGRACIÓN: Permitir 'cuenta_corriente' en orders.payment_method
-- ============================================================
-- Ejecutar en Supabase SQL Editor (una sola vez).
--
-- El módulo de Cuentas Corrientes (cobranzas) aprueba pedidos con
-- payment_method = 'cuenta_corriente', pero el CHECK constraint
-- original solo permitía 'transferencia' | 'efectivo'.
-- ============================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method = ANY (ARRAY['transferencia'::text, 'efectivo'::text, 'cuenta_corriente'::text]));
