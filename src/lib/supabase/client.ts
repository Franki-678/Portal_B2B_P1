import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ============================================================
// Singleton del cliente browser (createClient + lock noop → sin Web Locks API)
// ============================================================

type AppSupabaseClient = ReturnType<typeof createClient<Database>>;

let supabaseInstance: AppSupabaseClient | null = null;

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
 * Usar siempre esta función; no instanciar createClient en otro lado (salvo API con service role).
 */
export function getSupabaseClient(): AppSupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  if (!isSupabaseConfigured()) {
    throw new Error(
      '[Supabase] Variables de entorno no configuradas. ' +
        'Copia .env.example a .env.local y completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  const url = supabaseUrl!;
  const key = supabaseAnonKey!;

  supabaseInstance = createClient<Database>(url, key, {
    auth: {
      storageKey: 'sb-portal-b2b-auth',
      ...(typeof window !== 'undefined' ? { storage: window.localStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: async (_name, _acquireTimeout, fn) => fn(),
    },
  });

  return supabaseInstance;
}

/**
 * Cliente o null si no hay configuración (sin lanzar).
 */
export function getSupabaseClientOrNull(): AppSupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

export type SupabaseClientType = AppSupabaseClient;
