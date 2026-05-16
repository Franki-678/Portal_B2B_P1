/**
 * agente/config/llm.config.ts
 * Parámetros de configuración del modelo LLM.
 * Ajustar según el proveedor elegido (Anthropic recomendado).
 */

import type { LLMConfig } from '../types';

export const LLM_CONFIG: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',  // Actualizar al modelo vigente
  maxTokens: 2048,
  temperature: 0.3,             // Bajo: respuestas más deterministas para catálogos
  stream: true,
};

/** Tokens máximos para el system prompt (incluye contexto del vehículo) */
export const MAX_SYSTEM_PROMPT_TOKENS = 1500;

/** Tokens máximos para el historial de conversación */
export const MAX_HISTORY_TOKENS = 4000;

/** Número máximo de mensajes en el historial antes de truncar */
export const MAX_HISTORY_MESSAGES = 20;
