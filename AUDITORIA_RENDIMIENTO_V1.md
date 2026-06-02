# AUDITORÍA DE RENDIMIENTO Y COSTOS — Portal B2B RC Repuestos
**Versión:** V1 — 01/06/2026  
**Autor:** Análisis técnico automatizado vía Claude + MCP  
**Contexto:** El proyecto golpeó el límite de **5 GB de Egress mensual** de Supabase Free Tier.  
**Modo:** Read-only. Cero cambios aplicados en esta sesión.

---

## RESUMEN EJECUTIVO

> **El límite de 5 GB de egress no lo está causando el tráfico de usuarios — lo está causando la arquitectura.**

Se identificaron **6 fuentes de egress evitable** que juntas pueden generar cientos de megabytes por sesión de usuario, completamente independiente de cuántos pedidos existan en la base de datos.

### ¿Dónde se pierde dinero (Egress)?

| # | Causa | Impacto estimado | Dificultad de fix |
|---|-------|-----------------|-------------------|
| 1 | Catálogo vehiculos descargado completo por sesión (48 138 filas, ~3–4 MB) | **Alto** | Bajo |
| 2 | Imágenes en `order-images` sin Cache-Control headers (20 MB en Storage, avg 1.9 MB/imagen) | **Muy Alto** | Bajo |
| 3 | Imágenes `quote_item_images` almacenadas como Base64 en BD y enviadas en cada `fetchAllOrders` | **Alto** | Medio |
| 4 | `fetchAllOrders` hace un full refresh de 8+ queries en paralelo después de CADA acción del usuario | **Alto** | Medio |
| 5 | 7 etiquetas `<img>` nativas sin Next.js Image Optimization (sin resize, sin WebP, sin cache) | **Medio** | Bajo |
| 6 | `next.config.ts` completamente vacío — sin headers de caché globales | **Medio** | Bajo |

### ¿Dónde se pierde velocidad?

- **5 806 785 sequential scans** en la tabla `profiles` (19 filas). Causa: 35 políticas RLS con `auth.uid()` evaluada fila por fila en lugar de una vez por query.
- **8 Foreign Keys sin índice cubriente** causan seq scans en JOINs.
- **5 índices creados pero nunca usados** — overhead de escritura sin beneficio.

---

## FASE 1: HALLAZGOS DE SUPABASE

### 1.1 — Sequential Scans (🔴 CRÍTICO)

| Tabla | Seq Scans | Idx Scans | % Seq | Filas |
|-------|-----------|-----------|-------|-------|
| **profiles** | **5 805 785** | 1 837 | **100.0%** | 19 |
| catalogo_repuestos | 281 | 11 | 96.2% | 91 |
| workshops | 4 044 | 8 109 | 33.3% | 10 |
| order_items | 9 229 | 81 225 | 10.2% | 175 |

**`profiles` es la bomba de tiempo.** Con solo 19 filas, esta tabla sufre 5.8 millones de sequential scans porque **35 políticas RLS** usan `auth.uid()` directamente en la expresión `USING`, lo que hace que PostgreSQL re-evalúe la función para cada fila de cada tabla en lugar de calcularla una sola vez por query.

**Diagnóstico técnico:** Supabase Advisor reportó `auth_rls_initplan` como **WARN** en las siguientes tablas: `profiles` (4 políticas), `orders` (4), `order_items` (4), `order_images` (4), `order_events` (1), `quotes` (4), `quote_items` (4), `quote_item_images` (4), `catalogo_repuestos` (1), `claim_images` (3), `workshops` (2). **Total: 35 políticas afectadas.**

**Fix:** Reemplazar `auth.uid()` con `(select auth.uid())` en todas las políticas. Una línea por política.

---

### 1.2 — RLS: Políticas ineficientes y permisivas (🔴 CRÍTICO SEGURIDAD)

#### Políticas de Seguridad Permisiva (con `WITH CHECK = true`)

| Tabla | Política | Comando | Riesgo |
|-------|----------|---------|--------|
| `profiles` | `profiles_admin_update` | UPDATE | Cualquier admin puede actualizar CUALQUIER fila de perfil sin restricción de columna |
| `profiles` | `profiles_insert` | INSERT | Cualquier usuario autenticado puede insertar un perfil con cualquier `role` |
| `workshops` | `workshops_insert` | INSERT | Cualquier usuario autenticado puede crear talleres sin restricción |
| `workshops` | `workshops_update` | UPDATE | UPDATE del admin sin restricción en WITH CHECK |

#### Duplicidad de políticas permisivas en `claim_images`

`claim_images` tiene **2 políticas SELECT** para el mismo rol (`anon`, `authenticated`, `authenticator`):  
`taller_select_own_claim_images` + `vendor_admin_select_claim_images`.  
PostgreSQL evalúa **ambas** para cada fila. Combinarlas en una sola política reduce el trabajo a la mitad.

#### Policies de `profiles.profiles_select`: `USING (true)`
Todos los usuarios autenticados pueden leer TODOS los perfiles. Si hay datos sensibles (emails, teléfonos, roles), esto representa una exposición innecesaria.

---

### 1.3 — Storage: La fuente de Egress más directa (🔴 CRÍTICO EGRESS)

#### Buckets configurados

| Bucket | Público | Límite archivo | Archivos | Tamaño total | Avg/archivo | Max |
|--------|---------|----------------|----------|--------------|-------------|-----|
| `order-images` | ✅ Sí | 10 MB | 11 | **20 MB** | **1.9 MB** | 10 MB |
| `quote-images` | ✅ Sí | 10 MB | N/D* | N/D | — | — |
| `catalog-images` | ✅ Sí | 5 MB | N/D* | N/D | — | — |
| `vehicle_documents` | ✅ Sí | 10 MB | 4 | 472 KB | 118 KB | 288 KB |
| `claim_evidence` | ❌ No | 10 MB | 2 | 249 KB | 124 KB | — |

*Sin metadatos de tamaño indexados.

**Problemas críticos:**
1. **Sin `Cache-Control` headers en ningún bucket.** Supabase Storage sirve objetos sin headers de caché por defecto. El navegador re-descarga la misma imagen en cada request. Una imagen de 1.9 MB vista 10 veces = 19 MB de egress innecesario.
2. **`order-images` tiene archivos de hasta 10 MB** (el máximo permitido). Cuando un vendedor abre un pedido con 5 imágenes de 2 MB cada una → 10 MB de descarga por página view.
3. **Todos los buckets tienen políticas SELECT amplias** (Supabase Advisor: `public_bucket_allows_listing`), permitiendo que cualquier cliente liste TODOS los archivos del bucket vía API.
4. **Sin optimización de formatos.** Se aceptan HEIC y se sirven sin convertir a WebP.

---

### 1.4 — Base64 en Base de Datos (🔴 CRÍTICO EGRESS)

```sql
-- quote_item_images: 45 filas, 1.5 MB total → avg ~34 KB por fila
-- order-images storage: 11 archivos, 20 MB
```

La función `fileToBase64` en `queries.ts` (líneas 97, 391, 594, 740, 1579) es un **fallback** que se activa cuando Supabase Storage falla. Cuando esto ocurre, la imagen se guarda como un data URI base64 **directamente en la columna `url` de `quote_item_images`**.

**El impacto:** Una imagen de 500 KB en base64 ≈ 667 KB de texto almacenado en la BD. Esta cadena se transmite en **cada llamada a `fetchAllOrders()`** junto con todos los demás datos, incluso cuando el usuario no está mirando esa imagen. Con 45 rows a 34 KB promedio = **1.5 MB adicionales en CADA refresh de datos**.

---

### 1.5 — Foreign Keys sin Índice (🟡 PERFORMANCE)

Supabase Advisor detectó **8 Foreign Keys sin índice cubriente**:

| Tabla | FK sin índice |
|-------|---------------|
| `claim_images` | `claim_images_user_id_fkey` |
| `order_events` | `order_events_user_id_fkey` |
| `order_items` | `order_items_order_id_fkey` ← **Muy usado** |
| `orders` | `orders_deleted_by_id_fkey` |
| `profiles` | `profiles_workshop_id_fkey` |
| `quote_items` | `quote_items_order_item_id_fkey` |
| `quotes` | `quotes_vendor_id_fkey` |
| `workshops` | `workshops_suspended_by_fkey` |

`order_items.order_id_fkey` es especialmente crítico: cada `fetchAllOrders` hace un `.in('order_id', orderIds)` sin que exista un índice en esa columna.

---

### 1.6 — Índices Creados pero Nunca Usados (🟡 OVERHEAD)

| Índice | Tabla | Scans |
|--------|-------|-------|
| `idx_profiles_active` | profiles | 0 |
| `idx_profiles_assigned` | profiles | 0 |
| `idx_vehiculos_marca_modelo_year` | vehiculos | 0 |
| `idx_catalogo_codigo` | catalogo_repuestos | 0 |
| `idx_orders_unassigned_queue` | orders | 0 |

Estos índices consumen espacio y generan overhead en cada INSERT/UPDATE **sin aportar ningún beneficio** a las queries actuales.

---

### 1.7 — pg_stat_statements (🟢 INFO)

Las queries más costosas en tiempo total son todas de `auth.*` (gestión de sesiones, refresh tokens). **No hay queries de `public.*` en el top 20.** Esto confirma que el problema de egress no es la carga de consultas sino el **volumen de datos transferidos**, no la latencia de queries.

---

## FASE 2: HALLAZGOS DEL FRONTEND

### 2.1 — `next.config.ts` Completamente Vacío (🔴 CRÍTICO)

```typescript
// Estado actual — next.config.ts
const nextConfig: NextConfig = {
  /* config options here */
};
```

**Faltan:**
- `images.remotePatterns` → Next.js Image Optimization no puede optimizar imágenes externas
- `headers()` → Sin Cache-Control global para assets estáticos
- `images.formats: ['image/avif', 'image/webp']` → Sin conversión a formatos modernos
- `compress: true` → Compresión HTTP no configurada explícitamente

---

### 2.2 — 7 Etiquetas `<img>` Nativas (🔴 CRÍTICO EGRESS)

```
src/app/taller/pedidos/nuevo/page.tsx:726
src/app/taller/pedidos/[id]/page.tsx:937
src/app/vendedor/pedidos/[id]/page.tsx:632
src/app/vendedor/pedidos/[id]/page.tsx:928
src/app/vendedor/pedidos/[id]/page.tsx:946
src/app/vendedor/pedidos/[id]/page.tsx:1085
src/app/vendedor/pedidos/[id]/page.tsx:1167
```

Todas muestran imágenes servidas directamente desde URLs de Supabase Storage (`supabase.co/storage/...`). Al usar `<img>` nativo en lugar de `<Image>` de Next.js:

1. **No hay resize** — Se descarga la imagen original (hasta 10 MB) aunque el elemento mida 80×80px.
2. **No hay conversión WebP/AVIF** — Archivos HEIC y PNG sin comprimir.
3. **No hay lazy loading automático** — Todas las imágenes se cargan aunque estén fuera del viewport.
4. **No hay blur placeholder** — UX pobre durante la carga.

**Ejemplo de impacto:** Una página de detalle de pedido con 5 fotos de 2 MB cada una = 10 MB descargados aunque el thumbnail sea de 80×80 píxeles.

---

### 2.3 — Catálogo de Vehículos: 48 138 filas descargadas completas (🟠 EGRESS ALTO)

```typescript
// queries.ts:1763 — fetchVehiclesCatalog
// Descarga 48 138 filas en páginas de 1000 (48-49 requests a la BD)
// Campos: marca, modelo, year, version
// Tamaño estimado de payload: ~3-4 MB JSON por descarga
```

**Mitigación existente:** El componente usa un cache module-level (`_catalogCache`) que evita re-fetches dentro de la misma sesión del navegador. ✅

**Problema restante:**
- Cada nueva sesión de navegador (nueva pestaña, F5) descarga los ~4 MB completos.
- La tabla `vehiculos` pesa 11 MB en disco (heap + índices), pero el payload JSON de solo los 4 campos es ~3-4 MB.
- Con 5 talleres activos creando pedidos diariamente → potencialmente 5 × 4 MB = **20 MB/día solo por este catálogo**.

**Fix óptimo:** Cachear en servidor (ISR o `unstable_cache`) con revalidación de 24 horas.

---

### 2.4 — `fetchAllOrders`: Full Refresh en Cada Acción (🟠 EGRESS MEDIO)

```typescript
// DataStoreContext.tsx — refreshData() se llama después de:
// submitQuote, editQuote, closeOrder, deleteOrder, takeOrder,
// releaseOrder, markOrderPaidByVendor, markOrderDelivered,
// resolveConflict, recotizarOrder, handleReactivate, etc.
```

Cada `refreshData()` ejecuta:
1. `fetchAllOrders` → orders (hasta 200 filas) + workshops + order_items + quotes + order_events + quote_items + quote_item_images + order_images = **8+ queries simultáneas**
2. Opcionalmente: `fetchAllWorkshops`

**El problema:** Cuando un vendedor envía una cotización, el sistema descarga nuevamente TODOS los 200 pedidos con todos sus datos anidados, aunque solo 1 pedido haya cambiado. Con imágenes base64 en `quote_item_images` (~1.5 MB), cada refresh puede transferir **2-5 MB de datos incluso sin imágenes nuevas**.

---

### 2.5 — Dependencias del Bundle (🟢 ACEPTABLE)

```json
"dependencies": {
  "@supabase/supabase-js": "^2.101.0",  // ~200 KB gzipped
  "@vercel/analytics": "^2.0.1",         // ~4 KB
  "@vercel/speed-insights": "^2.0.0",    // ~4 KB
  "next": "16.2.1",                       // Framework
  "react": "19.2.4",                      // Framework
  "react-dom": "19.2.4",                  // Framework
  "xlsx": "^0.18.5"                       // ⚠️ ~800 KB gzipped
}
```

**`xlsx` es la única alerta:** Pesa ~800 KB gzipped. Si se importa en el bundle del cliente (sin `dynamic import`), incrementa el First Load JS significativamente. Verificar si está siendo usado solo en scripts de servidor o en el browser.

---

### 2.6 — Seguridad: Funciones SECURITY DEFINER Expuestas a `anon` (🔴 CRÍTICO SEGURIDAD)

Las siguientes funciones pueden ser llamadas **sin autenticación** vía `/rest/v1/rpc/`:

| Función | Riesgo |
|---------|--------|
| `check_workshop_activity` | Expone estado de talleres a usuarios no autenticados |
| `get_admin_kpis` | **Expone KPIs del negocio (facturación, métricas) sin auth** |
| `get_distinct_marcas` | Bajo riesgo (catálogo público) |
| `get_vendor_ranking` | Expone ranking de vendedores sin auth |
| `get_workshop_ranking` | Expone ranking de talleres sin auth |
| `update_quote_transactional` | Permite modificar cotizaciones sin auth |
| `handle_new_user` | Trigger function — exposición innecesaria |
| `get_my_workshop_id` / `get_my_assigned_workshops` | Bajo riesgo contextual |

---

## FASE 3: PLAN DE ACCIÓN PRIORIZADO

> **Criterio de priorización:** Relación Impacto en Egress/Costo vs Esfuerzo de Implementación.  
> Resolver T101–T104 debería reducir el egress en **60-80%**.

---

### 🔴 PRIORIDAD ALTA — Impacto inmediato en Egress y Costo

#### T101 — Agregar Cache-Control headers a todos los buckets de Storage
**Impacto:** ⭐⭐⭐⭐⭐ | **Esfuerzo:** 1 hora

El cambio más fácil con el mayor impacto directo en egress. Sin caché, cada imagen se re-descarga en cada request. Con `max-age=31536000` (1 año, para objetos inmutables), el browser cachea la imagen localmente.

```sql
-- Vía Supabase Dashboard → Storage → Policies
-- O vía API de Supabase Admin
-- Agregar header en las políticas de Storage:
-- Cache-Control: public, max-age=31536000, immutable
-- Para order-images, quote-images, catalog-images, vehicle_documents
```

En `next.config.ts`:
```typescript
async headers() {
  return [{
    source: '/:path*',
    headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=3600' }]
  }];
}
```

---

#### T102 — Migrar `<img>` nativos a `<Image>` de Next.js
**Impacto:** ⭐⭐⭐⭐⭐ | **Esfuerzo:** 2-3 horas

7 archivos afectados. Next.js Image Optimization:
- Sirve imágenes **20-80% más pequeñas** (resize automático al tamaño real del elemento)
- Convierte a **WebP/AVIF** automáticamente
- Aplica **lazy loading** por defecto
- Evita descargas de imágenes de 10 MB para thumbnails de 80×80px

```typescript
// next.config.ts — Agregar remotePatterns
images: {
  remotePatterns: [{
    protocol: 'https',
    hostname: 'mesrwnxkhbosmlupgvsc.supabase.co',
    pathname: '/storage/v1/object/public/**',
  }],
  formats: ['image/avif', 'image/webp'],
}
```

```tsx
// Reemplazar <img src={url} className="h-20 w-20 ..."> por:
import Image from 'next/image';
<Image src={url} alt="" width={80} height={80} className="rounded-xl object-cover" />
```

---

#### T103 — Corregir imágenes base64 en BD: forzar upload a Storage
**Impacto:** ⭐⭐⭐⭐ | **Esfuerzo:** 3-4 horas

Las imágenes base64 en `quote_item_images.url` y `order_images.url` se transmiten en cada `fetchAllOrders`. Identificar filas con `url LIKE 'data:%'`, migrarlas a Storage, y actualizar las referencias a URLs normales.

```sql
-- Identificar el problema (read-only, solo diagnóstico):
SELECT COUNT(*), 
       SUM(LENGTH(url)) AS total_bytes
FROM quote_item_images 
WHERE url LIKE 'data:%';

SELECT COUNT(*), 
       SUM(LENGTH(url)) AS total_bytes
FROM order_images 
WHERE url LIKE 'data:%';
```

Además: endurecer el fallback en `queries.ts` para que loguee el error y no guarde base64 si Storage falla (retornar `null` en `imageUrl` en lugar de base64).

---

#### T104 — Corregir RLS initplan en las 35 políticas
**Impacto:** ⭐⭐⭐⭐ | **Esfuerzo:** 1-2 horas

```sql
-- PATRÓN: Reemplazar en todas las políticas
-- ANTES (re-evalúa por cada fila):
auth.uid()
-- DESPUÉS (evalúa una vez por query):
(select auth.uid())

-- Ejemplo en orders_select:
CREATE POLICY orders_select ON public.orders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (select auth.uid())  -- ← cambio aquí
    AND (p.role = ANY(ARRAY['admin','vendedor'])
    OR (p.role = 'taller' AND p.workshop_id = orders.workshop_id))
  )
);
```

Esto elimina los 5.8 millones de sequential scans en `profiles` y reduce la carga de CPU del servidor de BD.

---

#### T105 — Cachear catálogo vehiculos en servidor (ISR)
**Impacto:** ⭐⭐⭐⭐ | **Esfuerzo:** 2-3 horas

```typescript
// Convertir a Server Component con ISR:
import { unstable_cache } from 'next/cache';

const getCatalog = unstable_cache(
  async () => {
    const sb = createServerSupabaseClient();
    return fetchVehiclesCatalog(sb);
  },
  ['vehiculos-catalog'],
  { revalidate: 86400 } // 24 horas
);
```

Esto sirve el catálogo desde el edge de Vercel, sin tocar Supabase en cada request.

---

### 🟠 PRIORIDAD MEDIA — Impacto en Performance

#### T106 — Crear índices en Foreign Keys críticos
**Impacto:** ⭐⭐⭐ | **Esfuerzo:** 30 minutos

```sql
-- Los 3 más importantes por frecuencia de uso:
CREATE INDEX CONCURRENTLY idx_order_items_order_id 
  ON public.order_items(order_id);

CREATE INDEX CONCURRENTLY idx_quotes_order_id 
  ON public.quotes(order_id);

CREATE INDEX CONCURRENTLY idx_order_events_order_id 
  ON public.order_events(order_id);

CREATE INDEX CONCURRENTLY idx_profiles_workshop_id
  ON public.profiles(workshop_id);
```

---

#### T107 — Eliminar índices no usados
**Impacto:** ⭐⭐ | **Esfuerzo:** 15 minutos

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_assigned;
DROP INDEX CONCURRENTLY IF EXISTS idx_vehiculos_marca_modelo_year;
DROP INDEX CONCURRENTLY IF EXISTS idx_catalogo_codigo;
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_unassigned_queue;
```

---

#### T108 — Implementar `refreshData` optimista (selective refresh)
**Impacto:** ⭐⭐⭐ | **Esfuerzo:** 4-6 horas

En lugar de hacer full-fetch de todos los pedidos tras cada acción, actualizar solo el pedido modificado en el estado local:

```typescript
// DataStoreContext.tsx — updateLocalOrder ya existe pero no se usa en todos los casos
// Patrón: fetch solo el pedido modificado y hacer merge en el array de orders
const [updatedOrder] = await fetchOrderById(sb, orderId);
setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
// En lugar de: await refreshData()
```

---

#### T109 — Unificar políticas duplicadas en `claim_images`
**Impacto:** ⭐⭐ | **Esfuerzo:** 1 hora

Reemplazar `taller_select_own_claim_images` + `vendor_admin_select_claim_images` por una única política con OR lógico.

---

### 🟡 PRIORIDAD BAJA — Seguridad y Deuda Técnica

#### T110 — Revocar acceso `anon` a funciones SECURITY DEFINER
**Impacto:** ⭐⭐⭐ (seguridad) | **Esfuerzo:** 1 hora

```sql
REVOKE EXECUTE ON FUNCTION public.get_admin_kpis FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vendor_ranking FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_workshop_ranking FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_quote_transactional FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_workshop_activity FROM anon;
```

#### T111 — Agregar `search_path` fijo a las funciones SECURITY DEFINER
**Impacto:** ⭐⭐ (seguridad) | **Esfuerzo:** 1 hora

```sql
ALTER FUNCTION public.update_quote_transactional 
  SET search_path = public, pg_temp;
-- Repetir para: check_workshop_activity, get_admin_kpis, etc.
```

#### T112 — Lazy import de `xlsx`
**Impacto:** ⭐⭐ (bundle size) | **Esfuerzo:** 30 minutos

```typescript
// Reemplazar import estático:
// import * as XLSX from 'xlsx';
// Por import dinámico:
const XLSX = await import('xlsx');
```

#### T113 — Activar Leaked Password Protection en Supabase Auth
**Impacto:** ⭐⭐ (seguridad) | **Esfuerzo:** 5 minutos (toggle en dashboard)

---

## APÉNDICE: DATOS BRUTOS

### Dimensiones de tablas

| Tabla | Tamaño total | Heap | Índices | Filas |
|-------|-------------|------|---------|-------|
| vehiculos | **11 MB** | 3.7 MB | 7.2 MB | 48 138 |
| quote_items | 1.5 MB | 32 KB | 32 KB | 147 |
| quote_item_images | 1.5 MB | 8 KB | 32 KB | 45 |
| orders | 232 KB | 16 KB | 176 KB | 80 |
| order_events | 144 KB | 40 KB | 72 KB | 328 |
| quotes | 96 KB | 16 KB | 48 KB | 66 |
| profiles | 96 KB | 8 KB | 80 KB | 19 |

### Storage Buckets

| Bucket | Público | Archivos | Tamaño | Avg/archivo | Max |
|--------|---------|----------|--------|-------------|-----|
| order-images | ✅ | 11 | **20 MB** | 1.9 MB | 10 MB |
| vehicle_documents | ✅ | 4 | 472 KB | 118 KB | 288 KB |
| claim_evidence | ❌ | 2 | 249 KB | 124 KB | — |
| quote-images* | ✅ | — | — | — | — |
| catalog-images* | ✅ | — | — | — | — |

*Sin archivos con metadata de tamaño indexada.

### Advisors de Supabase (Resumen)

| Tipo | Cantidad | Severidad |
|------|----------|-----------|
| `auth_rls_initplan` | 35 políticas | WARN |
| `unindexed_foreign_keys` | 8 FKs | INFO |
| `unused_index` | 5 índices | INFO |
| `multiple_permissive_policies` | 6 instancias | WARN |
| `rls_policy_always_true` | 4 políticas | WARN (SECURITY) |
| `anon_security_definer_function_executable` | 8 funciones | WARN (SECURITY) |
| `public_bucket_allows_listing` | 3 buckets | WARN (SECURITY) |
| `function_search_path_mutable` | 8 funciones | WARN (SECURITY) |
| `auth_leaked_password_protection` | 1 | WARN (SECURITY) |

---

*Documento generado en modo read-only. Ningún cambio fue aplicado durante esta sesión.*  
*Próximo paso recomendado: implementar T101 → T103 en rama separada, medir egress en 48 horas.*
