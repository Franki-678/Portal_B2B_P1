'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { User, UserRole } from '@/lib/types';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

const HYDRATE_QUERY_MS = 10_000;   // subido de 5s → 10s (latencia AR→US-East-2)
const PROFILE_ATTEMPTS = 2;         // reducido de 3 → 2 (fallar rápido y reintentar login)
const HYDRATE_RETRY_MS = 300;
const REGISTER_FETCH_MS = 20_000;   // registrar taller: más tiempo
const LOGIN_SIGNIN_MS = 20_000;     // subido de 8s → 20s
const USER_CACHE_KEY = 'portalb2b_user_cache_v1';

const TIMEOUT_MESSAGE =
  'No se pudo conectar. La base de datos puede estar tardando. Intentá de nuevo en unos segundos.';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Timeout corto solo para queries de hydrate (thenable-safe). */
function withHydrateTimeout<T>(promiseLike: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), HYDRATE_QUERY_MS);
    Promise.resolve(promiseLike).then(
      val => {
        clearTimeout(timer);
        resolve(val);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function mapAuthError(error: { message: string }): string {
  const m = error.message;
  if (m.includes('Invalid login credentials') || m.includes('invalid_credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (m.includes('Email not confirmed')) {
    return 'Tu cuenta no fue confirmada. Revisá tu email.';
  }
  return m;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  registerTaller: (data: RegisterTallerData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export interface RegisterTallerData {
  email: string;
  password: string;
  name: string;
  /** Solo dígitos, mín. 8 */
  phone: string;
  address?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const initialized = useRef(false);

  const hydrateUser = useCallback(async (supabaseUser: SupabaseUser): Promise<User | null> => {
    if (!isSupabaseConfigured()) return null;
    const supabase = getSupabaseClient();
    const userId = supabaseUser.id;
    const email = supabaseUser.email ?? '';

    for (let i = 0; i < PROFILE_ATTEMPTS; i++) {
      try {
        const result = (await withHydrateTimeout(
          supabase
            .from('profiles')
            .select('name, role, workshop_id, assigned_workshops')
            .eq('id', userId)
            .maybeSingle()
        )) as { data: unknown; error: unknown };

        const { data, error } = result;
        if (error) throw error;
        if (!data) {
          if (i < PROFILE_ATTEMPTS - 1) {
            await sleep(HYDRATE_RETRY_MS);
            continue;
          }
          return null;
        }

        const row = data as {
          name: string;
          role: UserRole;
          workshop_id: string | null;
          assigned_workshops: string[] | null;
        };
        let workshopName: string | undefined;
        if (row.workshop_id) {
          const wsRes = (await withHydrateTimeout(
            supabase.from('workshops').select('name').eq('id', row.workshop_id).maybeSingle()
          )) as { data: { name?: string } | null };
          workshopName = wsRes.data?.name ?? undefined;
        }

        return {
          id: userId,
          email,
          name: row.name,
          role: row.role,
          workshopId: row.workshop_id ?? undefined,
          workshopName,
          assignedWorkshops: row.assigned_workshops ?? undefined,
        };
      } catch (e) {
        console.error('[Auth] hydrateUser intento', i + 1, e);
        if (i < PROFILE_ATTEMPTS - 1) await sleep(HYDRATE_RETRY_MS);
      }
    }
    return null;
  }, []);

  const persistUserCache = useCallback((nextUser: User | null) => {
    if (typeof window === 'undefined') return;
    try {
      if (!nextUser) {
        window.localStorage.removeItem(USER_CACHE_KEY);
        return;
      }
      window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(nextUser));
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      initialized.current = true;
      return;
    }

    let unsubscribed = false;
    const supabase = getSupabaseClient();

    // UX rápida tras F5: mostramos cache local inmediatamente y validamos en background.
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(USER_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as User;
          setUser(cached);
          setIsLoading(false);
        }
      } catch {
        // noop
      }
    }

    void supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (unsubscribed) return;
      if (error) console.error('[Auth] getSession:', error);

      try {
        if (session?.user) {
          const loaded = await hydrateUser(session.user);
          if (!unsubscribed) {
            setUser(loaded);
            persistUserCache(loaded);
          }
        } else {
          if (!unsubscribed) {
            setUser(null);
            persistUserCache(null);
          }
        }
      } catch (e) {
        console.error('[Auth] init session:', e);
        if (!unsubscribed) {
          setUser(null);
          persistUserCache(null);
        }
      } finally {
        if (!unsubscribed) {
          setIsLoading(false);
          initialized.current = true;
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (unsubscribed) return;
      if (!initialized.current) return;

      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        persistUserCache(null);
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        const loaded = await hydrateUser(session.user);
        if (loaded) {
          setUser(loaded);
          persistUserCache(loaded);
        }
        return;
      }

      if (event === 'USER_UPDATED' && session?.user) {
        const loaded = await hydrateUser(session.user);
        if (loaded) {
          setUser(loaded);
          persistUserCache(loaded);
        }
      }
    });

    return () => {
      unsubscribed = true;
      subscription.unsubscribe();
    };
  }, [hydrateUser, persistUserCache]);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
      if (!isSupabaseConfigured()) {
        return { success: false, error: 'Supabase no está configurado.' };
      }
      const supabase = getSupabaseClient();

      try {
        const { data, error } = await new Promise<{
          data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'];
          error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'];
        }>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), LOGIN_SIGNIN_MS);
          Promise.resolve(
            supabase.auth.signInWithPassword({ email: email.trim(), password })
          ).then(
            r => {
              clearTimeout(t);
              resolve(r);
            },
            err => {
              clearTimeout(t);
              reject(err);
            }
          );
        });

        if (error) {
          return { success: false, error: mapAuthError(error) };
        }
        if (!data.user) {
          return { success: false, error: 'Error inesperado al iniciar sesión.' };
        }

        const loaded = await hydrateUser(data.user);
        if (!loaded) {
          await supabase.auth.signOut().catch(() => undefined);
          setUser(null);
          persistUserCache(null);
          return {
            success: false,
            error: 'Tu cuenta no tiene perfil asignado. Contactá al administrador.',
          };
        }

        setUser(loaded);
        persistUserCache(loaded);
        return { success: true, role: loaded.role };
      } catch (e) {
        if (e instanceof Error && e.message === 'timeout') {
          return { success: false, error: TIMEOUT_MESSAGE };
        }
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Error de red. Verificá tu conexión.',
        };
      }
    },
    [hydrateUser, persistUserCache]
  );

  const logout = useCallback(async () => {
    setUser(null);
    setIsLoading(false);
    persistUserCache(null);
    router.push('/login');
    if (isSupabaseConfigured()) {
      getSupabaseClient().auth.signOut().catch(e => {
        console.error('[Auth] logout:', e);
      });
    }
  }, [persistUserCache, router]);

  const registerTaller = useCallback(async (data: RegisterTallerData) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase no está configurado.' };
    }
    const supabase = getSupabaseClient();
    const nombre = data.name.trim();
    const email = data.email.trim();
    const phoneDigits = data.phone.replace(/\D/g, '');

    try {
      const { data: authData, error } = await new Promise<{
        data: Awaited<ReturnType<typeof supabase.auth.signUp>>['data'];
        error: Awaited<ReturnType<typeof supabase.auth.signUp>>['error'];
      }>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), LOGIN_SIGNIN_MS);
        Promise.resolve(
          supabase.auth.signUp({
            email,
            password: data.password,
            options: {
              data: {
                name: nombre,
                role: 'taller',
                workshop_name: nombre,
                phone: phoneDigits,
                address: (data.address ?? '').trim() || undefined,
              },
            },
          })
        ).then(
          r => {
            clearTimeout(t);
            resolve(r);
          },
          err => {
            clearTimeout(t);
            reject(err);
          }
        );
      });

      if (error) {
        if (
          error.message.includes('already registered') ||
          error.message.includes('User already registered')
        ) {
          return { success: false, error: 'Ese email ya está registrado. Intentá iniciar sesión.' };
        }
        return { success: false, error: error.message };
      }
      if (!authData.user) {
        return { success: false, error: 'No se pudo crear el usuario.' };
      }

      const userId = authData.user.id;
      await supabase.auth.signOut().catch(() => undefined);
      setUser(null);
      persistUserCache(null);

      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), REGISTER_FETCH_MS);
      let res: Response;
      try {
        res = await fetch('/api/setup-workshop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            name: nombre,
            email,
            phone: phoneDigits,
            address: (data.address ?? '').trim() || undefined,
          }),
          signal: ac.signal,
        });
      } catch {
        clearTimeout(t);
        return { success: false, error: TIMEOUT_MESSAGE };
      }
      clearTimeout(t);

      const payload = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !payload.success) {
        return {
          success: false,
          error: payload.error ?? 'No se pudo completar el registro del taller.',
        };
      }
      return { success: true };
    } catch (e) {
      if (e instanceof Error && e.message === 'timeout') {
        return { success: false, error: TIMEOUT_MESSAGE };
      }
      await supabase.auth.signOut().catch(() => undefined);
      setUser(null);
      persistUserCache(null);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Error de red. Verificá tu conexión.',
      };
    }
  }, [persistUserCache]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, registerTaller }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
