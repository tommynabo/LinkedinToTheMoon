/**
 * middleware.ts
 * Protege todo el dashboard con Basic Auth. /api/cron/* queda excluido (usa su propio
 * bearer token, ver route.ts) porque Vercel Cron no puede enviar credenciales Basic.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { credencialesConfiguradas, esBasicAuthValido } from '@/lib/auth';

export function middleware(request: NextRequest) {
  if (!credencialesConfiguradas()) {
    return new NextResponse(
      'Faltan DASHBOARD_USER / DASHBOARD_PASSWORD en las variables de entorno de Vercel.',
      { status: 500 }
    );
  }

  if (esBasicAuthValido(request.headers.get('authorization'))) {
    return NextResponse.next();
  }

  return new NextResponse('Autenticación requerida', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="LinkedIn to the Moon"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron).*)'],
};
