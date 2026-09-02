/**
 * /api/regenerar-mensajes
 * Regenera mensajes de conexión Y comentarios de post en lotes pequeños para
 * no superar el timeout de Vercel (300s). Usa ?limit=N&offset=M para paginar.
 * Protegido con CRON_SECRET bearer token.
 *
 * Ejemplo de uso en bucle:
 *   GET /api/regenerar-mensajes?limit=10&offset=0
 *   GET /api/regenerar-mensajes?limit=10&offset=10
 *   ... hasta que regenerados < limit
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

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '999999', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    const [mensajesResult, comentariosResult] = await Promise.all([
      regenerarMensajesExistentes(limit, offset),
      regenerarComentariosExistentes(limit, offset),
    ]);

    return NextResponse.json({
      ok: true,
      limit,
      offset,
      mensajes: mensajesResult.regenerados,
      comentarios: comentariosResult.regenerados,
      totalMensajes: mensajesResult.total,
      totalComentarios: comentariosResult.total,
    });
  } catch (err) {
    console.error('[regenerar-mensajes] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
