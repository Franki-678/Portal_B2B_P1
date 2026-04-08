-- ==============================================================
-- CATÁLOGO DE REPUESTOS — Portal B2B Autopartes
-- Ejecutar en el SQL Editor de Supabase (una sola vez)
-- ==============================================================

-- ── 1. Tabla principal ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalogo_repuestos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text        NOT NULL,
  descripcion text        NOT NULL,
  marca       text,
  anios       text,
  tipo_pieza  text,
  origen      text,
  precio      numeric,
  stock_cba   boolean     NOT NULL DEFAULT false,
  imagen_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Índice para búsqueda de texto completo (GIN) ──────────

CREATE INDEX IF NOT EXISTS idx_catalogo_descripcion_gin
  ON catalogo_repuestos
  USING gin(to_tsvector('spanish', descripcion));

-- Índice adicional en codigo para upsert rápido
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_codigo_unique
  ON catalogo_repuestos (codigo);

-- ── 3. RLS ────────────────────────────────────────────────────

ALTER TABLE catalogo_repuestos ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado
CREATE POLICY "catalogo_read" ON catalogo_repuestos
  FOR SELECT
  TO authenticated
  USING (true);

-- Escritura (INSERT / UPDATE / DELETE): cualquier usuario autenticado
-- (se restringirá a vendedor en una etapa posterior)
CREATE POLICY "catalogo_write" ON catalogo_repuestos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 4. Migración: agregar codigo_catalogo a order_items ───────

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS codigo_catalogo text;
