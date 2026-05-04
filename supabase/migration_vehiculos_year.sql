-- ============================================================
-- Migration: Add year column to vehiculos (4-level hierarchy)
-- Marca → Modelo → Año → Versión
-- Run in Supabase SQL Editor BEFORE uploading the new JSON.
-- ============================================================

-- 1. Add the year column (default '' so existing rows stay valid)
ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS year TEXT NOT NULL DEFAULT '';

-- 2. Drop the old 3-level unique constraint
ALTER TABLE public.vehiculos
  DROP CONSTRAINT IF EXISTS vehiculos_marca_modelo_version_key;

-- 3. Add the new 4-level unique constraint
ALTER TABLE public.vehiculos
  ADD CONSTRAINT vehiculos_marca_modelo_year_version_key
  UNIQUE (marca, modelo, year, version);

-- 4. Refresh indexes for the new hierarchy
DROP INDEX IF EXISTS public.idx_vehiculos_marca;
DROP INDEX IF EXISTS public.idx_vehiculos_marca_modelo;

CREATE INDEX IF NOT EXISTS idx_vehiculos_marca
  ON public.vehiculos (marca);

CREATE INDEX IF NOT EXISTS idx_vehiculos_marca_modelo
  ON public.vehiculos (marca, modelo);

CREATE INDEX IF NOT EXISTS idx_vehiculos_marca_modelo_year
  ON public.vehiculos (marca, modelo, year);
