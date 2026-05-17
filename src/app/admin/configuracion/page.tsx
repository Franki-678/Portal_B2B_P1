'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { TopBar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormFields';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function AdminConfiguracionPage() {
  const { user } = useAuth();
  const router = useRouter();

  // ── Contacto de la empresa ────────────────────────────────
  const [whatsapp, setWhatsapp] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactMsg, setContactMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const sb = getSupabaseClient();
    void (sb as any)
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()
      .then(({ data }: any) => {
        if (data?.phone) setWhatsapp(data.phone);
      });
  }, [user?.id]);

  // Sólo admin puede usar esta página
  if (user && user.role !== 'admin') {
    router.replace('/vendedor/configuracion');
    return null;
  }

  // ── Handler: Contacto ─────────────────────────────────────

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSavingContact(true);
    setContactMsg(null);
    const sb = getSupabaseClient();
    const digits = whatsapp.replace(/\D/g, '');
    const { error } = await (sb as any)
      .from('profiles')
      .update({ phone: digits.length >= 8 ? digits : null })
      .eq('id', user.id);
    setSavingContact(false);
    if (error) setContactMsg({ type: 'err', text: error.message });
    else setContactMsg({ type: 'ok', text: 'Número guardado correctamente.' });
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      <TopBar
        title="Configuración"
        subtitle="Catálogos de datos y ajustes del sistema."
      />

      <div className="p-6 space-y-6 max-w-3xl">

        {/* ── Contacto de la empresa ── */}
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-lg">
              📲
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Contacto de la empresa</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Número de WhatsApp visible para los talleres al contactar con soporte.
              </p>
            </div>
          </div>
          <form onSubmit={handleSaveContact} className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="WhatsApp / Teléfono de la empresa"
                type="tel"
                inputMode="tel"
                value={whatsapp}
                onChange={e => setWhatsapp(e.target.value)}
                hint="Con código de área, sin espacios ni guiones"
              />
            </div>
            <Button
              type="submit"
              loading={savingContact}
              className="mb-0.5 bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-md shadow-orange-500/20"
            >
              Guardar
            </Button>
          </form>
          {contactMsg && (
            <p className={`text-sm font-medium ${contactMsg.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {contactMsg.text}
            </p>
          )}
        </section>

      </div>
    </>
  );
}
