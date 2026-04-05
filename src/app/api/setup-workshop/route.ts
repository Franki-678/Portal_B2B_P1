import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Body = {
  userId: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
};

/**
 * Crea perfil y workshop con service role. Verifica que el usuario exista en auth
 * y que el email del cuerpo coincida con auth.users (sin depender de sesión cliente).
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { success: false, error: 'Configuración del servidor incompleta (SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Solicitud inválida.' }, { status: 400 });
  }

  const { userId, name, email, phone, address } = body;
  if (!userId || !name?.trim() || !email?.trim()) {
    return NextResponse.json({ success: false, error: 'Faltan datos obligatorios.' }, { status: 400 });
  }

  const nombre = name.trim();
  const emailNorm = email.trim().toLowerCase();
  const phoneDigits = (phone ?? '').replace(/\D/g, '');
  if (phoneDigits.length < 8) {
    return NextResponse.json(
      { success: false, error: 'El teléfono debe tener al menos 8 dígitos.' },
      { status: 400 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);

  if (authErr || !authData?.user) {
    return NextResponse.json(
      { success: false, error: 'Usuario no encontrado en el sistema de autenticación.' },
      { status: 404 }
    );
  }

  const authEmail = (authData.user.email ?? '').trim().toLowerCase();
  if (authEmail !== emailNorm) {
    return NextResponse.json({ success: false, error: 'El email no coincide con la cuenta registrada.' }, { status: 403 });
  }

  const { data: existing, error: readErr } = await admin
    .from('profiles')
    .select('id, workshop_id')
    .eq('id', userId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ success: false, error: readErr.message }, { status: 500 });
  }

  if (!existing) {
    const { error: insProf } = await admin.from('profiles').insert({
      id: userId,
      name: nombre,
      role: 'taller',
    });
    if (insProf) {
      return NextResponse.json({ success: false, error: insProf.message }, { status: 500 });
    }
  }

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('workshop_id')
    .eq('id', userId)
    .maybeSingle();

  if (profErr || !profile) {
    return NextResponse.json({ success: false, error: profErr?.message ?? 'Perfil no disponible.' }, { status: 500 });
  }

  if (profile.workshop_id) {
    return NextResponse.json({ success: true });
  }

  const { data: wsRow, error: wsErr } = await admin
    .from('workshops')
    .insert({
      name: nombre,
      contact_name: nombre,
      email: email.trim(),
      phone: phoneDigits,
      address: address?.trim() || null,
    })
    .select('id')
    .single();

  if (wsErr) {
    return NextResponse.json({ success: false, error: wsErr.message }, { status: 500 });
  }

  const wsId = (wsRow as { id: string }).id;

  const { error: updErr } = await admin.from('profiles').update({ workshop_id: wsId }).eq('id', userId);

  if (updErr) {
    return NextResponse.json({ success: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
