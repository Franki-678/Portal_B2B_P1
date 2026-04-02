# Portal B2B Autopartes — Prototipo 1.1

Sistema B2B para talleres de chapa y pintura. Conecta talleres con vendedores de autopartes: pedidos, cotizaciones, aprobaciones y trazabilidad en tiempo real.

---

## 🚀 Instalación y ejecución local

```bash
cd portal-b2b
npm install
npm run dev
# Abrir: http://localhost:3000
```

Copiar `.env.local` con las credenciales del proyecto Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## 🗃️ Setup de la base de datos (OBLIGATORIO)

### Paso 1 — Ejecutar el script de reset y setup

Ir a **Supabase Dashboard → SQL Editor** y ejecutar el archivo completo:

```
supabase/reset_and_setup.sql
```

> ⚠️ Este script **elimina y recrea** todas las tablas, tipos, triggers y políticas RLS desde cero. Es idempotente: se puede ejecutar N veces sin error.

Lo que hace el script:
- Borra todas las tablas, ENUMs y triggers anteriores
- Crea los tipos ENUM (`user_role`, `order_status`, etc.)
- Crea las tablas: `workshops`, `profiles`, `orders`, `order_items`, `order_images`, `quotes`, `quote_items`, `order_events`
- Crea el trigger `handle_new_user` (crea perfil + workshop automáticamente al registrarse)
- Aplica todas las políticas RLS correctas
- Crea índices de rendimiento

---

### Paso 2 — Crear la cuenta de VENDEDOR manualmente

Los vendedores **no se registran desde la app** (solo los talleres lo hacen).

**Opción A — Desde Supabase Dashboard:**
1. Ir a **Authentication → Users → Add User**
2. Email: `vendedor01@demo.com` (o el que prefieras)
3. Contraseña: la que elijas
4. Hacer clic en "Create User"
5. Copiar el UUID del usuario creado
6. En **SQL Editor**, ejecutar:

```sql
UPDATE profiles
SET role = 'vendedor', name = 'Vendedor Principal'
WHERE id = '<UUID del usuario>';
```

**Opción B — Si el trigger creó el perfil automáticamente como "taller":**
```sql
UPDATE profiles
SET role = 'vendedor'
WHERE id = (SELECT id FROM auth.users WHERE email = 'vendedor01@demo.com');
```

---

### Paso 3 — Probar el registro de un taller nuevo

1. Ir a `http://localhost:3000/login`
2. Click en **"Nuevo taller"**
3. Completar: nombre del taller, email, contraseña (mín. 6 chars)
4. Click en **Crear cuenta**

El trigger `handle_new_user` crea automáticamente:
- Un registro en `profiles` con `role = 'taller'`
- Un registro en `workshops` con el nombre del taller
- Vincula `workshop_id` en el perfil

El sistema redirige automáticamente al dashboard `/taller`.

---

## 🗺️ Rutas de la aplicación

| Ruta | Descripción |
|------|-------------|
| `/` | Landing informativa |
| `/login` | Login + registro rápido de talleres |
| `/registro` | Registro dedicado de taller nuevo |
| `/taller` | Dashboard del taller |
| `/taller/pedidos` | Lista de pedidos |
| `/taller/pedidos/nuevo` | Formulario nuevo pedido |
| `/taller/pedidos/[id]` | Detalle + cotización + aprobar/rechazar |
| `/vendedor` | Dashboard del vendedor |
| `/vendedor/pedidos` | Tabla de todos los pedidos |
| `/vendedor/pedidos/[id]` | Detalle + formulario cotización |
| `/vendedor/clientes` | Lista de talleres/clientes |

---

## 🔄 Flujo del sistema

```
1. Taller se registra → /login → Nuevo taller
2. Taller hace login → entra a /taller
3. Taller crea pedido → /taller/pedidos/nuevo
4. Pedido queda en estado "pendiente"
5. Vendedor ve el pedido → /vendedor/pedidos
6. Vendedor lo marca "en revisión"
7. Vendedor carga cotización (multi-ítem) → estado "cotizado"
8. Taller recibe la cotización y puede:
   - Aprobar todo → estado "aprobado"
   - Rechazar → estado "rechazado"
   - Aprobar parcialmente → "aprobado_parcial"
9. Vendedor puede cerrar el pedido → "cerrado"
```

---

## 🛡️ Autenticación

- **100% Supabase Auth** — `signInWithPassword` y `signUp`
- **Sin mocks ni datos locales** para autenticación
- **Timeout de 10 segundos** en todas las operaciones de Supabase
- **Roles**: `taller` (se registra desde la app) | `vendedor` (creado por admin)
- El rol se lee siempre desde la tabla `profiles` en la BD

---

## 🛠️ Stack tecnológico

- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS
- **Auth + DB**: Supabase (Auth, PostgreSQL, RLS)
- **Deploy**: Vercel-ready

---

## 📁 Estructura del proyecto

```
src/
├── app/
│   ├── page.tsx              # Landing
│   ├── login/page.tsx        # Login + tabs (login / nuevo taller)
│   ├── registro/page.tsx     # Registro dedicado de taller
│   ├── taller/               # Dashboard del taller (protegido)
│   └── vendedor/             # Dashboard del vendedor (protegido)
├── contexts/
│   ├── AuthContext.tsx       # Auth real con Supabase + timeout 10s
│   └── DataStoreContext.tsx  # Store reactivo de datos
└── lib/
    ├── supabase/client.ts    # Cliente Supabase singleton
    ├── types.ts
    ├── constants.ts
    └── utils.ts

supabase/
├── reset_and_setup.sql       # ← EJECUTAR ESTO en Supabase SQL Editor
└── schema.sql                # Schema anterior (referencia, no usar)
```

---

## 🚀 Deploy en Vercel

```bash
npm run build   # Verificar sin errores
npx vercel      # Deploy
```

Agregar en Vercel → Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 🔮 Roadmap (Fase 2+)

- [x] Integración real con Supabase Auth
- [x] Trigger auto-crea perfil y workshop al registrarse
- [x] Políticas RLS por rol (taller / vendedor)
- [x] Timeout en operaciones de red
- [ ] Upload de imágenes con Supabase Storage
- [ ] Notificaciones en tiempo real (Supabase Realtime)
- [ ] Email al recibir cotización
- [ ] Módulo de proveedores

---

## 📄 Licencia

Prototipo privado. Todos los derechos reservados.
