/**
 * agente/types.ts
 * Tipos compartidos del módulo Agente IA.
 * Isolado del build de Next.js — NO importar desde /src.
 */

// ─── Contexto de entrada ──────────────────────────────────────

/** Vehículo completo con los 4 niveles jerárquicos del catálogo */
export interface AgentVehicle {
  marca: string;
  modelo: string;
  year: string;
  version: string;
  /** String concatenado para búsqueda: "HONDA CITY 2009 – CITY 1.5 EXL" */
  fullString: string;
}

/** Ítem de repuesto solicitado por el taller */
export interface RequestedPart {
  partName: string;
  codigoCatalogo: string | null;
  description: string;
  quality: 'alta' | 'media' | 'baja';
  quantity: number;
}

/** Contexto completo que recibe el agente */
export interface AgentContext {
  vehicle: AgentVehicle;
  requestedParts: RequestedPart[];
  workshopId: string;
  workshopName?: string;
  /** ID de sesión para mantener contexto entre mensajes */
  sessionId: string;
}

// ─── Resultados del agente ────────────────────────────────────

/** Resultado de búsqueda en catálogo de repuestos */
export interface CatalogMatch {
  codigo: string;
  descripcion: string;
  marca: string | null;
  precio: number | null;
  score: number; // 0-1, similitud semántica
}

/** Sugerencia generada por el agente para un repuesto */
export interface PartSuggestion {
  requestedPartName: string;
  catalogMatches: CatalogMatch[];
  agentComment: string;
  confidence: 'high' | 'medium' | 'low';
}

/** Respuesta completa del agente */
export interface AgentResponse {
  sessionId: string;
  suggestions: PartSuggestion[];
  generalComment: string;
  quoteDraft?: QuoteDraft;
}

/** Borrador de cotización pre-generado por el agente */
export interface QuoteDraft {
  items: {
    partName: string;
    codigo: string | null;
    price: number;
    quantity: number;
    notes: string;
  }[];
  estimatedTotal: number;
}

// ─── Configuración LLM ────────────────────────────────────────

export interface LLMConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  maxTokens: number;
  temperature: number;
  /** Activar streaming de respuesta */
  stream: boolean;
}

// ─── RAG ─────────────────────────────────────────────────────

export interface EmbeddingVector {
  id: string;
  content: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export interface RetrievalResult {
  item: EmbeddingVector;
  similarity: number;
}
