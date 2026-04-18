'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      const target =
        user.role === 'taller' ? '/taller'
          : user.role === 'admin' ? '/admin'
          : '/vendedor';
      router.replace(target);
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 relative overflow-hidden font-sans">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[500px] h-[500px] bg-sky-600/10 rounded-full blur-[100px]" />
        {/* Subtle dot Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-24 sm:py-32">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500 text-xs font-semibold tracking-wide mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            SISTEMA B2B · CHAPA Y PINTURA
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold text-zinc-100 mb-6 tracking-tight leading-[1.1]">
            El estándar en gestión de
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-500 mt-2">
              repuestos automotores
            </span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 font-medium tracking-tight">
            Plataforma profesional para conectar talleres con proveedores.
            Cotizaciones, trazabilidad y logística en una única herramienta.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/login">
              <Button size="lg" variant="primary">
                🚀 Ingresar al sistema
              </Button>
            </Link>
          </div>
        </div>

        {/* Portals Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-20 relative">
          {/* Taller */}
          <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-8 hover:border-orange-500/30 transition-all duration-300 group shadow-lg shadow-black/20">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center text-2xl mb-6 shadow-inner">
              🏭
            </div>
            <h2 className="text-2xl font-bold text-zinc-100 mb-3 tracking-tight">Portal del Taller</h2>
            <p className="text-sm text-zinc-400 mb-6 font-medium leading-relaxed">
              Creá pedidos de repuestos, hacé seguimiento y aprobá presupuestos desde un panel unificado.
            </p>
            <ul className="space-y-3 text-sm text-zinc-500 font-medium">
              <li className="flex items-center gap-3"><span className="text-orange-500">✓</span> Nuevo pedido en 3 pasos</li>
              <li className="flex items-center gap-3"><span className="text-orange-500">✓</span> Visualizá cotizaciones recibidas</li>
              <li className="flex items-center gap-3"><span className="text-orange-500">✓</span> Aprobaciones parciales automáticas</li>
              <li className="flex items-center gap-3"><span className="text-orange-500">✓</span> Historial completo de operaciones</li>
            </ul>
          </div>

          {/* Vendedor */}
          <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-8 hover:border-sky-500/30 transition-all duration-300 group shadow-lg shadow-black/20">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500/20 to-sky-500/5 border border-sky-500/20 flex items-center justify-center text-2xl mb-6 shadow-inner">
              📦
            </div>
            <h2 className="text-2xl font-bold text-zinc-100 mb-3 tracking-tight">Portal del Vendedor</h2>
            <p className="text-sm text-zinc-400 mb-6 font-medium leading-relaxed">
              Gestioná consultas, envía cotizaciones precisas y escalá tus ventas con herramientas profesionales.
            </p>
            <ul className="space-y-3 text-sm text-zinc-500 font-medium">
              <li className="flex items-center gap-3"><span className="text-sky-500">✓</span> Monitor de demanda en tiempo real</li>
              <li className="flex items-center gap-3"><span className="text-sky-500">✓</span> Cotizador avanzado multi-item</li>
              <li className="flex items-center gap-3"><span className="text-sky-500">✓</span> Panel de control de estados</li>
              <li className="flex items-center gap-3"><span className="text-sky-500">✓</span> Comunicación directa y estructurada</li>
            </ul>
          </div>
        </div>

        {/* Footer / Version */}
        <div className="text-center mt-16 text-sm text-zinc-600 font-medium">
          Portal B2B Prototipo 1.1 · Diseño Industrial & SaaS
        </div>
      </div>
    </main>
  );
}
