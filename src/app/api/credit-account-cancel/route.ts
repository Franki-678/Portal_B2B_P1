/**
 * POST /api/credit-account-cancel
 * Cancela una solicitud CC pendiente y notifica a Telegram.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';
import { sendToGroup }               from '@/lib/telegram/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  ) as any;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = serviceClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { requestId, orderId } = await req.json().catch(() => ({}));
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

  // Verificar que la solicitud pertenece al usuario (via workshop_id del perfil)
  const { data: profile } = await sb.from('profiles').select('workshop_id, name').eq('id', user.id).single();
  const { data: req_ }    = await sb
    .from('credit_account_requests')
    .select('id, workshop_id, requested_amount, workshops(name), orders(workshop_order_number, workshops(taller_number))')
    .eq('id', requestId)
    .eq('status', 'pending')
    .single();

  if (!req_ || req_.workshop_id !== profile?.workshop_id) {
    return NextResponse.json({ error: 'No autorizado o solicitud no encontrada' }, { status: 403 });
  }

  // Eliminar la solicitud
  await sb.from('credit_account_requests').delete().eq('id', requestId);

  // Notificar Telegram
  try {
    const ws   = req_.workshops as any;
    const ord  = req_.orders as any;
    const tNum = ord?.workshops?.taller_number;
    const oNum = ord?.workshop_order_number;
    const label = tNum != null && oNum != null
      ? `${String(tNum).padStart(2,'0')}-PED-${String(oNum).padStart(4,'0')}`
      : oNum != null ? `PED-${String(oNum).padStart(4,'0')}` : (orderId ?? '').slice(0,8).toUpperCase();

    await sendToGroup([
      `↩️ <b>[SOLICITUD CC CANCELADA]</b>`,
      ``,
      `🏭 <b>Taller:</b> ${ws?.name ?? 'Taller'}`,
      `📦 <b>Pedido:</b> #${label}`,
      `ℹ️ El taller decidió cambiar el método de pago antes de que confirmes.`,
    ].join('\n'));
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true });
}
