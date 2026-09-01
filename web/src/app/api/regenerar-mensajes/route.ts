/**
 * /api/regenerar-mensajes
 * Endpoint temporal para regenerar todos los mensajes de conexión de prospectos
 * en estado Pendiente y Comentado con el nuevo formato broetry.
 * Protegido con el mismo CRON_SECRET que el cron diario.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { regenerarMensajesExistentes } from '@/lib/engines/personalization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { regenerados } = await regenerarMensajesExistentes();
    return NextResponse.json({ ok: true, regenerados });
  } catch (err) {
    console.error('[regenerar-mensajes] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
