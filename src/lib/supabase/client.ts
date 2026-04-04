import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

// ============================================================
// Singleton del cliente browser (una sola instancia = un solo lock de auth)
// ============================================================

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let supabaseInstance: BrowserClient | null = null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Retorna true si las variables de entorno de Supabase están presentes y
 * no son placeholders vacíos.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    supabaseUrl.includes('.supabase.co') &&
    supabaseAnonKey.length > 20
  );
}

/**
 * Cliente Supabase para el navegador (singleton).
 * Usar siempre esta función; no instanciar createClient / createBrowserClient en otro lado.
 */
export function getSupabaseClient(): BrowserClient {
  if (supabaseInstance) return supabaseInstance;

  if (!isSupabaseConfigured()) {
    throw new Error(
      '[Supabase] Variables de entorno no configuradas. ' +
        'Copia .env.example a .env.local y completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  const url = supabaseUrl!;
  const key = supabaseAnonKey!;

  supabaseInstance = createBrowserClient<Database>(url, key, {
    isSingleton: true,
    auth: {
      storageKey: 'sb-portal-b2b-auth',
      ...(typeof window !== 'undefined' ? { storage: window.localStorage } : {}),
    },
  });

  return supabaseInstance;
}

/**
 * Cliente o null si no hay configuración (sin lanzar).
 */
export function getSupabaseClientOrNull(): BrowserClient | null {
  if (!isSupabaseConfigured()) return null;
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

export type SupabaseClientType = BrowserClient;
