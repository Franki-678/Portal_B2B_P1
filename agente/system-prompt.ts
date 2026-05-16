/**
 * agente/system-prompt.ts
 * Prompt maestro del Agente IA de repuestos automotores.
 * Inyecta el contexto dinámico del vehículo y los repuestos solicitados.
 *
 * TODO: Implementar cuando se active el módulo.
 */

import type { AgentContext } from './types';

// ─── Prompt base (estático) ───────────────────────────────────

const BASE_SYSTEM_PROMPT = `
Sos un asistente especializado en repuestos automotores para el mercado argentino.
Trabajás para un proveedor mayorista B2B que atiende talleres de chapa y pintura.

TUS CAPACIDADES:
- Identificar repuestos por nombre, código de catálogo o descripción
- Sugerir alternativas de calidad alta, media o baja
- Conocer compatibilidades entre marcas y modelos de vehículos
- Pre-calcular cotizaciones basadas en el catálogo disponible

TUS RESTRICCIONES:
- Solo respondés sobre repuestos automotores
- Siempre trabajás con el vehículo exacto que el usuario seleccionó
- No inventás precios ni disponibilidades que no estén en el catálogo
- Usás lenguaje profesional pero directo (mercado automotor argentino)

FORMATO DE RESPUESTA:
- Siempre confirmás el vehículo antes de buscar repuestos
- Listás alternativas por calidad (alta → media → baja)
- Incluís código de catálogo cuando existe
- Marcás claramente cuando un repuesto NO está en el catálogo
`.trim();

// ─── Builder con contexto dinámico ───────────────────────────

/**
 * Construye el system prompt completo inyectando el contexto del pedido.
 * @param ctx - Contexto del agente con vehículo y repuestos solicitados
 * @returns System prompt listo para enviar al LLM
 */
export function buildSystemPrompt(ctx: AgentContext): string {
  const vehicleSection = `
VEHÍCULO DEL PEDIDO ACTUAL:
  Marca:   ${ctx.vehicle.marca}
  Modelo:  ${ctx.vehicle.modelo}
  Año:     ${ctx.vehicle.year}
  Versión: ${ctx.vehicle.version}
  String completo: "${ctx.vehicle.fullString}"

Este es el vehículo para el cual el taller solicita repuestos.
Todos tus resultados deben ser compatibles con ESTE vehículo específico.
`.trim();

  const partsSection = ctx.requestedParts.length > 0
    ? `
REPUESTOS SOLICITADOS EN ESTE PEDIDO:
${ctx.requestedParts.map((p, i) =>
  `  ${i + 1}. ${p.partName || '(sin nombre)'}${
    p.codigoCatalogo ? ` [Código: ${p.codigoCatalogo}]` : ''
  }${p.description ? ` — Nota: ${p.description}` : ''}
     Calidad preferida: ${p.quality} · Cantidad: ${p.quantity}`
).join('\n')}
`.trim()
    : 'No hay repuestos pre-cargados. Esperá la consulta del usuario.';

  const workshopSection = `
TALLER: ${ctx.workshopName ?? ctx.workshopId}
SESIÓN: ${ctx.sessionId}
`.trim();

  return [BASE_SYSTEM_PROMPT, '---', vehicleSection, partsSection, workshopSection].join('\n\n');
}

// ─── Export del prompt base (para testing) ───────────────────

export { BASE_SYSTEM_PROMPT };
