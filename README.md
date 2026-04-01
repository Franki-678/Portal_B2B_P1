# Portal B2B Autopartes — Prototipo 1.1

Sistema B2B para talleres de chapa y pintura. Conecta talleres con vendedores de autopartes: pedidos, cotizaciones, aprobaciones y trazabilidad en tiempo real.

---

## 🚀 Instalación y ejecución

```bash
# Clonar o descomprimir el proyecto
cd portal-b2b

# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Abrir en el navegador
# http://localhost:3000
```

---

## 🔑 Credenciales demo (Supabase)

Si ejecutaste el script `supabase/schema.sql` completo, se crearon los siguientes perfiles de forma directa en Supabase Auth, listos para usar:

| Usuario | Email | Contraseña | Rol |
|---------|-------|------------|-----|
| Taller Norte | `taller1@demo.com` | `demo1234` | taller |
| Taller Sur | `taller2@demo.com` | `demo1234` | taller |
| Distribuidora Central | `vendedor@demo.com` | `demo1234` | vendedor |

> ⚠️ IMPORTANTE: El portal ahora utiliza la API real de Supabase (`signInWithPassword`) para el inicio de sesión. Ya no se usan datos mockeados en localstorage para la autenticación.

---

## 🗺️ Rutas de la aplicación

| Ruta | Descripción |
|------|-------------|
| `/` | Landing con info de portales y credenciales |
| `/login` | Login con acceso rápido demo |
| `/taller` | Dashboard del taller |
| `/taller/pedidos` | Lista de pedidos del taller |
| `/taller/pedidos/nuevo` | Formulario nuevo pedido |
| `/taller/pedidos/[id]` | Detalle + cotización + aprobar/rechazar |
| `/vendedor` | Dashboard del vendedor |
| `/vendedor/pedidos` | Tabla de todos los pedidos |
| `/vendedor/pedidos/[id]` | Detalle + formulario cotización |
| `/vendedor/clientes` | Lista de talleres/clientes |

---

## 🔄 Flujo del sistema

```
1. Taller hace login → entra a /taller
2. Taller crea pedido → /taller/pedidos/nuevo
3. Pedido queda en estado "pendiente"
4. Vendedor ve el pedido → /vendedor/pedidos
5. Vendedor abre el pedido, lo marca "en revisión"
6. Vendedor carga cotización (multi-ítem) → estado "cotizado"
7. Taller recibe la cotización → puede:
   - Aprobar todo → estado "aprobado"
   - Rechazar → estado "rechazado"
   - Aprobar parcialmente (seleccionar ítems) → "aprobado_parcial"
8. Vendedor puede cerrar el pedido → "cerrado"
```

---

## 🛠️ Stack tecnológico

- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS
- **Estado**: React Context combinado con **Supabase** real.
- **Backend preparado**: Supabase completo con Autenticación activa (ver `/supabase/schema.sql`)
- **Deploy**: Vercel-ready

---

## 📁 Estructura del proyecto

```
src/
├── app/
│   ├── page.tsx              # Landing
│   ├── login/page.tsx
│   ├── taller/
│   │   ├── layout.tsx        # Auth guard + sidebar
│   │   ├── page.tsx          # Dashboard taller
│   │   └── pedidos/
│   │       ├── page.tsx
│   │       ├── nuevo/page.tsx
│   │       └── [id]/page.tsx
│   └── vendedor/
│       ├── layout.tsx        # Auth guard + sidebar
│       ├── page.tsx          # Dashboard vendedor
│       ├── pedidos/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       └── clientes/page.tsx
├── components/
│   ├── ui/                   # Button, Badge, Card, FormFields, Layout
│   └── orders/               # OrderCard, OrderTimeline
├── contexts/
│   ├── AuthContext.tsx        # Integrado 100% con Supabase Auth
│   └── DataStoreContext.tsx  # Store reactivo compartido
└── lib/
    ├── types.ts              # Tipos TypeScript
    ├── constants.ts          # Labels, colores, opciones
    ├── utils.ts              # Utilidades
    └── mock-data.ts          # Datos demo completos
```

---

## ☁️ Conexión con Supabase configurada

1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ejecutar `/supabase/schema.sql` en el SQL Editor (este archivo creará esquemas, políticas, RLS, tablas y agregará los usuarios de prueba automáticamente con pgcrypto).
3. Copiar el contenido de `env.example.txt` hacia un nuevo archivo `.env.local`
4. Completar las variables con tu proyecto:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
5. La aplicación detectará automáticamente las variables y pasará a usar Supabase en lugar de mock data (gracias a `DataStoreContext.tsx` híbrido y `client.ts`).

---

## 🚀 Deploy en Vercel

```bash
# Build de producción
npm run build

# Deploy (con Vercel CLI)
npx vercel
```

O conectar directamente el repositorio GitHub desde [vercel.com](https://vercel.com).

**Variables de entorno en Vercel**: agregar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 🔮 Roadmap (Fase 2+)

- [x] Integración real con Supabase Auth
- [ ] Upload de imágenes con Supabase Storage
- [ ] Notificaciones en tiempo real (Supabase Realtime)
- [ ] Sistema de roles vía JWT
- [ ] Email/WhatsApp al recibir cotización
- [ ] Módulo de proveedores
- [ ] Historial de precios

---

## 📄 Licencia

Prototipo privado. Todos los derechos reservados.
