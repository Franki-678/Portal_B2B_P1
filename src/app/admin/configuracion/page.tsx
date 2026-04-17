'use client';

import { TopBar } from '@/components/ui/Layout';

const sqlChecklist = [
  'Limpiar tablas operativas antes de pruebas integrales.',
  'Agregar assigned_workshops y la RPC get_distinct_marcas().',
  'Aplicar indices de performance para pedidos, eventos y cotizaciones.',
  'Actualizar RLS para admin, vendedor asignado y taller propietario.',
  'Crear usuarios de prueba en Supabase Auth y luego completar profiles.',
];

export default function AdminConfiguracionPage() {
  return (
    <>
      <TopBar
        title="Configuración administrativa"
        subtitle="Referencia operativa para Supabase, roles y ambientes de prueba."
      />

      <div className="grid gap-6 p-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
          <h2 className="text-base font-bold text-zinc-100">Checklist de despliegue</h2>
          <div className="mt-4 space-y-3">
            {sqlChecklist.map(item => (
              <div
                key={item}
                className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-300"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
          <h2 className="text-base font-bold text-zinc-100">Notas del entorno</h2>
          <div className="mt-4 space-y-4 text-sm text-zinc-400">
            <p>
              El portal ya soporta `admin`, `vendedor` y `taller` en cliente y consultas.
            </p>
            <p>
              La creacion de usuarios de autenticacion requiere credenciales administrativas de Supabase o hacerlo desde el panel.
            </p>
            <p>
              Esta pantalla sirve como resumen interno; el SQL completo queda tambien versionado en `supabase/`.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
