/**
 * POST /api/create-vendor
 *
 * Flujo "Crear o Restaurar":
 *
 *  Caso 1 — Vendedor activo (deleted_at IS NULL):
 *    → 409 con mensaje de negocio claro.
 *
 *  Caso 2 — Vendedor dado de baja (deleted_at IS NOT NULL):
 *    → A) Actualiza contraseña en auth.admin.updateUserById
 *    → B) Limpia deleted_at y activa must_change_password en profiles
 *    → C) 200 con restored: true
 *
 *  Caso 3 — Usuario nuevo (no existe en auth.users):
 *    → Flujo normal: createUser + upsert perfil
 *
 *  Caso 4 — Auth user sin perfil (estado inconsistente):
 *    → Resetea contraseña + crea el perfil faltante
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

type SuccessPayload = {
  success: true;
  restored?: boolean;
  userId: string;
  message: string;
};

type ErrorPayload = {
  error: string;
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse<SuccessPayload | ErrorPayload>> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY no está configurado en el servidor.' },
      { status: 503 }
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { name?: string; email?: string; phone?: string; tempPassword?: string };
  try {
    body = (await request.json()) as typeof body;
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

  const normalizedEmail    = email.trim().toLowerCase();
  const normalizedName     = name.trim();
  const normalizedPhone    = phone?.trim() || null;
  const normalizedPassword = tempPassword.trim();

  // ── Admin client (bypasses RLS) ────────────────────────────────────────────
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Pre-check: ¿Ya existe un usuario en auth.users con este email? ─────────
  // La función get_auth_user_id_by_email lee auth.users via SECURITY DEFINER.
  const { data: lookupData, error: lookupError } = await supabaseAdmin
    .rpc('get_auth_user_id_by_email', { p_email: normalizedEmail });

  if (lookupError) {
    console.error('[create-vendor] lookup RPC error:', lookupError);
    return NextResponse.json({ error: 'Error al verificar el email en la base de datos.' }, { status: 500 });
  }

  const existingAuthId = lookupData as string | null;

  // ── Auth user ya existe → determinar estado del perfil ────────────────────
  if (existingAuthId) {
    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', existingAuthId)
      .maybeSingle();

    if (profileLookupError) {
      console.error('[create-vendor] profile lookup error:', profileLookupError);
      return NextResponse.json({ error: profileLookupError.message }, { status: 500 });
    }

    // ── Caso 1: Vendedor activo ────────────────────────────────────────────
    if (existingProfile && existingProfile.deleted_at === null) {
      return NextResponse.json(
        { error: 'Este correo electrónico ya pertenece a un vendedor activo.' },
        { status: 409 }
      );
    }

    // ── Caso 2: Vendedor dado de baja → restaurar ──────────────────────────
    if (existingProfile && existingProfile.deleted_at !== null) {
      // Paso A: Actualizar contraseña en Supabase Auth
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthId,
        { password: normalizedPassword }
      );
      if (pwError) {
        console.error('[create-vendor] updateUserById error:', pwError);
        return NextResponse.json(
          { error: `No se pudo actualizar la contraseña: ${pwError.message}` },
          { status: 500 }
        );
      }

      // Paso B: Reactivar perfil — limpiar deleted_at y refrescar datos
      const { error: restoreError } = await supabaseAdmin
        .from('profiles')
        .update({
          name:                normalizedName,
          phone:               normalizedPhone,
          email:               normalizedEmail,
          deleted_at:          null,
          must_change_password: true,
        })
        .eq('id', existingAuthId);

      if (restoreError) {
        console.error('[create-vendor] profile restore error:', restoreError);
        return NextResponse.json({ error: restoreError.message }, { status: 500 });
      }

      // Paso C: Éxito — vendedor reactivado
      return NextResponse.json({
        success:  true,
        restored: true,
        userId:   existingAuthId,
        message:  `Vendedor "${normalizedName}" reactivado correctamente. Se le solicitará cambiar la contraseña en su próximo acceso.`,
      });
    }

    // ── Caso 4 (datos inconsistentes): auth user sin perfil ───────────────
    // No debería ocurrir en condiciones normales; lo recuperamos silenciosamente.
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
      existingAuthId,
      { password: normalizedPassword }
    );
    if (pwError) {
      return NextResponse.json({ error: pwError.message }, { status: 500 });
    }

    const { error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id:                  existingAuthId,
        name:                normalizedName,
        role:                'vendedor',
        phone:               normalizedPhone,
        email:               normalizedEmail,
        must_change_password: true,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId:  existingAuthId,
      message: `Vendedor "${normalizedName}" creado. Puede iniciar sesión con la contraseña temporal.`,
    });
  }

  // ── Caso 3: Usuario completamente nuevo ───────────────────────────────────
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email:          normalizedEmail,
    password:       normalizedPassword,
    email_confirm:  true,
    user_metadata:  { name: normalizedName, role: 'vendedor' },
  });

  if (authError) {
    console.error('[create-vendor] createUser error:', authError);
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const userId = authData.user.id;

  // Incluimos email en el perfil para que futuras búsquedas por email funcionen
  // incluso antes de que el vendedor inicie sesión.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id:                  userId,
      name:                normalizedName,
      role:                'vendedor',
      phone:               normalizedPhone,
      email:               normalizedEmail,
      must_change_password: true,
    });

  if (profileError) {
    // Revertir auth user si el perfil falla
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(e => {
      console.error('[create-vendor] rollback deleteUser error:', e);
    });
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    userId,
    message: `Vendedor "${normalizedName}" creado. Puede iniciar sesión con la contraseña temporal. Se le solicitará cambiarla en su primer acceso.`,
  });
}
