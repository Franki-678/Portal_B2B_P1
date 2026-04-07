# 1. PORTADA

**Portal de Solicitudes y Cotizaciones B2B**
**Para Autopartes de Chapa y Pintura**
"Avance de Prototipo — Etapa 1"

**Preparado por:** ManIAco
**Fecha:** Abril 2026

---

# 2. LO QUE ENTENDIMOS DE SU NEGOCIO

Usted gestiona una casa de repuestos especializada en autopartes de chapa y pintura, distribuyendo piezas clave como ópticas, paragolpes, guardabarros y similares. Su cliente principal es el taller de chapa y pintura.

Hemos comprendido que su modelo de negocio se basa en la intermediación ágil: no maneja stock propio de manera masiva, sino que actúa como un eslabón fundamental entre el taller y los proveedores. Cuando un taller le solicita una pieza, usted se encarga de ubicarla rápidamente entre su red de proveedores, adquirirla y coordinar su entrega.

Actualmente, este proceso es altamente manual y descentralizado. Sus clientes le envían pedidos de repuestos a través de WhatsApp. Luego, usted debe realizar búsquedas manuales en los sitios o catálogos de sus proveedores para conseguir las piezas solicitadas y, finalmente, responderle al taller nuevamente por WhatsApp con la cotización.

**Pregunta de validación:**
- ¿Esto es correcto? ¿Hay algún otro detalle de su forma de trabajo actual que debamos tener en cuenta?

---

# 3. EL PROBLEMA QUE IDENTIFICAMOS

A partir de su forma de trabajo actual, identificamos los siguientes desafíos operativos:

- **Gestión por WhatsApp:** Pedidos perdidos en un mar de conversaciones personales y laborales, falta de registro formal y dispersión de la información crítica.
- **Sin trazabilidad:** No existe un historial estructurado de sus clientes (los talleres) ni de los pedidos de repuestos realizados a lo largo del tiempo.
- **Carga Operativa Elevada:** Tiempo excesivo dedicado a la coordinación manual, lectura de mensajes desordenados y seguimiento caso por caso.
- **Ambigüedad en Cotizaciones:** Errores constantes e idas y vueltas por falta de fotografías precisas o descripciones técnicas completas de la pieza dañada o requerida.
- **Dependencia Personal:** El conocimiento y el estado de cada pedido depende enteramente de su supervisión directa, haciendo difícil delegar o escalar el negocio.

**Preguntas de validación:**
- ¿Falta algún problema que afecte hoy a su repuestería?
- ¿Cuál de estos problemas considera que es el más urgente a resolver?

---

# 4. AVANCE DEL PROTOTIPO

Lo que le mostramos hoy es un avance del diseño y la experiencia de uso del sistema.

Las pantallas que ve a continuación y en el resto del documento representan cómo va a funcionar el portal para usted y sus talleres clientes. Es importante recalcar que, en esta etapa del desarrollo, el foco principal estuvo en definir el flujo completo de la operación y garantizar la mejor experiencia de usuario posible.

Este es un entorno en construcción. El sistema completo incluirá todas las funciones aquí descritas, pero actualmente algunas de ellas se encuentran en desarrollo activo. Nuestro objetivo hoy es validar que el flujo de trabajo diseñado sea el correcto para su negocio.

[INSERTAR CAPTURA: Login]

[INSERTAR CAPTURA: Dashboard taller]

---

# 5. LO QUE VAN A VER SUS CLIENTES (LOS TALLERES)

Esta sección describe la experiencia que tendrán los talleres que trabajen con usted.

**5.1 Registrarse y acceder**
- El taller crea su cuenta utilizando su email y una contraseña segura.
- Puede acceder al sistema desde cualquier dispositivo, ya sea una computadora en la oficina o su teléfono móvil en el propio taller.
- Toda su información es privada y se encuentra completamente aislada de los pedidos y cotizaciones de otros talleres.

[INSERTAR CAPTURA: Pantalla de registro]

**5.2 Cargar una solicitud nueva**
- El usuario elige el vehículo específico (marca, modelo, versión, año).
- Describe detalladamente cada pieza de chapa o pintura que necesita.
- Indica la calidad deseada para cada repuesto (original, alternativa, económica).
- Adjunta fotos de referencia del daño en el vehículo o de la pieza requerida, reduciendo las dudas al mínimo.
- Puede cargar varias piezas distintas en una misma solicitud, centralizando su pedido.

[INSERTAR CAPTURA: Formulario de nuevo pedido]

**5.3 Ver el estado de sus pedidos**
El taller siempre sabrá en qué estado se encuentra su solicitud, eliminando la necesidad de preguntar "cómo viene mi pedido":
- **Pendiente:** Solicitud enviada por el taller, a la espera que usted la atienda.
- **En revisión:** Usted está analizando la solicitud y las fotos enviadas.
- **Cotizado:** Usted ya ha enviado la propuesta económica con precios por ítem.
- **Aprobado / Aprobado parcial / Rechazado:** Resoluciones posibles del taller frente a su cotización.
- **Cerrado:** El proceso de búsqueda, compra y gestión del repuesto ha finalizado.

[INSERTAR CAPTURA: Tracker de estados]

**5.4 Recibir y responder cotizaciones**
- El taller visualiza la cotización clara y desglosada, con el precio detallado por cada ítem solicitado.
- Tiene absoluta flexibilidad: puede aprobar la cotización completa, rechazarla en su totalidad, o aprobarla parcialmente (solo los repuestos que le resulten convenientes).
- Si realiza una aprobación parcial, el sistema recalcula el monto total de manera inmediata y automática.
- Queda un registro inalterable de su decisión final, guardado con fecha y hora exacta.

[INSERTAR CAPTURA: Vista de cotización]

**5.5 Ver su historial completo**
- Tienen acceso permanente a todo su historial, viendo todos los pedidos que le han realizado con sus fechas y estados definitivos.

**Preguntas de validación:**
- ¿Le parece completo lo que puede hacer el taller desde su lado?
- ¿Considera que falta alguna función clave para sus clientes?

---

# 6. LO QUE VA A VER USTED (SU PANEL DE GESTIÓN)

Esta es la sección operativa exclusiva para el control de su repuestería.

**6.1 Bandeja de solicitudes**
- Visualización de todas las solicitudes entrantes ordenadas cronológicamente por fecha.
- De un simple vistazo, puede ver de qué taller proviene cada pedido de repuestos.
- Cuenta con un sistema de identificación única por taller, facilitando la organización (ej: 01-PED-0001).

[INSERTAR CAPTURA: Dashboard vendedor]

**6.2 Ficha de cada taller**
- Acceso rápido a los datos de contacto del cliente.
- Visualización de su historial completo de pedidos.
- Botón de acceso directo hacia el WhatsApp del taller para consultas puntuales.

**6.3 Cotizador**
- Herramienta para cargar el precio correspondiente a cada ítem solicitado.
- Permite la indicación del fabricante y su proveedor interno (esta información es confidencial y solo visible para usted).
- Le permite subir fotos del repuesto exacto que encontró disponible para mayor tranquilidad del taller.
- Tiene la option de marcar aquellos ítems para los cuales no ha encontrado stock.
- Al guardar, el sistema notifica al taller automáticamente, sin requerirle a usted redactar un mensaje.

[INSERTAR CAPTURA: Formulario de cotización]

**6.4 Numeración inteligente de pedidos**
Diseñamos el sistema de códigos (ej: 01-PED-0001) para brindarle máxima organización:
- A cada taller cliente se le asigna un número fijo (ejemplo: Taller "A" es 01, Taller "B" es 02).
- Los pedidos de todos los talleres siguen una correlatividad estándar (PED-0001, PED-0002, etc.).
- Usted, en su panel, visualiza el prefijo completo ("01-PED-0001"), lo que le permite identificar instantáneamente de qué taller proviene la solicitud.
- Para el taller, el sistema es transparente y sencillo, ya que solo ve el número del pedido ("PED-0001") sin el prefijo interno, cuidando la privacidad.

**6.5 Acceso rápido a WhatsApp**
- Si bien el objetivo del portal es reducir la carga de chats, dentro de cada pedido usted cuenta con un botón directo al WhatsApp de ese taller en específico.
- Esto es particularmente útil para coordinar temas de entrega física o aclarar dudas urgentes que no requieran dejar un registro formal.

**Preguntas de validación:**
- ¿Lo que describimos de su panel de gestión es exactamente lo que necesita para trabajar cómodo?
- ¿Sobra o falta alguna herramienta para su día a día?

---

# 7. NOTIFICACIONES AUTOMÁTICAS

Con el fin de mantener un flujo de trabajo fluido sin carga manual, el sistema cuenta con avisos automáticos en momentos clave. *Nota: Las notificaciones por WhatsApp están planificadas para una etapa posterior del desarrollo; temporalmente el flujo funciona mediante email.*

| Evento | Quién recibe |
| :--- | :--- |
| Taller carga solicitud nueva | Usted recibe aviso por email |
| Usted envía cotización | El taller recibe aviso por email |
| Taller aprueba cotización | Usted recibe aviso por email |
| Taller rechaza cotización | Usted recibe aviso por email |
| Pedido cerrado | El taller recibe confirmación |

**Pregunta de validación:**
- ¿Hay algún otro momento clave en el que le gustaría recibir -usted o el taller- un aviso adicional?

---

# 8. UN DÍA TÍPICO CON EL SISTEMA

1. **8:00 AM:** Un taller desarma un vehículo chocado y carga un pedido en el portal, subiendo fotos del paragolpes averiado y la parrilla rota. El sistema le envía un aviso.
2. **8:15 AM:** Usted entra al panel, ve la nueva solicitud y el estado "Pendiente". Revisa las piezas y marcas solicitadas.
3. **8:30 AM:** Usted busca disponibilidad con sus proveedores. Consigue el paragolpes pero nota que la parrilla está sin stock.
4. **8:45 AM:** Carga el precio del paragolpes en el sistema, adjuntando la foto que le mandó su proveedor, y marca la parrilla como "sin stock". Envía la cotización y el taller es notificado automáticamente.
5. **9:15 AM:** El taller revisa la propuesta, acepta comprar el paragolpes (aprobación parcial) y el sistema le ajusta el total a pagar. Usted es notificado de la compra.
6. **9:30 AM:** Usted cierra la operación con su proveedor con la seguridad de que el taller ya dio el "ok" formal, sabiendo el precio y la mercadería respaldada por foto. Todo el ciclo duró minutos, sin escribir largos mensajes por WhatsApp ni sufrir malos entendidos.

---

# 9. SEGURIDAD Y PRIVACIDAD

Toda la información volcada en el portal es tratada con los más altos estándares de privacidad:
- **Datos Sensibles:** Los precios de costo que usted maneja con sus proveedores, así como los nombres de los mismos, son de su exclusividad y nunca se exponen al taller.
- **Aislamiento:** Un taller nunca podrá ver los precios cotizados, los repuestos solicitados ni la actividad de otro taller. Su base de clientes se mantiene segura.
- **Infraestructura:** Utilizamos bases de datos respaldadas en la nube que le garantizan alta disponibilidad; los pedidos no se borran ante cambios de celular (como ocurre en WhatsApp) y la información le pertenece exclusivamente a usted.

---

# 10. LO QUE VIENE DESPUÉS

Le comentamos brevemente el camino planificado para la evolución del sistema a futuro:

**ETAPA 2: Conexión automática con proveedores**
Se buscará integrar su portal con los sistemas o catálogos de sus proveedores principales.
- *Sin conexión:* Búsqueda manual de repuesto por repuesto al momento de cotizar.
- *Con conexión:* El sistema cruza automáticamente lo que pide el taller con lo que su proveedor enlista, acelerando radicalmente su proceso de cotización.

**ETAPA 3: Reportes y métricas avanzadas**
Podrá acceder a un panel inteligente que le responderá preguntas vitales:
- ¿Cuáles son las piezas más pedidas este mes?
- Facturación y volumen de pedidos segmentado por taller.
- Su tiempo promedio de respuesta a cotizaciones.
- Ranking de desempeño de sus proveedores.

**ETAPA 4: Automatización completa**
- Notificaciones vía WhatsApp directamente integradas.
- Posibilidad de contar con una App móvil.
- Integración con sus sistemas contables o de facturación.

---

# 11. LO QUE NECESITAMOS QUE NOS RESPONDA

Para poder avanzar con seguridad hacia la siguiente fase de implementación, le pedimos amablemente que reflexione sobre los puntos anteriores y nos confirme:

1. **Flujo de Trabajo:** ¿El proceso que le mostramos resuelve el problema que tiene hoy en su forma de operar?
2. **Claridad:** ¿Hay algo de la dinámica entre "Usted" y "El Taller" que le genera dudas o siente que no captamos del todo?

Quedamos a su disposición.
