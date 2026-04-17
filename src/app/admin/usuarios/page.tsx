'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { fetchProfilesDirectory } from '@/lib/supabase/queries';
import { ProfileDirectoryEntry } from '@/lib/types';

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<ProfileDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      setUsers(await fetchProfilesDirectory(sb));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el directorio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <>
      <TopBar
        title="Usuarios y roles"
        subtitle="Admin, vendedores y talleres con sus asignaciones."
        action={
          <Button variant="secondary" size="sm" onClick={() => void loadUsers()}>
            Actualizar
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950/70">
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">Nombre</th>
                <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">Rol</th>
                <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">Taller propio</th>
                <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">Asignaciones</th>
                <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">Contacto</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : users.map(user => (
                <tr key={user.id} className="border-b border-zinc-800/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-100">{user.name}</div>
                    <div className="text-xs text-zinc-500">{user.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{user.workshopName ?? 'N/A'}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {user.assignedWorkshops.length > 0 ? user.assignedWorkshops.join(', ') : 'Sin asignaciones'}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    <div>{user.email ?? 'Sin email'}</div>
                    <div>{user.phone ?? 'Sin telefono'}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function RoleBadge({ role }: { role: string }) {
  const className = {
    admin: 'border-orange-500/20 bg-orange-500/10 text-orange-300',
    vendedor: 'border-orange-500/20 bg-orange-500/10 text-orange-300',
    taller: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  }[role] ?? 'border-zinc-700 bg-zinc-800 text-zinc-200';

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{role}</span>;
}
