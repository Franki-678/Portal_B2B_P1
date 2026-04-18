-- =============================================================
-- Migración: Tabla de catálogo de vehículos (normalizada)
-- Ejecutar en: Supabase SQL Editor > Run
-- =============================================================

-- 1. Crear tabla vehiculos
CREATE TABLE IF NOT EXISTS vehiculos (
  id        SERIAL PRIMARY KEY,
  marca     TEXT NOT NULL,
  modelo    TEXT NOT NULL,
  version   TEXT NOT NULL,
  CONSTRAINT uq_vehiculos UNIQUE(marca, modelo, version)
);

-- 2. Índices para queries en cascada (muy rápido incluso con 100k+ filas)
CREATE INDEX IF NOT EXISTS idx_vehiculos_marca
  ON vehiculos (marca);

CREATE INDEX IF NOT EXISTS idx_vehiculos_marca_modelo
  ON vehiculos (marca, modelo);

-- 3. RLS: habilitar y agregar política de lectura pública
--    (cualquier usuario autenticado puede leer; solo admin puede insertar)
ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Lectura autenticada de vehiculos"
  ON vehiculos FOR SELECT
  TO authenticated
  USING (true);

-- 4. VERIFICACIÓN: después de correr, debería mostrar la tabla nueva
SELECT 'vehiculos table created' AS status, COUNT(*) AS rows FROM vehiculos;
