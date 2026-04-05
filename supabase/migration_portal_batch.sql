-- ============================================================
-- Portal B2B — migración única (ejecutar en Supabase SQL Editor)
-- Incluye: quantity_offered, quote_item_images, profiles.phone, RLS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Columnas
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS quantity_offered INT NOT NULL DEFAULT 1;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_address TEXT;

-- Tabla imágenes por ítem de cotización
CREATE TABLE IF NOT EXISTS quote_item_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_item_id UUID NOT NULL REFERENCES quote_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_item_images_item ON quote_item_images(quote_item_id);

ALTER TABLE quote_item_images ENABLE ROW LEVEL SECURITY;

-- Políticas quote_item_images (ajustá si usás solo rls_definitive.sql)
DROP POLICY IF EXISTS "quote_item_images: select" ON quote_item_images;
CREATE POLICY "quote_item_images: select" ON quote_item_images
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor'
    OR EXISTS (
      SELECT 1 FROM quote_items qi
      INNER JOIN quotes q ON q.id = qi.quote_id
      INNER JOIN orders o ON o.id = q.order_id
      WHERE qi.id = quote_item_images.quote_item_id
        AND o.workshop_id IN (SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller')
    )
  );

DROP POLICY IF EXISTS "quote_item_images: insert vendor" ON quote_item_images;
CREATE POLICY "quote_item_images: insert vendor" ON quote_item_images
  FOR INSERT WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'vendedor');

-- Taller: actualizar su workshop
DROP POLICY IF EXISTS "workshops: taller can update own" ON workshops;
CREATE POLICY "workshops: taller can update own" ON workshops
  FOR UPDATE USING (
    id IN (SELECT workshop_id FROM profiles WHERE id = auth.uid() AND role = 'taller')
  );

-- Perfiles: taller puede leer filas de vendedor (teléfono WhatsApp)
DROP POLICY IF EXISTS "profiles: taller read vendedor" ON profiles;
CREATE POLICY "profiles: taller read vendedor" ON profiles
  FOR SELECT USING (
    role = 'vendedor'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'taller')
  );

-- Fin
