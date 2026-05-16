/**
 * agente/sanitizer.ts
 * Sanitización y validación de inputs antes de enviarlos al LLM.
 * Previene prompt injection y limpia datos de usuario.
 *
 * TODO: Instalar `zod` y activar validaciones cuando se implemente el agente.
 */

import type { AgentContext, AgentVehicle, RequestedPart } from './types';

// ─── Constantes ───────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 2000;
const MAX_PART_NAME_LENGTH = 200;
const MAX_PARTS_PER_REQUEST = 20;

/** Patrones de prompt injection conocidos */
const INJECTION_PATTERNS = [
  /ignore (previous|all|above) instructions/i,
  /system prompt/i,
  /jailbreak/i,
  /act as (if you are|a|an)/i,
  /\{\{.*\}\}/,  // template injection
  /<\|.*\|>/,    // token injection (GPT-style)
];

// ─── Sanitizadores de strings ─────────────────────────────────

/**
 * Limpia un string de usuario: trunca, elimina caracteres peligrosos
 * y detecta intentos de prompt injection.
 */
export function sanitizeUserInput(
  input: string,
  maxLength = MAX_MESSAGE_LENGTH
): { value: string; flagged: boolean } {
  let value = input
    .trim()
    .slice(0, maxLength)
    // Eliminar caracteres de control excepto newline y tab
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalizar múltiples espacios
    .replace(/ {3,}/g, '  ');

  const flagged = INJECTION_PATTERNS.some(pattern => pattern.test(value));

  if (flagged) {
    // Sanitizar pero no bloquear — el LLM tiene instrucciones propias de seguridad
    console.warn('[Agente] Input flagged as potential injection attempt:', value.slice(0, 100));
  }

  return { value, flagged };
}

/**
 * Limpia el nombre de un repuesto.
 */
export function sanitizePartName(name: string): string {
  return name
    .trim()
    .slice(0, MAX_PART_NAME_LENGTH)
    .replace(/[<>{}[\]]/g, '') // eliminar caracteres de markup
    .replace(/\s+/g, ' ');
}

// ─── Validadores de contexto ──────────────────────────────────

/**
 * Valida y sanitiza el vehículo seleccionado.
 * Todos los campos son requeridos en el flujo de 4 niveles.
 */
export function validateVehicle(
  vehicle: Partial<AgentVehicle>
): { valid: boolean; errors: string[]; sanitized: AgentVehicle | null } {
  const errors: string[] = [];

  const marca = vehicle.marca?.trim();
  const modelo = vehicle.modelo?.trim();
  const year = vehicle.year?.trim();
  const version = vehicle.version?.trim();

  if (!marca) errors.push('Marca requerida');
  if (!modelo) errors.push('Modelo requerido');
  if (!year) errors.push('Año requerido');
  if (!version) errors.push('Versión requerida');

  if (errors.length > 0) return { valid: false, errors, sanitized: null };

  const sanitized: AgentVehicle = {
    marca: marca!,
    modelo: modelo!,
    year: year!,
    version: version!,
    fullString: `${marca} ${modelo} ${year} – ${version}`,
  };

  return { valid: true, errors: [], sanitized };
}

/**
 * Valida y sanitiza la lista de repuestos solicitados.
 */
export function validateRequestedParts(
  parts: Partial<RequestedPart>[]
): { valid: boolean; errors: string[]; sanitized: RequestedPart[] } {
  const errors: string[] = [];
  const sanitized: RequestedPart[] = [];

  if (parts.length > MAX_PARTS_PER_REQUEST) {
    errors.push(`Máximo ${MAX_PARTS_PER_REQUEST} repuestos por request`);
    return { valid: false, errors, sanitized: [] };
  }

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const partName = sanitizePartName(p.partName ?? '');
    const description = (p.description ?? '').trim().slice(0, 500);
    const quality = (['alta', 'media', 'baja'] as const).includes(p.quality as any)
      ? (p.quality as 'alta' | 'media' | 'baja')
      : 'media';
    const quantity = Math.max(1, Math.min(99, Number(p.quantity) || 1));

    if (!partName && !description) {
      errors.push(`Repuesto ${i + 1}: nombre o descripción requeridos`);
      continue;
    }

    sanitized.push({
      partName: partName || `Repuesto ${i + 1}`,
      codigoCatalogo: p.codigoCatalogo ?? null,
      description,
      quality,
      quantity,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Valida el contexto completo del agente antes de enviarlo al LLM.
 */
export function validateAgentContext(
  raw: Partial<AgentContext>
): { valid: boolean; errors: string[]; sanitized: AgentContext | null } {
  const errors: string[] = [];

  // Validar vehículo
  const vehicleResult = validateVehicle(raw.vehicle ?? {});
  if (!vehicleResult.valid) errors.push(...vehicleResult.errors);

  // Validar repuestos
  const partsResult = validateRequestedParts(raw.requestedParts ?? []);
  if (!partsResult.valid) errors.push(...partsResult.errors);

  // Validar workshopId
  if (!raw.workshopId?.trim()) errors.push('workshopId requerido');

  if (errors.length > 0) return { valid: false, errors, sanitized: null };

  const sanitized: AgentContext = {
    vehicle: vehicleResult.sanitized!,
    requestedParts: partsResult.sanitized,
    workshopId: raw.workshopId!.trim(),
    workshopName: raw.workshopName?.trim(),
    sessionId: raw.sessionId ?? crypto.randomUUID(),
  };

  return { valid: true, errors: [], sanitized };
}
