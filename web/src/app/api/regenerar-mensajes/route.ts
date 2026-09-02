/**
 * /api/regenerar-mensajes
 * Endpoint para regenerar mensajes de conexión Y comentarios de post de todos los
 * prospectos en estado Pendiente y Comentado con el nuevo prompt anti-IA.
 * Protegido con el mismo CRON_SECRET que el cron diario.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  regenerarMensajesExistentes,
  regenerarComentariosExistentes,
} from '@/lib/engines/personalization';

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
    const [{ regenerados: mensajes }, { regenerados: comentarios }] = await Promise.all([
      regenerarMensajesExistentes(),
      regenerarComentariosExistentes(),
    ]);
    return NextResponse.json({ ok: true, mensajes, comentarios });
  } catch (err) {
    console.error('[regenerar-mensajes] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
