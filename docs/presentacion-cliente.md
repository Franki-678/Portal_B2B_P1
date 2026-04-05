# Portal B2B Autopartes
## Sistema de Gestión de Pedidos y Cotizaciones

**Versión:** Prototipo 1.1  
**Fecha:** Abril 2026

---

## 2. RESUMEN EJECUTIVO 📋

El **Portal B2B Autopartes** es una solución integral diseñada para digitalizar y optimizar la relación comercial entre repuesterías y sus clientes estratégicos (talleres de chapa y pintura). Este prototipo 1.1 establece una plataforma privada y segura donde cada interacción, desde la solicitud inicial hasta la aprobación final, ocurre de manera estructurada y profesional.


## 3. PROBLEMA ACTUAL DEL NEGOCIO ⚠️

- **Gestión por WhatsApp:** Pedidos perdidos, falta de registro formal y dispersión de la información.
- **Sin trazabilidad:** No existe un historial estructurado de clientes ni de pedidos realizados.
- **Carga Operativa:** Tiempo excesivo dedicado a la coordinación manual y seguimiento de mensajes.
- **Ambigüedad:** Errores constantes en las cotizaciones por falta de fotos precisas o descripciones técnicas completas.

---

## 4. IMPACTO ESPERADO DEL CRM 📈

- **Eficiencia Temporal:** Reducción del tiempo de gestión por pedido de **30 min a solo 5 min**.
- **Fiabilidad Total:** Cero pedidos perdidos; cada interacción queda registrada y auditada.
- **Memoria Institucional:** Historial completo por taller para mejores decisiones comerciales.
- **Precisión Operativa:** Cotizaciones respaldadas por fotos, minimizando errores y devoluciones.
- **Profesionalismo:** Proyecta una imagen corporativa sólida y moderna ante los talleres clientes.

---

## 5. POR QUÉ EL CRM ES LA BASE 🏗️

Sin un orden interno robusto, el negocio no puede escalar de manera sostenible. Este CRM no es solo una herramienta de software; es el **primer paso necesario** para establecer una estructura profesional. Es la base sobre la cual se puede construir cualquier crecimiento futuro, permitiendo que la repuestería maneje un volumen mucho mayor de operaciones sin perder el control ni la calidad del servicio.

---

## 6. ROLES DEL SISTEMA 👤


El sistema opera bajo una estructura de permisos diferenciada para garantizar la integridad de los datos.

### ROL: VENDEDOR (Repuestería)
- **Acceso Único:** Panel administrativo exclusivo para la gestión del negocio.
- **Visibilidad Total:** Supervisión de todos los talleres registrados y sus actividades.
- **Gestión de Pedidos:** Recepción y procesamiento centralizado de solicitudes.
- **Cotización Detallada:** Carga de precios y fabricantes ítem por ítem.
- **Validación Visual:** Capacidad de subir fotos de los repuestos reales disponibles.
- **Control de Cierre:** Finalización del proceso una vez procesados los ítems aprobados.

### ROL: TALLER (Cliente)
- **Autogestión:** Registro y acceso mediante credenciales seguras.
- **Creación de Pedidos:** Generación de solicitudes multi-repuesto.
- **Documentación:** Subida de fotos de referencia del daño o pieza necesaria.
- **Recepción de Ofertas:** Visualización clara de las cotizaciones enviadas.
- **Decisión Flexible:** Capacidad de aprobar, rechazar o realizar aprobaciones parciales.
- **Historial Personal:** Acceso a la bitácora completa de sus interacciones pasadas.

---

## 4. FLUJO DE TRABAJO COMPLETO ⚙️

El proceso sigue una secuencia lógica de 7 pasos diseñados para eliminar la ambigüedad:

1.  **Detección de Necesidad:** El taller identifica los repuestos requeridos para una reparación.
2.  **Creación del Pedido:**
    - Se ingresan datos del vehículo (marca, modelo, versión, año).
    - Se agregan repuestos con descripción y calidad deseada.
    - Se adjuntan fotos de referencia.
    - Se asigna un número de orden interna (opcional).
    - Se envía la solicitud al portal.
3.  **Recepción y Revisión:**
    - El vendedor recibe el pedido como **"Pendiente"**.
    - Al abrirlo, el estado cambia a **"En revisión"**.
    - El vendedor analiza las fotos y descripciones técnicas.
4.  **Cotización:**
    - El vendedor carga precio y fabricante por cada ítem.
    - Adjunta fotos del stock disponible.
    - Los ítems no disponibles se marcan como "Sin stock".
    - Se envía la cotización formal.
5.  **Decisión del Taller:**
    - El pedido aparece como **"Cotizado"**.
    - El taller cuenta con una **vista comparativa** (Pedido vs. Ofrecido).
    - El taller puede aprobar todo o seleccionar ítems individualmente (Aprobación Parcial).
    - El sistema recalcula el total automáticamente.
6.  **Procesamiento Final:**
    - El vendedor recibe la confirmación de lo aprobado.
    - Procede con la logística de proveedores.
    - Marca el pedido como **"Cerrado"**.
7.  **Trazabilidad:** Ambos actores pueden consultar el historial completo con marcas de tiempo precisas.

---

## 5. ESTADOS DEL PEDIDO 🚦

| Estado | Descripción |
| :--- | :--- |
| 🟠 **Pendiente** | Solicitud enviada por el taller, a la espera de atención. |
| 🔵 **En revisión** | El vendedor está analizando la solicitud y fotos. |
| 🟡 **Cotizado** | El vendedor ha enviado la propuesta económica con fotos. |
| 🟢 **Aprobado** | El taller aceptó el 100% de la cotización. |
| 🌓 **Aprobado parcial** | El taller seleccionó solo algunos ítems de la cotización. |
| 🔴 **Rechazado** | El taller no aceptó la cotización enviada. |
| 🏁 **Cerrado** | El proceso de compra y gestión ha finalizado con éxito. |

---

## 6. FUNCIONALIDADES DESTACADAS ✨

- **📦 Multi-ítem:** Un solo pedido centraliza múltiples necesidades de repuestos.
- **📷 Fotos Doble Vía:** Fotos de referencia del taller + fotos reales del vendedor.
- **⚖️ Vista Comparativa:** Interfaz lado a lado para validar que lo cotizado cumple con lo pedido.
- **🔢 Numeración Inteligente:** Prefijos dinámicos para que el vendedor identifique el taller al instante (ej: `01-PED-0001`).
- **🧮 Recálculo Automático:** El sistema ajusta el presupuesto en tiempo real durante la aprobación parcial.
- **🌐 Portal Responsive:** Acceso optimizado tanto para computadoras de escritorio como dispositivos móviles.

---

## 7. BENEFICIOS DEL SISTEMA 🚀

### Para la Repuestería
- **Eliminación del Caos:** Orden absoluto en la recepción de pedidos.
- **Precisión Técnica:** Cotizaciones basadas en evidencia visual (fotos).
- **Eficiencia en Proveedores:** Compra solo lo que el cliente ya aprobó.
- **Escalabilidad:** Capacidad de gestionar más talleres con el mismo personal.

### Para los Talleres
- **Organización Interna:** Cada pedido tiene un número y seguimiento profesional.
- **Claridad de Costos:** Precios finales sin sorpresas, con fotos de la pieza.
- **Optimización de Presupuesto:** Posibilidad de elegir qué ítems comprar según el seguro o el cliente.
- **Confianza:** Proceso transparente y digital.

---

## 8. STACK TECNOLÓGICO 🛠️

- **Frontend:** Next.js 14 (App Router) con TypeScript para una navegación ultra rápida.
- **Estilos:** Tailwind CSS con diseño "Premium Dark" personalizado.
- **Backend/BD:** Supabase (PostgreSQL) para alta disponibilidad.
- **Seguridad:** Supabase Auth con encriptación de nivel bancario.
- **Multimedia:** Supabase Storage para el manejo eficiente de fotografías de alta resolución.
- **Infraestructura:** Vercel (Edge Functions y despliegue global).

---

## 12. ROADMAP POR ETAPAS 🗺️

### ETAPA 1 (Actual - Prototipo 1.1) 🚀
- CRM funcionando con portales diferenciados para Taller y Vendedor.
- Gestión completa de pedidos de repuestos y carga de cotizaciones.
- Soporte multimedia: fotos de referencia y del stock disponible.
- Aprobación parcial con recálculo automático de totales.
- Historial de estados con registro de fechas y horas.
- Módulo de registro y autogestión de talleres.

### ETAPA 2 (Próximos 2-3 meses) 🛠️
- **Notificaciones:** Alertas automáticas por email para cambios de estado.
- **Perfiles:** Página de configuración y personalización de datos de usuario.
- **Analytics:** Métricas y reportes básicos de actividad.
- **Optimización:** Mejoras de performance y pulido de interfaz UX/UI.

### ETAPA 3 (6 meses) 🌐
- **Integración:** Conexión directa con sistemas de proveedores clave.
- **Catálogo:** Implementación de catálogo dinámico de repuestos con precios base.
- **Precios:** Historial inteligente de variaciones de precios por repuesto.
- **Proveedores:** Módulo para gestionar múltiples fuentes de stock simultáneamente.

### ETAPA 4 (Largo Plazo) 🤖
- **Automatización:** Chatbot de WhatsApp integrado para consultas rápidas.
- **API:** Integración oficial con Meta Business API.
- **Fidelización:** Herramientas de seguimiento automático y CRM avanzado.
- **Movilidad:** Lanzamiento de App móvil nativa (iOS/Android).

---

## 13. DATOS DE CONTACTO 📞

Para más información, consultas técnicas o soporte:

- **Responsable:** ________________________________________
- **Email:** _____________________________________________
- **Teléfono:** __________________________________________
- **Web:** _______________________________________________

---
*Portal B2B Prototipo 1.1 - 2026*
