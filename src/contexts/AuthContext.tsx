'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '@/lib/types';
import { getSupabaseClient } from '@/lib/supabase/client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
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

  const loadUserProfile = async (userId: string, email: string) => {
    const supabase = getSupabaseClient();
    try {
      // Intentar obtener el perfil real desde nuestra tabla profiles
      const { data, error } = await supabase
        .from('profiles')
        .select('name, role, workshop_id')
        .eq('id', userId)
        .single();

      if (error) throw error;
      const profile = data as any;

      if (profile) {
        setUser({
          id: userId,
          email: email,
          name: profile.name,
          role: profile.role as UserRole,
          workshopId: profile.workshop_id || undefined,
        });
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      // Fallback seguro por si el trigger falló temporalmente o demora
      setUser({
        id: userId,
        email: email,
        name: 'Usuario Logueado',
        role: 'taller',
      });
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Mensajes amigables
        if (error.message.includes('Invalid login credentials')) {
          return { success: false, error: 'Email o contraseña incorrectos.' };
        }
        return { success: false, error: error.message };
      }

      if (data.user) {
        await loadUserProfile(data.user.id, data.user.email || '');
        return { success: true };
      }
      
      return { success: false, error: 'Ocurrió un error inesperado al iniciar sesión.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de red.' };
    }
  };

  const registerTaller = async (data: { email: string; password: string; name: string; phone?: string; address?: string }): Promise<{ success: boolean; error?: string }> => {
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
          }
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (authData.user) {
        await loadUserProfile(authData.user.id, authData.user.email || '');
        return { success: true };
      }

      return { success: false, error: 'No se pudo crear el usuario.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de red.' };
    }
  };

  const logout = async () => {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore config errors on logout
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
