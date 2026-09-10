/**
 * Script para ejecutar manualmente la rutina diaria completa del motor.
 * Uso: npx tsx --env-file=.env scripts/runDaily.ts
 */
import { ejecutarRutinaDiaria } from '../src/lib/engines/daily';
import { neon } from '@neondatabase/serverless';

async function main() {
  console.log('Iniciando ejecución manual del motor diario...');
  const resultado = await ejecutarRutinaDiaria('http://localhost:3000');
  console.log('Resultado del motor:', JSON.stringify(resultado, null, 2));

  const sql = neon(process.env.POSTGRES_URL!);
  const pendientes = await sql`SELECT COUNT(*) as n FROM prospectos WHERE estado = 'Pendiente'`;
  const reserva = await sql`SELECT COUNT(*) as n FROM prospectos WHERE estado = 'Reserva'`;
  const conPost = await sql`SELECT COUNT(*) as n FROM prospectos WHERE estado = 'Pendiente' AND ultimo_post_texto IS NOT NULL AND LENGTH(ultimo_post_texto) > 50`;
  const sinPost = await sql`SELECT COUNT(*) as n FROM prospectos WHERE estado = 'Pendiente' AND (ultimo_post_texto IS NULL OR LENGTH(ultimo_post_texto) <= 50)`;

  console.log('\n--- Estado DB tras la ejecución ---');
  console.log('Leads pendientes (hoy):', pendientes[0].n);
  console.log('Leads con post:', conPost[0].n);
  console.log('Leads sin post:', sinPost[0].n);
  console.log('Leads en reserva:', reserva[0].n);
}

main().catch((e) => {
  console.error('ERROR FATAL:', e.message || e);
  process.exit(1);
});
