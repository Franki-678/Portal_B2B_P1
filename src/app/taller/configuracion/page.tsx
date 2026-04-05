'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/ui/Layout';
import { Input, Textarea } from '@/components/ui/FormFields';
import { Button } from '@/components/ui/Button';

export default function TallerConfiguracionPage() {
  const { user } = useAuth();
  const [workshopName, setWorkshopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.id || !user.workshopId) return;
    const sb = getSupabaseClient();
    void (async () => {
      const wsId = user.workshopId;
      const { data: prof } = await sb.from('profiles').select('name').eq('id', user.id).single();
      const { data: ws } = wsId
        ? await sb
            .from('workshops')
            .select('name, phone, address, contact_name')
            .eq('id', wsId)
            .single()
        : { data: null };
      setLoading(false);
      const profName = (prof as { name?: string } | null)?.name ?? '';
      if (ws) {
        const w = ws as {
          name: string;
          phone: string | null;
          address: string | null;
          contact_name: string | null;
        };
        setWorkshopName(w.name ?? '');
        setPhone(w.phone ?? '');
        setAddress(w.address ?? '');
        setContactName((w.contact_name || profName).trim() || profName);
      } else {
        setContactName(profName);
      }
    })();
  }, [user?.id, user?.workshopId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !user.workshopId) return;
    setSaving(true);
    setMsg(null);
    const sb = getSupabaseClient();
    const digits = phone.replace(/\D/g, '');
    const { error: wErr } = await (sb as any)
      .from('workshops')
      .update({
        name: workshopName.trim(),
        phone: digits.length >= 8 ? digits : null,
        address: address.trim() || null,
        contact_name: contactName.trim() || null,
      })
      .eq('id', user.workshopId);
    if (wErr) {
      setSaving(false);
      setMsg({ type: 'err', text: wErr.message });
      return;
    }
    const { error: pErr } = await (sb as any)
      .from('profiles')
      .update({ name: contactName.trim() })
      .eq('id', user.id);
    setSaving(false);
    if (pErr) setMsg({ type: 'err', text: pErr.message });
    else setMsg({ type: 'ok', text: 'Cambios guardados correctamente.' });
  };

  return (
    <>
      <TopBar title="Configuración" subtitle="Datos de tu taller" />
      <div className="mx-auto max-w-lg p-6">
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-4" autoComplete="off">
            <Input
              label="Nombre del taller"
              value={workshopName}
              onChange={e => setWorkshopName(e.target.value)}
              required
            />
            <Input label="Email" type="email" value={user?.email ?? ''} disabled readOnly />
            <Input
              label="Teléfono"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
            <Textarea
              label="Dirección"
              value={address}
              onChange={e => setAddress(e.target.value)}
              rows={2}
            />
            <Input
              label="Nombre del contacto"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              required
            />
            {msg?.type === 'ok' && (
              <p className="text-sm font-medium text-emerald-400">{msg.text}</p>
            )}
            {msg?.type === 'err' && <p className="text-sm font-medium text-rose-400">{msg.text}</p>}
            <Button type="submit" loading={saving}>
              Guardar cambios
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
