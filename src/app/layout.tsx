import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataStoreProvider } from '@/contexts/DataStoreContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Portal B2B Autopartes | Prototipo 1.1',
  description: 'Sistema B2B para talleres de chapa y pintura. Gestión de pedidos, cotizaciones y repuestos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-background text-foreground antialiased selection:bg-orange-500/30 selection:text-orange-100`}>
        <AuthProvider>
          <DataStoreProvider>
            {children}
          </DataStoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
