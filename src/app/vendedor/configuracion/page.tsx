'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/ui/Layout';
import { Input } from '@/components/ui/FormFields';
import { Button } from '@/components/ui/Button';

export default function VendedorConfiguracionPage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const sb = getSupabaseClient();
    void sb
      .from('profiles')
      .select('name, phone')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) return;
        const row = data as { name: string; phone: string | null };
        setName(row.name ?? '');
        setPhone(row.phone ?? '');
      });
  }, [user?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    setMsg(null);
    const sb = getSupabaseClient();
    const digits = phone.replace(/\D/g, '');
    const { error } = await (sb as any)
      .from('profiles')
      .update({
        name: name.trim(),
        phone: digits.length >= 8 ? digits : null,
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) setMsg({ type: 'err', text: error.message });
    else setMsg({ type: 'ok', text: 'Cambios guardados correctamente.' });
  };

  return (
    <>
      <TopBar title="Configuración" subtitle="Datos de contacto que ven los talleres" />
      <div className="mx-auto max-w-xl p-6 space-y-8">

        {/* ── Perfil ── */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">
            Datos de perfil
          </h2>
          {loading ? (
            <p className="text-sm text-zinc-500">Cargando…</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-4" autoComplete="off">
              <Input
                label="Nombre completo"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
              <Input label="Email" type="email" value={user?.email ?? ''} disabled readOnly />
              <Input
                label="Teléfono / WhatsApp"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                hint="Los talleres podrán contactarte por este número"
              />
              {msg?.type === 'ok' && (
                <p className="text-sm font-medium text-emerald-400">{msg.text}</p>
              )}
              {msg?.type === 'err' && (
                <p className="text-sm font-medium text-rose-400">{msg.text}</p>
              )}
              <Button type="submit" loading={saving}>
                Guardar cambios
              </Button>
            </form>
          )}
        </section>

      </div>
    </>
  );
}
