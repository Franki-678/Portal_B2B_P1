import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type AppSupabaseClient = SupabaseClient<Database>;

let instance: AppSupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Cliente browser singleton. Sin Web Locks API (lock noop).
 */
export function getSupabaseClient(): AppSupabaseClient {
  if (instance) return instance;

  if (!isSupabaseConfigured()) {
    throw new Error(
      '[Supabase] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local'
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  instance = createClient<Database>(url, key, {
    auth: {
      storageKey: 'sb-portal-b2b-auth',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: async <R,>(_name: string, _timeout: number, fn: () => Promise<R>) => fn(),
    },
  }) as AppSupabaseClient;

  return instance;
}

export function getSupabaseClientOrNull(): AppSupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

export type SupabaseClientType = AppSupabaseClient;
