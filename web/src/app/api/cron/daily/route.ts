/**
 * /api/cron/daily
 * Único endpoint que invoca Vercel Cron (ver vercel.json). Protegido con CRON_SECRET: Vercel
 * añade automáticamente la cabecera "Authorization: Bearer <CRON_SECRET>" en la petición si
 * defines esa variable de entorno (ver https://vercel.com/docs/cron-jobs/manage-cron-jobs).
 * middleware.ts excluye esta ruta de la Basic Auth del dashboard.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ejecutarRutinaDiaria } from '@/lib/engines/daily';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const resumen = await ejecutarRutinaDiaria(request.nextUrl.origin);
  return NextResponse.json(resumen);
}
