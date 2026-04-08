'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/ui/Layout';
import { Input, Textarea } from '@/components/ui/FormFields';
import { Button } from '@/components/ui/Button';
import { CatalogoImporter } from '@/components/ui/CatalogoImporter';

export default function VendedorConfiguracionPage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const sb = getSupabaseClient();
    void sb
      .from('profiles')
      .select('name, phone, company_name, company_address')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) return;
        const row = data as {
          name: string;
          phone: string | null;
          company_name: string | null;
          company_address: string | null;
        };
        setName(row.name ?? '');
        setPhone(row.phone ?? '');
        setCompanyName(row.company_name ?? '');
        setCompanyAddress(row.company_address ?? '');
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
        company_name: companyName.trim() || null,
        company_address: companyAddress.trim() || null,
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) setMsg({ type: 'err', text: error.message });
    else setMsg({ type: 'ok', text: 'Cambios guardados correctamente.' });
  };

  return (
    <>
      <TopBar title="Configuración" subtitle="Datos de contacto que ven los talleres" />
      <div className="mx-auto max-w-2xl p-6 space-y-10">

        {/* ── Perfil ────────────────────────────────────── */}
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
                label="Teléfono (WhatsApp para talleres)"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                hint="Con código de área"
              />
              <Input
                label="Nombre de la empresa"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
              />
              <Textarea
                label="Dirección de la empresa"
                value={companyAddress}
                onChange={e => setCompanyAddress(e.target.value)}
                rows={2}
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
        </section>

        {/* ── Catálogo de Repuestos ─────────────────────── */}
        <section className="border-t border-zinc-800/60 pt-8">
          <div className="mb-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-1">
              Catálogo de repuestos
            </h2>
            <p className="text-xs text-zinc-600 font-medium leading-relaxed">
              Importá tu catálogo desde un archivo CSV o Excel. Los talleres lo verán como
              sugerencias al escribir el nombre de un repuesto en el formulario de pedido.
            </p>
          </div>

          <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-5 shadow-sm">
            <CatalogoImporter />
          </div>
        </section>

      </div>
    </>
  );
}
