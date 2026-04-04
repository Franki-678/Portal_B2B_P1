# Portal B2B Autopartes
## Sistema de Gestión de Pedidos y Cotizaciones

**Versión:** Prototipo 1.1  
**Fecha:** Abril 2026

---

## 2. RESUMEN EJECUTIVO 📋

El **Portal B2B Autopartes** es una solución integral diseñada para digitalizar y optimizar la relación comercial entre repuesterías y sus clientes estratégicos (talleres de chapa y pintura). Este prototipo 1.1 establece una plataforma privada y segura donde cada interacción, desde la solicitud inicial hasta la aprobación final, ocurre de manera estructurada y profesional.

### El Problema
Históricamente, la comunicación entre talleres y repuesterías se ha visto afectada por el caos de WhatsApp, llamadas telefónicas constantes y falta de seguimiento formal. Esto genera errores en los pedidos, cotizaciones perdidas y una carga operativa excesiva para el vendedor.

### Beneficios Principales
- **Centralización:** Toda la información en un solo lugar.
- **Precisión:** Uso de fotografías tanto para la solicitud como para la oferta.
- **Trazabilidad:** Cada pedido tiene un historial de estados inalterable.
- **Eficiencia:** Reducción drástica del tiempo dedicado a la gestión manual.

---

## 3. ROLES DEL SISTEMA 👤

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

## 9. ROADMAP FUTURO 🗺️

- [ ] **Notificaciones:** Alertas automáticas vía Email y WhatsApp para cambios de estado.
- [ ] **Módulo de Proveedores:** Integración directa para gestionar compras externas.
- [ ] **Predicción de Precios:** Historial comparativo de costos por repuesto.
- [ ] **Business Intelligence:** Métricas y reportes de rentabilidad por taller.
- [ ] **App Móvil Nativa:** Mayor fluidez en la toma y subida de fotografías.

---

## 10. DATOS DE CONTACTO 📞

Para más información, consultas técnicas o soporte:

- **Responsable:** ________________________________________
- **Email:** _____________________________________________
- **Teléfono:** __________________________________________
- **Web:** _______________________________________________

---
*Portal B2B Prototipo 1.1 - 2026*
