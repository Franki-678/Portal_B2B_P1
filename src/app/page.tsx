'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { DEMO_USERS } from '@/lib/constants';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(user.role === 'taller' ? '/taller' : '/vendedor');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0F1117] relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/8 rounded-full blur-3xl" />
        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-20">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium mb-8">
            🔧 Sistema B2B · Chapa & Pintura · Autopartes
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Portal B2B
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              Autopartes
            </span>
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
            Plataforma profesional para la gestión de pedidos de repuestos entre talleres y proveedores.
            Cotizaciones, trazabilidad y comunicación en un solo lugar.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/login">
              <Button size="lg" variant="primary">
                🚀 Ingresar al sistema
              </Button>
            </Link>
          </div>
        </div>

        {/* Portals */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {/* Taller */}
          <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-6 hover:border-orange-500/30 transition-all duration-300 group">
            <div className="w-12 h-12 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-2xl mb-4">
              🏭
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Portal del Taller</h2>
            <p className="text-sm text-slate-400 mb-4">
              Creá pedidos de repuestos, hacé seguimiento de tus cotizaciones y aprobá los presupuestos desde un panel claro y simple.
            </p>
            <ul className="space-y-2 text-xs text-slate-500">
              <li className="flex items-center gap-2">✅ Nuevo pedido en 3 pasos</li>
              <li className="flex items-center gap-2">✅ Ver cotizaciones recibidas</li>
              <li className="flex items-center gap-2">✅ Aprobar/rechazar presupuestos</li>
              <li className="flex items-center gap-2">✅ Historial completo de pedidos</li>
            </ul>
          </div>

          {/* Vendedor */}
          <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-6 hover:border-blue-500/30 transition-all duration-300 group">
            <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-2xl mb-4">
              📦
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Portal del Vendedor</h2>
            <p className="text-sm text-slate-400 mb-4">
              Gestioná todos los pedidos de tus talleres, cargá cotizaciones detalladas y hacé seguimiento del estado de cada operación.
            </p>
            <ul className="space-y-2 text-xs text-slate-500">
              <li className="flex items-center gap-2">✅ Ver todos los pedidos en tiempo real</li>
              <li className="flex items-center gap-2">✅ Cotizar con múltiples ítems</li>
              <li className="flex items-center gap-2">✅ Adjuntar imágenes de referencia</li>
              <li className="flex items-center gap-2">✅ Panel admin con métricas</li>
            </ul>
          </div>
        </div>

        {/* Demo credentials */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center text-base">🔑</div>
            <div>
              <h3 className="font-semibold text-white text-sm">Credenciales de prueba</h3>
              <p className="text-xs text-slate-500">Usá estas cuentas para explorar el sistema</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {DEMO_USERS.map((u, idx) => (
              <div key={idx} className="bg-[#0f1117] rounded-xl p-4 border border-white/5">
                <div className="text-xs font-medium text-slate-300 mb-2">
                  {u.role === 'taller' ? '🏭' : '📦'} {u.name}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-14">Email:</span>
                    <code className="text-xs text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">{u.email}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-14">Pass:</span>
                    <code className="text-xs text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">{u.password}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-14">Rol:</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${u.role === 'vendedor' ? 'text-blue-400 bg-blue-500/10' : 'text-orange-400 bg-orange-500/10'}`}>
                      {u.role}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Version badge */}
        <div className="text-center mt-10 text-xs text-slate-600">
          Portal B2B Prototipo 1.1 · Chapa & Pintura · Autopartes
        </div>
      </div>
    </main>
  );
}
