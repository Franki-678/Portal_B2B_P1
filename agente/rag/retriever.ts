/**
 * agente/rag/retriever.ts
 * Búsqueda semántica en el catálogo de repuestos usando pgvector (Supabase).
 *
 * TODO: Implementar cuando se active el módulo RAG.
 * Requiere: SUPABASE_SERVICE_ROLE_KEY, extensión pgvector en el proyecto.
 */

import type { RetrievalResult, AgentVehicle } from '../types';

/**
 * Busca repuestos por similitud semántica en el catálogo.
 *
 * @param query - Texto de búsqueda (nombre del repuesto)
 * @param vehicle - Vehículo para filtrar resultados por compatibilidad
 * @param topK - Número máximo de resultados
 * @returns Lista de resultados ordenados por similitud
 *
 * @todo Implementar:
 * 1. Generar embedding del `query` con OpenAI/Anthropic
 * 2. Ejecutar `match_documents` RPC en Supabase (pgvector)
 * 3. Filtrar por `vehicle.marca` como primer filtro
 * 4. Retornar los top-K resultados con score de similitud
 */
export async function retrieveSimilarParts(
  _query: string,
  _vehicle: AgentVehicle,
  _topK = 5
): Promise<RetrievalResult[]> {
  // STUB — implementar con pgvector
  throw new Error('RAG retriever no implementado. Ver agente/rag/retriever.ts');
}

/**
 * SQL que debe ejecutarse en Supabase para habilitar la búsqueda semántica:
 *
 * ```sql
 * -- Habilitar extensión pgvector
 * CREATE EXTENSION IF NOT EXISTS vector;
 *
 * -- Agregar columna de embeddings al catálogo
 * ALTER TABLE catalogo_repuestos
 *   ADD COLUMN IF NOT EXISTS embedding vector(1536);
 *
 * -- Crear índice para búsqueda eficiente
 * CREATE INDEX ON catalogo_repuestos
 *   USING ivfflat (embedding vector_cosine_ops)
 *   WITH (lists = 100);
 *
 * -- Función de búsqueda por similitud
 * CREATE OR REPLACE FUNCTION match_parts(
 *   query_embedding vector(1536),
 *   match_threshold float DEFAULT 0.7,
 *   match_count int DEFAULT 5
 * )
 * RETURNS TABLE (
 *   id uuid,
 *   codigo text,
 *   descripcion text,
 *   marca text,
 *   precio numeric,
 *   similarity float
 * )
 * LANGUAGE sql STABLE AS $$
 *   SELECT id, codigo, descripcion, marca, precio,
 *          1 - (embedding <=> query_embedding) AS similarity
 *   FROM catalogo_repuestos
 *   WHERE 1 - (embedding <=> query_embedding) > match_threshold
 *   ORDER BY embedding <=> query_embedding
 *   LIMIT match_count;
 * $$;
 * ```
 */
export const PGVECTOR_MIGRATION_NOTE = 'Ver comentario en agente/rag/retriever.ts';
