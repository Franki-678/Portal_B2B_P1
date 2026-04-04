'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { User, UserRole } from '@/lib/types';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

// ────────────────────────────────────────────────────────────
// Configuración
// ────────────────────────────────────────────────────────────

const TIMEOUT_MS = 8_000;
const PROFILE_MAX_ATTEMPTS = 3;
const PROFILE_RETRY_DELAY_MS = 400;

const TIMEOUT_MESSAGE = 'La operación tardó demasiado. Verificá tu conexión.';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.message === '__AUTH_TIMEOUT__';
}

/** Compatible con thenables de Supabase (no tienen .finally()). */
function raceTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('__AUTH_TIMEOUT__')), TIMEOUT_MS);
    Promise.resolve(promise).then(
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

// ────────────────────────────────────────────────────────────
// Tipos del contexto
// ────────────────────────────────────────────────────────────

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
}

const AuthContext = createContext<AuthContextType | null>(null);

// ────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const loadSeq = useRef(0);

  /** Una sola referencia al cliente de Supabase en todo el provider. */
  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const hydrateUser = useCallback(
    async (supabaseUser: SupabaseUser): Promise<User | null> => {
      if (!supabase) return null;
      const userId = supabaseUser.id;
      const email = supabaseUser.email ?? '';

      for (let attempt = 0; attempt < PROFILE_MAX_ATTEMPTS; attempt++) {
        try {
          const { data, error } = (await raceTimeout(
            supabase
              .from('profiles')
              .select('name, role, workshop_id')
              .eq('id', userId)
              .maybeSingle()
          )) as { data: unknown; error: unknown };

          if (error) throw error;
          if (!data) {
            if (attempt < PROFILE_MAX_ATTEMPTS - 1) {
              await sleep(PROFILE_RETRY_DELAY_MS);
              continue;
            }
            return null;
          }

          let workshopName: string | undefined;
          const wsId = (data as { workshop_id: string | null }).workshop_id;
          if (wsId) {
            const { data: ws } = (await raceTimeout(
              supabase.from('workshops').select('name').eq('id', wsId).maybeSingle()
            )) as { data: unknown };
            workshopName = (ws as { name?: string } | null)?.name;
          }

          return {
            id: userId,
            email,
            name: (data as { name: string }).name,
            role: (data as { role: UserRole }).role,
            workshopId: wsId ?? undefined,
            workshopName,
          };
        } catch (e) {
          if (isTimeoutError(e)) throw e;
          console.error('[Auth] hydrateUser:', e);
          if (attempt < PROFILE_MAX_ATTEMPTS - 1) await sleep(PROFILE_RETRY_DELAY_MS);
        }
      }
      return null;
    },
    [supabase]
  );

  const applySession = useCallback(
    async (sessionUser: SupabaseUser | null | undefined) => {
      if (!supabase) return;
      const seq = ++loadSeq.current;
      if (!sessionUser) {
        setUser(null);
        return;
      }
      try {
        const loaded = await hydrateUser(sessionUser);
        if (seq !== loadSeq.current) return;
        if (!loaded) {
          await supabase.auth.signOut().catch(() => undefined);
          setUser(null);
          return;
        }
        setUser(loaded);
      } catch (e) {
        if (isTimeoutError(e)) {
          await supabase.auth.signOut().catch(() => undefined);
          setUser(null);
        }
        console.error('[Auth] applySession:', e);
      }
    },
    [supabase, hydrateUser]
  );

  useEffect(() => {
    if (!supabase) {
      console.error('[Auth] Supabase no configurado');
      setIsLoading(false);
      return;
    }

    let unsubscribed = false;

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (unsubscribed) return;

      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        if (!unsubscribed) setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        if (session?.user) {
          await applySession(session.user);
        } else {
          setUser(null);
        }
      } catch (e) {
        if (!isTimeoutError(e)) console.error('[Auth] onAuthStateChange:', e);
        setUser(null);
      } finally {
        if (!unsubscribed) setIsLoading(false);
      }
    });

    return () => {
      unsubscribed = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, applySession]);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
      if (!supabase) {
        return { success: false, error: 'Supabase no está configurado.' };
      }
      try {
        const { data, error } = await raceTimeout(
          supabase.auth.signInWithPassword({ email: email.trim(), password })
        );

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
          return {
            success: false,
            error:
              'Tu cuenta no tiene perfil asignado. Registrate de nuevo o contactá al administrador.',
          };
        }

        setUser(loaded);
        return { success: true, role: loaded.role };
      } catch (e) {
        if (isTimeoutError(e)) {
          return { success: false, error: TIMEOUT_MESSAGE };
        }
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Error de red. Verificá tu conexión.',
        };
      }
    },
    [supabase, hydrateUser]
  );

  const logout = useCallback(async () => {
    if (supabase) {
      try {
        await raceTimeout(supabase.auth.signOut());
      } catch (e) {
        if (!isTimeoutError(e)) console.error('[Auth] logout:', e);
      }
    }
    setUser(null);
    router.push('/login');
  }, [supabase, router]);

  const registerTaller = useCallback(
    async (data: RegisterTallerData): Promise<{ success: boolean; error?: string }> => {
      if (!supabase) {
        return { success: false, error: 'Supabase no está configurado.' };
      }
      const nombre = data.name.trim();
      const email = data.email.trim();

      try {
        const { data: authData, error } = await raceTimeout(
          supabase.auth.signUp({
            email,
            password: data.password,
            options: {
              data: {
                name: nombre,
                role: 'taller',
                workshop_name: nombre,
              },
            },
          })
        );

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

        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), TIMEOUT_MS);

        let res: Response;
        try {
          res = await fetch('/api/setup-workshop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, name: nombre, email }),
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
        if (isTimeoutError(e)) {
          return { success: false, error: TIMEOUT_MESSAGE };
        }
        await supabase.auth.signOut().catch(() => undefined);
        setUser(null);
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Error de red. Verificá tu conexión.',
        };
      }
    },
    [supabase]
  );

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
