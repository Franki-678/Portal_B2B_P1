import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Body = {
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
};

/**
 * Completa perfil + workshop tras el registro usando service role (sin sesión en el cliente).
 * Requiere Authorization: Bearer <access_token> del signUp para verificar identidad.
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Configuración del servidor incompleta (falta SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json(
      { error: 'Token de sesión requerido para completar el registro.' },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  const { userId, name, email } = body;
  if (!userId || !name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Faltan datos obligatorios.' }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await admin.auth.getUser(token);

  if (authErr || !user) {
    return NextResponse.json({ error: 'Token inválido o expirado.' }, { status: 401 });
  }

  if (user.id !== userId) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const nombreTaller = name.trim();
  const emailTrim = email.trim();
  const phone = body.phone ?? null;
  const address = body.address ?? null;

  const { data: profile, error: profReadErr } = await admin
    .from('profiles')
    .select('id, workshop_id')
    .eq('id', userId)
    .maybeSingle();

  if (profReadErr) {
    return NextResponse.json({ error: profReadErr.message }, { status: 500 });
  }

  if (profile?.workshop_id) {
    return NextResponse.json({ ok: true });
  }

  if (!profile) {
    const { data: wsRow, error: wsErr } = await admin
      .from('workshops')
      .insert({
        name: nombreTaller,
        contact_name: nombreTaller,
        email: emailTrim,
        phone,
        address,
      })
      .select('id')
      .single();

    if (wsErr) {
      return NextResponse.json({ error: wsErr.message }, { status: 500 });
    }

    const wsId = (wsRow as { id: string }).id;

    const { error: insProfErr } = await admin.from('profiles').insert({
      id: userId,
      name: nombreTaller,
      role: 'taller',
      workshop_id: wsId,
    });

    if (insProfErr) {
      return NextResponse.json({ error: insProfErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const { data: wsRow, error: wsErr } = await admin
    .from('workshops')
    .insert({
      name: nombreTaller,
      contact_name: nombreTaller,
      email: emailTrim,
      phone,
      address,
    })
    .select('id')
    .single();

  if (wsErr) {
    return NextResponse.json({ error: wsErr.message }, { status: 500 });
  }

  const wsId = (wsRow as { id: string }).id;

  const { error: updErr } = await admin.from('profiles').update({ workshop_id: wsId }).eq('id', userId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
