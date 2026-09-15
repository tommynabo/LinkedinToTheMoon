/**
 * run_prospecting_extra.ts
 * Lanza búsquedas adicionales con offsets de día distintos para cubrir
 * keywords no usadas en la ronda principal y llegar al objetivo de 25 prospectos.
 * Uso: npx tsx --env-file=.env run_prospecting_extra.ts
 */
import { buscarProspectosDeHoy } from './src/lib/engines/prospecting';
import { neon } from '@neondatabase/serverless';

async function pendientesHoy(): Promise<number> {
  const sql = neon(process.env.POSTGRES_URL!);
  const rows = await sql`SELECT COUNT(*) as n FROM prospectos WHERE estado = 'Pendiente' AND fecha_extraccion = CURRENT_DATE`;
  return Number(rows[0].n);
}

async function main() {
  const OBJETIVO = 25;
  const MAX_RONDAS = 4;

  let actuales = await pendientesHoy();
  console.log(`\n🎯 Objetivo: ${OBJETIVO} prospectos hoy | Actuales: ${actuales}`);

  for (let ronda = 1; ronda <= MAX_RONDAS && actuales < OBJETIVO; ronda++) {
    const faltantes = OBJETIVO - actuales;
    console.log(`\n🔄 Ronda extra ${ronda} — faltan ${faltantes} prospectos...`);

    // Sobreescribimos DAY_OFFSET para que el motor use keywords distintas cada ronda
    // La función de rotación en apify.ts usa dayOfYear % keywords.length,
    // así que sumar +4 por ronda garantiza keywords distintas (hay 8 disponibles).
    const offsetDias = ronda * 4;
    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    // Simulamos que estamos en un día distinto inyectando una fecha desplazada en el env
    const fakeDate = new Date(now);
    fakeDate.setDate(fakeDate.getDate() + offsetDias);
    // Patch temporal: monkey-patch Date para que apify.ts lea el offset
    const RealDate = Date;
    (global as any).Date = class extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fakeDate.getTime());
        } else {
          // @ts-ignore
          super(...args);
        }
      }
      static now() { return fakeDate.getTime(); }
    };
    (global as any).Date.UTC = RealDate.UTC;
    (global as any).Date.parse = RealDate.parse;

    try {
      const resultado = await buscarProspectosDeHoy(faltantes);
      console.log(`✅ Ronda ${ronda} resultado:`, JSON.stringify(resultado, null, 2));
    } catch (e: any) {
      console.error(`❌ Error en ronda ${ronda}:`, e.message);
    } finally {
      (global as any).Date = RealDate;
    }

    actuales = await pendientesHoy();
    console.log(`📊 Total pendientes hoy tras ronda ${ronda}: ${actuales}/${OBJETIVO}`);
  }

  console.log(`\n🏁 Búsqueda completada. Prospectos pendientes hoy: ${actuales}/${OBJETIVO}`);
  process.exit(0);
}

main().catch(e => { console.error('❌ Error fatal:', e.message); process.exit(1); });
