import { createClient } from '@supabase/supabase-js';

// ============================================================
// DETECCIÓN: ¿Está Supabase configurado?
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Retorna true si las variables de entorno de Supabase están presentes y
 * no son los placeholders del .env.example.
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

// ============================================================
// CLIENTE SUPABASE (singleton, sin tipado genérico para evitar
// conflictos con las versiones del SDK)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: ReturnType<typeof createClient> | null = null;

/**
 * Obtiene la instancia del cliente Supabase.
 * Lanza error descriptivo si no está configurado.
 */
export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      '[Supabase] Variables de entorno no configuradas. ' +
      'Copia .env.example a .env.local y completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  if (!_client) {
    _client = createClient(supabaseUrl!, supabaseAnonKey!);
  }

  return _client;
}

/**
 * Para uso seguro: retorna el cliente o null si no está configurado.
 * Usar en lugares donde queremos fallback a mock data.
 */
export function getSupabaseClientOrNull(): ReturnType<typeof createClient> | null {
  if (!isSupabaseConfigured()) return null;
  return getSupabaseClient();
}

export type SupabaseClientType = ReturnType<typeof createClient>;
