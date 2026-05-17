-- ============================================================
-- Migration: diccionario_repuestos
-- Diccionario orgánico de nombres de repuestos.
-- Crece automáticamente cuando un taller tipea un repuesto nuevo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.diccionario_repuestos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT  diccionario_repuestos_nombre_key UNIQUE (nombre)
);

-- Índice para búsqueda ILIKE eficiente (lower truncated)
CREATE INDEX IF NOT EXISTS idx_diccionario_nombre_lower
  ON public.diccionario_repuestos (lower(nombre));

-- RLS
ALTER TABLE public.diccionario_repuestos ENABLE ROW LEVEL SECURITY;

-- Lectura: todos los usuarios autenticados
CREATE POLICY "diccionario_read" ON public.diccionario_repuestos
  FOR SELECT TO authenticated USING (true);

-- Inserción: todos los usuarios autenticados (crecimiento orgánico)
CREATE POLICY "diccionario_insert" ON public.diccionario_repuestos
  FOR INSERT TO authenticated WITH CHECK (true);
