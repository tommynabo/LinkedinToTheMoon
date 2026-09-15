/**
 * run_prospecting_icp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline diario completo: busca prospectos ICP + genera mensajes y comentarios.
 *
 * ESTRATEGIA:
 * - Para cada keyword ICP, lanza DOS búsquedas en paralelo: España + UK/US
 * - Esto duplica el volumen de candidatos por keyword sin duplicar créditos
 *   porque muchas keywords tienen poco volumen en un solo país
 * - Para en cuanto llega a 25 leads (cortafuegos de créditos)
 * - Después genera mensajes + comentarios con Claude
 *
 * USO:
 *   node --env-file=.env --env-file=.env.local node_modules/tsx/dist/cli.mjs run_prospecting_icp.ts
 */

import { buscarProspectosDeHoy } from './src/lib/engines/prospecting';
import { personalizarMensajesYAudios } from './src/lib/engines/personalization';
import { ONLINE_SEARCH_KEYWORDS } from './src/lib/online';
import { neon } from '@neondatabase/serverless';

// ─── Configuración ────────────────────────────────────────────────────────────

const OBJETIVO_DIARIO = 25;
const MAX_RONDAS_SIN_RESULTADO = 6; // Para si 6 keywords seguidas dan 0

// Para cada keyword buscamos en TODOS estos países secuencialmente
// España primero (ICP principal), luego UK y US como complemento
const UBICACIONES_POR_ORDEN = ['Spain', 'United Kingdom', 'United States'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pendientesHoy(): Promise<number> {
  const sql = neon(process.env.POSTGRES_URL!);
  const rows = await sql`
    SELECT COUNT(*) as n FROM prospectos
    WHERE estado = 'Pendiente' AND fecha_extraccion = CURRENT_DATE
  `;
  return Number(rows[0].n);
}

function getDayOfYear(): number {
  const now = new Date();
  return Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24
  );
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

async function main() {
  let totalPendientes = await pendientesHoy();
  console.log(`\n🎯 Objetivo: ${OBJETIVO_DIARIO} prospectos hoy | Actuales: ${totalPendientes}`);

  if (totalPendientes >= OBJETIVO_DIARIO) {
    console.log('✅ Ya se alcanzó el cupo diario. No se consume Apify.');
    process.exit(0);
  }

  const dayOfYear = getDayOfYear();
  // Empezar por la keyword del día para variar cada día
  const keywordStartIndex = dayOfYear % ONLINE_SEARCH_KEYWORDS.length;
  const keywordsOrdenadas = [
    ...ONLINE_SEARCH_KEYWORDS.slice(keywordStartIndex),
    ...ONLINE_SEARCH_KEYWORDS.slice(0, keywordStartIndex),
    // Segunda pasada por las mismas keywords en caso de que no alcancemos 25
    ...ONLINE_SEARCH_KEYWORDS.slice(keywordStartIndex),
    ...ONLINE_SEARCH_KEYWORDS.slice(0, keywordStartIndex),
  ];

  let ronda = 0;
  let sinResultadosConsecutivos = 0;
  let ubicacionIdx = 0;

  for (const keyword of keywordsOrdenadas) {
    if (totalPendientes >= OBJETIVO_DIARIO) break;
    if (sinResultadosConsecutivos >= MAX_RONDAS_SIN_RESULTADO) {
      console.log(`\n⚠️  ${MAX_RONDAS_SIN_RESULTADO} keywords seguidas sin resultados válidos. Parando.`);
      break;
    }

    ronda++;
    const faltantes = OBJETIVO_DIARIO - totalPendientes;

    // Alternar ubicación: cada keyword prueba un país diferente en orden
    const ubicacion = UBICACIONES_POR_ORDEN[ubicacionIdx % UBICACIONES_POR_ORDEN.length];
    ubicacionIdx++;

    console.log(`\n🔄 Ronda ${ronda} — "${keyword}" | ${ubicacion} | faltan: ${faltantes}`);

    process.env.APIFY_SEARCH_QUERY = keyword;
    process.env.APIFY_LOCATIONS = ubicacion;

    try {
      const resultado = await buscarProspectosDeHoy(faltantes);
      const msg = `  ↳ Nuevos: ${resultado.nuevos} | Descartados: ${resultado.descartadosPorValidacion} | España: ${resultado.deEspana} | Con post: ${resultado.conPost}`;
      console.log(msg);

      if (resultado.nuevos > 0) {
        sinResultadosConsecutivos = 0;
        totalPendientes = await pendientesHoy();
        console.log(`  📊 Total: ${totalPendientes}/${OBJETIVO_DIARIO}`);
      } else {
        sinResultadosConsecutivos++;
      }
    } catch (e: any) {
      if (e.message?.includes('HTTP 402') || e.message?.includes('not-enough-usage')) {
        console.error('\n❌ CRÉDITOS APIFY AGOTADOS. Añade saldo en https://console.apify.com/billing');
        break;
      }
      console.error(`  ❌ Error: ${e.message}`);
      sinResultadosConsecutivos++;
    }
  }

  const finalCount = await pendientesHoy();
  console.log(`\n🏁 Búsqueda completada. Prospectos pendientes: ${finalCount}/${OBJETIVO_DIARIO}`);

  if (finalCount === 0) {
    console.log('⚠️  Sin prospectos. Verifica créditos Apify y keywords.');
    process.exit(0);
  }

  // ─── Generar mensajes y comentarios con Claude ────────────────────────────
  console.log('\n🤖 Generando mensajes de conexión y comentarios con Claude...\n');
  try {
    const resultado = await personalizarMensajesYAudios();
    console.log(`\n✅ Personalización:`);
    console.log(`   Mensajes:   ${resultado.generados}`);
    console.log(`   Comentarios: ${resultado.conComentario}`);
  } catch (e: any) {
    console.error(`❌ Error en personalización: ${e.message}`);
  }

  console.log('\n🚀 Pipeline completado.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error fatal:', e.message);
  process.exit(1);
});
