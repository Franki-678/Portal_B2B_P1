import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY no está configurado en el servidor.' },
      { status: 503 }
    );
  }

  let body: { name?: string; email?: string; phone?: string; tempPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { name, email, phone, tempPassword } = body;
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Nombre y email son requeridos.' }, { status: 400 });
  }
  if (!tempPassword?.trim() || tempPassword.trim().length < 8) {
    return NextResponse.json(
      { error: 'La contraseña temporal debe tener al menos 8 caracteres.' },
      { status: 400 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Crear usuario con contraseña temporal ya seteada (confirmado directo)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password: tempPassword.trim(),
    email_confirm: true,
    user_metadata: { name: name.trim(), role: 'vendedor' },
  });

  if (authError) {
    const isDuplicate = authError.message?.toLowerCase().includes('already');
    return NextResponse.json(
      { error: isDuplicate ? 'Ya existe un usuario con ese email.' : authError.message },
      { status: isDuplicate ? 409 : 400 }
    );
  }

  const userId = authData.user.id;

  // Crear/actualizar perfil con must_change_password = true
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      name: name.trim(),
      role: 'vendedor',
      phone: phone?.trim() || null,
      must_change_password: true,
    });

  if (profileError) {
    // Revertir si el perfil falla
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    userId,
    message: `Vendedor "${name.trim()}" creado. Puede iniciar sesión con la contraseña temporal. Se le solicitará cambiarla en su primer acceso.`,
  });
}
