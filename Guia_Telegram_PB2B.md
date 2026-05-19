# Guía de Configuración y Uso del Bot de Telegram
### Portal B2B Autopartes — Manual para Juan y futuros mantenimientos

---

## ¿Para qué sirve el bot?

El bot de Telegram del Portal B2B notifica al equipo de ventas **en tiempo real** cuando pasa algo importante con un pedido:

- Cuando un taller crea un pedido nuevo.
- Cuando un vendedor cotiza, marca como pagado o entrega.
- Cuando un taller aprueba o rechaza una cotización.
- Cuando hay un conflicto que requiere atención inmediata.

Además, envía un **reporte privado de métricas diarias** al administrador (Juan).

---

## 1. Flujo de uso — Cómo leer los mensajes del grupo

Cuando algo pasa en el CRM, llega un mensaje al **grupo de ventas** de Telegram. Cada mensaje tiene:

- **Un emoji + tag entre corchetes** (qué pasó)
- **Información del taller, pedido y monto**
- **Una mención** (`@usuario`) si el evento requiere acción del vendedor

### Catálogo completo de notificaciones

| Emoji | Tag | Cuándo aparece | ¿Etiqueta vendedor? |
|---|---|---|---|
| 🆕 | `[NUEVO PEDIDO]` | Un taller crea un pedido | No |
| 🙋 | `[TOMADO]` | Un vendedor toma un pedido de la cola | No |
| 📝 | `[COTIZADO]` | Un vendedor envía la cotización | No |
| 🟢 | `[APROBADO]` | El taller aprueba la cotización completa | **Sí** |
| 🟡 | `[APROBADO PARCIAL]` | El taller aprueba solo algunos ítems | **Sí** |
| 🔴 | `[RECHAZADO]` | El taller rechaza la cotización | **Sí** |
| 💰 | `[PAGO REGISTRADO]` | Vendedor confirma que recibió el dinero | No |
| 📦 | `[ENTREGADO Y COBRADO]` | Vendedor entregó la mercadería | No |
| ⚠️ | `[CONFLICTO INICIADO]` | Taller inició un reclamo | **Sí (urgente)** |
| 🤝 | `[CONFLICTO RESUELTO]` | Admin/vendedor cerró el conflicto | No |

### Ejemplo real de un mensaje en el grupo

```
🟢 [APROBADO]
🏢 Taller: Carrocerías del Norte
📦 Pedido: #PED-0109
💰 Monto: $17.000

🔔 @Franco_San_Martin, coordiná el cobro y la entrega.
```

> **Cómo el CRM sabe a quién etiquetar:** cada perfil de vendedor en el CRM tiene un campo "Usuario de Telegram". El bot consulta ese campo y, si está cargado, mete `@usuario` en el mensaje (lo que genera el ping/notificación push). Si está vacío, muestra el nombre real en negrita pero **sin pingear**.

---

## 2. Crear el bot en BotFather (configuración inicial)

> ⚠️ **Esto se hace una sola vez.** Si el bot ya está creado, saltear a la sección 3.

### Pasos

1. Abrir Telegram y buscar **`@BotFather`** (el bot oficial de Telegram).
2. Iniciar conversación → enviar `/newbot`.
3. BotFather pregunta el **nombre del bot** (puede tener espacios, ej: `Portal B2B Notifier`).
4. Después pide el **username** (debe terminar en `bot`, ej: `pb2b_alerts_bot`).
5. BotFather responde con el **TOKEN** del bot, algo así:

```
123456789:AAH1234567890abcdefghijklmnopqrstuvw
```

6. **GUARDAR ESE TOKEN.** Es la variable `TELEGRAM_BOT_TOKEN`. No lo compartas públicamente.

### Personalización opcional

- `/setdescription` → descripción del bot
- `/setuserpic` → foto de perfil
- `/setcommands` → menú de comandos (ej: `/metricas - Ver KPIs del día`)

---

## 3. Crear el grupo de ventas y obtener el Chat ID

### 3.1 Crear el grupo

1. En Telegram → **Nuevo grupo** → agregar a todos los vendedores (Lucas, Andrés, Matías, etc.).
2. Ponerle un nombre claro: ej. `PB2B - Ventas`.
3. Agregar también al **bot** que creaste (`@pb2b_alerts_bot`).

### 3.2 Hacer al bot ADMINISTRADOR

> ⚠️ **Importante.** Si el bot no es admin, Telegram puede silenciar sus mensajes o bloquearlo.

1. En el grupo → tocar el nombre → **Administradores** → **Agregar administrador**.
2. Seleccionar el bot.
3. Permisos mínimos que necesita:
   - ✅ Enviar mensajes
   - ✅ Eliminar mensajes (opcional)
   - ❌ El resto puede quedar desactivado

### 3.3 Obtener el Chat ID del grupo

El Chat ID de un grupo es un **número negativo** (ej: `-1001234567890`). Para obtenerlo:

1. En Telegram, buscar **`@RawDataBot`** (un bot público de utilidad).
2. **Agregar `@RawDataBot` temporalmente al grupo** de ventas.
3. RawDataBot va a enviar automáticamente un JSON al grupo. Buscar el campo:

```json
"chat": {
    "id": -1001234567890,    ← este es el Chat ID
    "title": "PB2B - Ventas",
    "type": "supergroup"
}
```

4. **Guardar ese ID.** Es la variable `TELEGRAM_GROUP_ID`.
5. **Eliminar a @RawDataBot del grupo** (ya no se necesita).

---

## 4. Chat privado de métricas (solo Juan)

Además de las alertas del grupo, Juan recibe un reporte privado con KPIs (facturación, entregados, conflictos, etc.).

### Pasos

1. **Juan** debe abrir Telegram y enviarle un mensaje al bot directamente (`@pb2b_alerts_bot`).
2. Cualquier mensaje sirve (ej: `hola`). Esto **autoriza** al bot a poder responderle (sin este paso, el bot no puede iniciar conversaciones).
3. Obtener el **Chat ID privado de Juan**:
   - Usar `@RawDataBot` en conversación privada: enviarle `/start` y copiar el `chat.id` (es un **número positivo**, ej: `987654321`).
   - O usar `@userinfobot` que devuelve el ID de forma más simple.
4. **Guardar ese ID.** Es la variable `TELEGRAM_ADMIN_ID`.

### ¿Qué recibe Juan?

```
📊 Métricas — Hoy

💰 Facturado: $14.800.000
✅ Entregados: 22
📊 Ticket promedio: $672.727
⏳ Pendientes: 5
⚠️ En conflicto: 2
```

Este reporte se puede disparar:
- **Automáticamente** con un Vercel Cron Job (ej: todos los días a las 19:00).
- **Por demanda** desde un endpoint manual.
- En el futuro, con un comando del bot tipo `/metricas`.

---

## 5. Gestión de @usuarios en el CRM

> Esta es la parte clave del **mantenimiento diario**.

Cuando entra un vendedor nuevo o uno se va, Juan tiene que actualizar el `@usuario` de Telegram **desde el CRM**, sin tocar código.

### Cómo cargar/cambiar el @usuario de un vendedor

1. Ingresar al CRM como administrador.
2. Ir a **Gestión de vendedores** (menú lateral).
3. **Hacer clic** en el vendedor en la tabla → se abre el panel de detalle a la derecha.
4. Tocar el botón **✏️ Editar**.
5. Llenar el campo **"Usuario de Telegram (opcional)"** — formato:
   - `@Franco_San_Martin` ✅
   - `Franco_San_Martin` ✅ (sin @ también funciona — el CRM lo limpia solo)
   - `@franco san martin` ❌ (los usernames de Telegram no pueden tener espacios)
6. Tocar **Guardar**.
7. Listo. La próxima notificación a ese vendedor ya lo va a etiquetar.

### Buenas prácticas

- ✅ El `@usuario` debe ser el **username de Telegram público** del vendedor, no su nombre real ni su número.
- ✅ Si el vendedor cambia su username en Telegram, hay que actualizarlo en el CRM también.
- ✅ Si un vendedor NO tiene username de Telegram (o no quiere ser etiquetado), dejar el campo vacío. El bot va a mostrar su nombre real en negrita pero sin ping.
- ❌ No copiar el link `t.me/franco_san_martin`, solo el `franco_san_martin`.

### ¿Cómo verifico que el username de un vendedor sea correcto?

En Telegram → ir al perfil del vendedor → si tiene username, aparece como `@xxxxx` debajo del nombre. Ese es el valor a copiar.

---

## 6. Configuración en Vercel (variables de entorno)

> Esto se hace **una sola vez** cuando se despliega el proyecto. Si Juan o un nuevo desarrollador necesita reconfigurar, esta es la lista completa:

### Variables a setear en Vercel Dashboard → Settings → Environment Variables

| Variable | Valor | Cómo obtenerla |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `123456789:AAH...` | BotFather al crear el bot (sección 2) |
| `TELEGRAM_GROUP_ID` | `-1001234567890` | RawDataBot dentro del grupo (sección 3.3) |
| `TELEGRAM_ADMIN_ID` | `987654321` | RawDataBot en chat privado con Juan (sección 4) |
| `SUPABASE_WEBHOOK_SECRET` | string random largo | Generar con `openssl rand -hex 32` o cualquier UUID |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | Supabase Dashboard → Settings → API → service_role key |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mesrwnxkhbosmlupgvsc.supabase.co` | Ya configurada |

> **Importante:** después de agregar/cambiar una variable, hay que **redeployar el proyecto** desde Vercel para que tome efecto.

---

## 7. Configurar el webhook en Supabase

Después de que el endpoint esté desplegado en Vercel:

1. Ir a **Supabase Dashboard → Database → Webhooks → Create a new hook**.
2. **Hook #1 (eventos):**
   - **Name:** `telegram_order_events`
   - **Table:** `order_events`
   - **Events:** ☑ INSERT
   - **Type:** HTTP Request
   - **HTTP Method:** POST
   - **HTTP URL:** `https://TU_DOMINIO.vercel.app/api/webhooks/supabase/telegram`
   - **HTTP Headers:**
     - `x-supabase-signature` → mismo valor que `SUPABASE_WEBHOOK_SECRET`
     - `Content-Type` → `application/json`
3. **Hook #2 (orders update):**
   - **Name:** `telegram_orders_update`
   - **Table:** `orders`
   - **Events:** ☑ UPDATE
   - Mismo método, URL y headers que el Hook #1.

### Test manual

Desde el CRM, crear un pedido de prueba o cambiar el estado de uno. El mensaje debería llegar al grupo en **menos de 5 segundos**.

---

## 8. Troubleshooting (si las notificaciones no llegan)

| Síntoma | Diagnóstico | Solución |
|---|---|---|
| **Nada llega al grupo** | Probablemente Deployment Protection de Vercel | Vercel Dashboard → Settings → Deployment Protection → desactivar para `/api/webhooks/*` o configurar bypass token |
| **Llegan mensajes pero sin @ping** | El vendedor no tiene `telegram_username` cargado | CRM → Vendedores → Editar vendedor → llenar el campo |
| **Healthcheck devuelve `webhookSecret: false`** | Falta env var en Vercel | Vercel → Settings → Env Vars → agregar `SUPABASE_WEBHOOK_SECRET` |
| **Healthcheck devuelve `bot.ok: false`** | Token del bot inválido o vencido | Crear nuevo token con BotFather (`/revoke` y `/token`) |
| **Mensajes llegan duplicados** | Hay dos webhooks idénticos en Supabase | Borrar el duplicado en Supabase Dashboard |
| **Bot fue removido del grupo** | Alguien lo sacó | Agregarlo de nuevo + darle permisos de admin |

### Cómo hacer un healthcheck rápido

Abrir en el navegador (logueado como admin de Vercel):

```
https://TU_DOMINIO.vercel.app/api/webhooks/supabase/telegram?ping=1
```

Devuelve un JSON como este:

```json
{
  "ok": true,
  "envChecks": {
    "webhookSecret": true,
    "botToken": true,
    "groupId": true,
    "adminId": true,
    "supabaseUrl": true,
    "serviceRole": true
  },
  "bot": { "ok": true, "username": "pb2b_alerts_bot" }
}
```

- Todo `true` y `bot.ok: true` → el sistema está sano.
- Si algún `false` aparece, esa es la variable a corregir.

### Comandos de test directo (sin pasar por DB)

Para probar el bot sin tocar pedidos reales, hacer un POST con estos headers:

- `x-supabase-signature: <tu_secret>`
- `x-test-mode: true`
- `Content-Type: application/json`

Y uno de estos body:

```json
{"test": "ping"}            // verifica que el token sirve
{"test": "group-hello"}     // manda un "hola" al grupo
{"test": "approved-mock"}   // simula un evento "aprobado" con datos fake
```

---

## 9. Resumen — Quién hace qué

| Rol | Tarea | Frecuencia |
|---|---|---|
| **Juan (Admin)** | Crear bot con BotFather | Una sola vez |
| **Juan (Admin)** | Crear grupo + agregar bot como admin | Una sola vez |
| **Desarrollador** | Configurar env vars en Vercel | Una sola vez |
| **Desarrollador** | Configurar webhook en Supabase | Una sola vez |
| **Juan (Admin)** | Cargar `@usuario` de cada vendedor en el CRM | Cada vez que entra un vendedor nuevo |
| **Juan (Admin)** | Revisar healthcheck `?ping=1` | Si falla algo |
| **Vendedores** | Verificar que el bot los etiqueta correctamente | Una vez al ser dados de alta |

---

## 10. Glosario rápido

- **Bot de Telegram:** programa automático que envía mensajes via la API de Telegram.
- **Token del bot:** clave secreta que identifica al bot (BotFather lo entrega).
- **Chat ID:** identificador numérico único de cada chat (grupo, privado, canal). Lo obtiene RawDataBot.
- **Webhook:** notificación HTTP que Supabase envía automáticamente cuando algo cambia en la DB.
- **Endpoint webhook:** la URL en Vercel que recibe las notificaciones de Supabase (`/api/webhooks/supabase/telegram`).
- **`telegram_username`:** columna en la tabla `profiles` donde se guarda el @ de cada vendedor.
- **Mention/ping:** notificación push que recibe el usuario cuando se lo etiqueta con `@`.

---

**Última actualización:** Mayo 2026 — Portal B2B Autopartes v3.0
