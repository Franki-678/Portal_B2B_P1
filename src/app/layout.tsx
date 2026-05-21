import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataStoreProvider } from '@/contexts/DataStoreContext';
import { ForcePasswordChangeGuard } from '@/components/auth/ForcePasswordChangeGuard';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Portal B2B | RC Repuestos',
  description: 'Sistema B2B para talleres de chapa y pintura. Gestión de pedidos, cotizaciones y repuestos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-background text-foreground antialiased selection:bg-orange-500/30 selection:text-orange-100`}>
        <AuthProvider>
          {/* Redirige a /cambiar-password si must_change_password === true */}
          <ForcePasswordChangeGuard />
          <DataStoreProvider>
            {children}
          </DataStoreProvider>
        </AuthProvider>
        {/* Telemetría Vercel — carga diferida, no bloquea rendering */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
