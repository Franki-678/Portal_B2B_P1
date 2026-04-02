'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '@/lib/types';
import { getSupabaseClient } from '@/lib/supabase/client';

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

interface RegisterTallerData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  address?: string;
}

// ────────────────────────────────────────────────────────────
// Helper: Timeout para operaciones de Supabase Auth (no queries)
// Las operaciones de auth (signIn, signUp, getSession) retornan
// Promise estándar, así que el timeout aplica sin problema.
// Las queries de Supabase (PostgREST) también son awaitables.
// ────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10_000;

function makeTimeoutError(): Error {
  return new Error('La operación tardó demasiado. Verificá tu conexión e intentá de nuevo.');
}

// Versión para operaciones de auth que retornan Promise<T>
function raceTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(makeTimeoutError()), ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeout,
  ]);
}

// ────────────────────────────────────────────────────────────
// Contexto
// ────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Inicializar sesión al montar el componente
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch (err) {
      console.error('[Auth] Supabase no configurado:', err);
      setIsLoading(false);
      return;
    }

    const initializeAuth = async () => {
      try {
        // getSession() retorna una Promise estándar → ok con raceTimeout
        const sessionResult = await raceTimeout(supabase.auth.getSession());
        if (sessionResult.error) throw sessionResult.error;

        if (sessionResult.data.session?.user) {
          const { id, email } = sessionResult.data.session.user;
          await loadUserProfile(id, email ?? '');
        }
      } catch (err) {
        console.error('[Auth] Error al inicializar sesión:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listener para cambios de sesión (logout desde otra pestaña, token refresh, etc.)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await loadUserProfile(session.user.id, session.user.email ?? '');
        } else {
          setUser(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ──────────────────────────────────────────────────────────
  // loadUserProfile: busca el perfil en la tabla `profiles`.
  // Retorna el User construido o null si no existe.
  // NO asigna roles hardcodeados.
  // ──────────────────────────────────────────────────────────
  const loadUserProfile = async (userId: string, email: string): Promise<User | null> => {
    const supabase = getSupabaseClient();
    try {
      // La query PostgREST es awaitable directamente
      const { data, error } = await Promise.race([
        supabase
          .from('profiles')
          .select('name, role, workshop_id')
          .eq('id', userId)
          .single(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(makeTimeoutError()), TIMEOUT_MS)
        ),
      ]);

      if (error) throw error;
      if (!data) return null;

      const loadedUser: User = {
        id: userId,
        email,
        name: (data as { name: string }).name,
        role: (data as { role: string }).role as UserRole,
        workshopId: (data as { workshop_id?: string }).workshop_id ?? undefined,
      };
      setUser(loadedUser);
      return loadedUser;
    } catch (err) {
      console.error('[Auth] Error al cargar perfil de usuario:', err);
      return null;
    }
  };

  // ──────────────────────────────────────────────────────────
  // login: autenticación real con Supabase
  //
  // Flujo:
  //   1. signInWithPassword(email, password) con timeout 10s
  //   2. Si falla → { success: false, error: mensaje en español }
  //   3. Si ok → busca perfil en tabla `profiles`
  //   4. Si no hay perfil → logout automático + error claro
  //   5. Retorna { success: true, role } para redirigir desde la UI
  // ──────────────────────────────────────────────────────────
  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await raceTimeout(
        supabase.auth.signInWithPassword({ email, password })
      );

      if (error) {
        if (
          error.message.includes('Invalid login credentials') ||
          error.message.includes('invalid_credentials')
        ) {
          return { success: false, error: 'Email o contraseña incorrectos.' };
        }
        if (error.message.includes('Email not confirmed')) {
          return {
            success: false,
            error: 'Tu cuenta no fue confirmada. Revisá tu email.',
          };
        }
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Error inesperado al iniciar sesión.' };
      }

      // Cargar perfil desde la base de datos (roles, workshop_id, etc.)
      const loadedUser = await loadUserProfile(data.user.id, data.user.email ?? '');

      if (!loadedUser) {
        // Usuario autenticado pero sin perfil en la BD → logout y error claro
        await supabase.auth.signOut().catch(() => undefined);
        setUser(null);
        return {
          success: false,
          error:
            'Tu cuenta no tiene perfil asignado. ' +
            'Contactá al administrador o intentá registrarte nuevamente.',
        };
      }

      return { success: true, role: loadedUser.role };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error de red. Verificá tu conexión.';
      return { success: false, error: message };
    }
  };

  // ──────────────────────────────────────────────────────────
  // registerTaller: registro de nuevo taller via Supabase signUp.
  //
  // Envía metadata: { name, role: 'taller', workshop_name }
  // El trigger handle_new_user() crea el perfil y workshop en la BD.
  // ──────────────────────────────────────────────────────────
  const registerTaller = async (
    data: RegisterTallerData
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getSupabaseClient();

      const { data: authData, error } = await raceTimeout(
        supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              name: data.name,
              role: 'taller',
              workshop_name: data.name,
              phone: data.phone ?? null,
              address: data.address ?? null,
            },
          },
        })
      );

      if (error) {
        if (
          error.message.includes('already registered') ||
          error.message.includes('User already registered')
        ) {
          return {
            success: false,
            error: 'Ese email ya está registrado. Intentá iniciar sesión.',
          };
        }
        return { success: false, error: error.message };
      }

      if (!authData.user) {
        return { success: false, error: 'No se pudo crear el usuario.' };
      }

      // Dar tiempo al trigger de la BD para que cree el perfil y workshop
      await new Promise<void>((r) => setTimeout(r, 1000));
      await loadUserProfile(authData.user.id, authData.user.email ?? '');

      return { success: true };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error de red. Verificá tu conexión.';
      return { success: false, error: message };
    }
  };

  // ──────────────────────────────────────────────────────────
  // logout
  // ──────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // No bloquear el logout por errores de configuración
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, registerTaller, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
