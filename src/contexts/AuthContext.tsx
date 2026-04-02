'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '@/lib/types';
import { getSupabaseClient } from '@/lib/supabase/client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  registerTaller: (data: { email: string; password: string; name: string; phone?: string; address?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar sesión inicial al montar
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch (err) {
      console.error('Supabase no configurado', err);
      setIsLoading(false);
      return;
    }

    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          await loadUserProfile(session.user.id, session.user.email || '');
        }
      } catch (err) {
        console.error('Error loading session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Escuchar cambios de estado de auth (login/logout desde otras pestañas)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, session: { user: { id: string; email?: string } } | null) => {
      if (session?.user) {
        await loadUserProfile(session.user.id, session.user.email || '');
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  /**
   * Carga el perfil del usuario desde la tabla `profiles`.
   * Retorna el User construido (o null si no se encontró el perfil).
   * NO tiene fallback con datos hardcodeados — si el perfil no existe,
   * Supabase Auth funciona pero el perfil no está listo todavía.
   */
  const loadUserProfile = async (userId: string, email: string): Promise<User | null> => {
    const supabase = getSupabaseClient();
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, role, workshop_id')
        .eq('id', userId)
        .single();

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = data as any;

      if (profile) {
        const loadedUser: User = {
          id: userId,
          email: email,
          name: profile.name,
          role: profile.role as UserRole,
          workshopId: profile.workshop_id || undefined,
        };
        setUser(loadedUser);
        return loadedUser;
      }

      return null;
    } catch (err) {
      console.error('Error fetching user profile from profiles table:', err);
      // No asignamos un rol hardcodeado. Si el perfil no existe,
      // el login fallará con un mensaje claro.
      return null;
    }
  };

  /**
   * Login con Supabase Auth.
   * Flujo:
   *   1. supabase.auth.signInWithPassword(email, password)
   *   2. Si falla → retorna { success: false, error }
   *   3. Si ok → busca perfil en tabla `profiles` (user.id)
   *   4. Guarda en contexto: user, role, workshop_id
   *   5. Retorna { success: true, role } para que la página redirija
   */
  const login = async (email: string, password: string): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Traducir mensajes de Supabase a español amigable
        if (
          error.message.includes('Invalid login credentials') ||
          error.message.includes('invalid_credentials')
        ) {
          return { success: false, error: 'Email o contraseña incorrectos.' };
        }
        if (error.message.includes('Email not confirmed')) {
          return { success: false, error: 'Tu cuenta no ha sido confirmada. Revisá tu email.' };
        }
        return { success: false, error: error.message };
      }

      if (data.user) {
        const loadedUser = await loadUserProfile(data.user.id, data.user.email || '');

        if (!loadedUser) {
          return {
            success: false,
            error: 'Usuario autenticado pero sin perfil asignado. Contactá al administrador.',
          };
        }

        return { success: true, role: loadedUser.role };
      }

      return { success: false, error: 'Ocurrió un error inesperado al iniciar sesión.' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de red.';
      return { success: false, error: message };
    }
  };

  /**
   * Registro de nuevo taller via Supabase Auth signUp.
   * El trigger en la base de datos crea automáticamente el registro
   * en la tabla `profiles` y `workshops`.
   */
  const registerTaller = async (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    address?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getSupabaseClient();
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            role: 'taller',
            name: data.name,
            phone: data.phone || null,
            address: data.address || null,
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (authData.user) {
        // Esperar un momento para que el trigger de la BD cree el perfil
        await new Promise((r) => setTimeout(r, 800));
        await loadUserProfile(authData.user.id, authData.user.email || '');
        return { success: true };
      }

      return { success: false, error: 'No se pudo crear el usuario.' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de red.';
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Ignorar errores de configuración en logout
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
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
