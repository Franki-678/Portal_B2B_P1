# Módulo: Agente IA — Portal B2B

> **Estado:** Arquitectura preparada · Implementación pendiente de aprobación del cliente.
> Este módulo está **aislado del build de Next.js** y puede migrarse a otro proyecto independientemente.

---

## Visión General

Agente conversacional especializado en búsqueda y cotización de repuestos automotores.
Conecta el catálogo de DM Distribuidoras con los pedidos activos del taller para brindar
respuestas precisas basadas en el vehículo exacto seleccionado (Marca / Modelo / Año / Versión).

## Jerarquía de Archivos

```
agente/
├── README.md                  ← este archivo
├── tsconfig.json              ← configuración TypeScript independiente
├── types.ts                   ← tipos compartidos del agente
├── system-prompt.ts           ← prompt maestro del LLM
├── sanitizer.ts               ← sanitización y validación de inputs
├── rag/
│   ├── embedder.ts            ← generación de embeddings (OpenAI / local)
│   ├── retriever.ts           ← búsqueda por similitud semántica
│   └── reranker.ts            ← reranking de resultados por relevancia
├── tools/
│   ├── search-parts.ts        ← herramienta: buscar repuesto en catálogo
│   ├── get-vehicle-context.ts ← herramienta: obtener contexto de vehículo
│   └── create-quote-draft.ts  ← herramienta: pre-generar borrador de cotización
└── config/
    ├── llm.config.ts          ← parámetros del modelo (temperatura, tokens, etc.)
    └── supabase.config.ts     ← config de pgvector para embeddings
```

## Integración con el CRM

El agente recibe contexto del formulario de nuevo pedido:

```ts
interface AgentContext {
  // Vehículo completo (4 niveles, confirmado por el usuario)
  vehicle: {
    marca: string;
    modelo: string;
    year: string;
    version: string;
  };
  // Repuestos solicitados en el pedido actual
  requestedParts: string[];
  // ID del taller para personalizar respuestas
  workshopId: string;
}
```

El componente `PartsAutocomplete.tsx` ya tiene la prop `fullVehicleContext` lista
para ser pasada como input al agente cuando se active.

## Stack Sugerido

| Capa | Herramienta |
|---|---|
| LLM | Anthropic Claude 3.5 Sonnet (via API) |
| Embeddings | OpenAI `text-embedding-3-small` o pgvector nativo |
| Vector Store | Supabase pgvector (extensión ya disponible) |
| Streaming | Vercel AI SDK (`ai` package) |
| Sanitización | `zod` para validación de schema + DOMPurify para HTML |

## Flujo de Activación (cuando se implemente)

```
Usuario selecciona vehículo completo (4 niveles)
        ↓
PartsAutocomplete recibe fullVehicleContext
        ↓
AgentContext construido con vehicle + requestedParts
        ↓
system-prompt.ts inyecta contexto dinámico
        ↓
retriever.ts busca en catálogo por similitud semántica
        ↓
LLM genera sugerencias rankeadas + borrador de cotización
        ↓
create-quote-draft.ts pre-llena el formulario de cotización
```

## Variables de Entorno Necesarias

```env
# Agregar a .env.local cuando se active el agente
ANTHROPIC_API_KEY=
OPENAI_API_KEY=                   # solo si se usan embeddings de OpenAI
SUPABASE_SERVICE_ROLE_KEY=        # para operaciones de pgvector
```

## Para Replicar en Otro Proyecto

1. Copiar la carpeta `/agente` completa
2. Instalar dependencias: `npm install ai @anthropic-ai/sdk zod`
3. Agregar las variables de entorno
4. Implementar los archivos marcados como skeleton
5. Conectar `PartsAutocomplete.tsx` con el endpoint `/api/agente/chat`
