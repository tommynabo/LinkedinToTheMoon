/**
 * run_prospecting_icp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline diario completo: busca prospectos ICP + genera mensajes y comentarios.
 *
 * ESTRATEGIA DE MÍNIMO COSTE:
 * 1. Lee cuántos pendientes hay ya hoy → si ya hay 25, termina sin gastar créditos.
 * 2. Itera por las keywords ICP UNA A UNA (sin OR compuesto) hasta llenar el cupo.
 * 3. Para en cuanto llega a 25 (cortafuegos de créditos).
 * 4. Genera mensajes de conexión + comentarios de post con Claude para todos los nuevos.
 *
 * KEYWORDS: se rotan empezando desde la que le toca al día de hoy.
 * Si una keyword no da resultados válidos, se prueba la siguiente.
 *
 * USO:
 *   node --env-file=.env --env-file=.env.local node_modules/tsx/dist/cli.mjs run_prospecting_icp.ts
 */

import { buscarProspectosDeHoy } from './src/lib/engines/prospecting';
import { personalizarMensajesYAudios } from './src/lib/engines/personalization';
import { ONLINE_SEARCH_KEYWORDS } from './src/lib/online';
import { PAISES_BUSQUEDA } from './src/lib/geography';
import { neon } from '@neondatabase/serverless';

// ─── Configuración ────────────────────────────────────────────────────────────

const OBJETIVO_DIARIO = 25;

// Países a rotar en las búsquedas (España siempre va primero para sesgar el pool)
const UBICACIONES = [
  'Spain',
  'United Kingdom',
  'United States',
];

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
  const actuales = await pendientesHoy();
  console.log(`\n🎯 Objetivo: ${OBJETIVO_DIARIO} prospectos hoy | Actuales: ${actuales}`);

  if (actuales >= OBJETIVO_DIARIO) {
    console.log('✅ Ya se alcanzó el cupo diario. No se consume Apify.');
    process.exit(0);
  }

  const dayOfYear = getDayOfYear();
  // Empezar por la keyword del día y rotar hacia adelante
  const keywordStartIndex = dayOfYear % ONLINE_SEARCH_KEYWORDS.length;
  const keywordsOrdenadas = [
    ...ONLINE_SEARCH_KEYWORDS.slice(keywordStartIndex),
    ...ONLINE_SEARCH_KEYWORDS.slice(0, keywordStartIndex),
  ];

  let totalPendientes = actuales;
  let ronda = 0;
  let sinResultadosConsecutivos = 0;

  for (const keyword of keywordsOrdenadas) {
    if (totalPendientes >= OBJETIVO_DIARIO) break;
    // Si 4 rondas seguidas sin resultados, paramos (evitar gastar créditos en vano)
    if (sinResultadosConsecutivos >= 4) {
      console.log('\n⚠️  4 búsquedas consecutivas sin resultados válidos. Parando para ahorrar créditos.');
      break;
    }

    ronda++;
    const faltantes = OBJETIVO_DIARIO - totalPendientes;
    // Alternar ubicación: España para rondas pares, UK/US para impares
    const ubicacion = UBICACIONES[ronda % UBICACIONES.length];

    console.log(`\n🔄 Ronda ${ronda} — keyword: "${keyword}" | ubicación: ${ubicacion} | faltan: ${faltantes}`);

    // Inyectar keyword y ubicación como env vars para que buscarProspectosDeHoy() las use
    process.env.APIFY_SEARCH_QUERY = keyword;
    process.env.APIFY_LOCATIONS = ubicacion;

    try {
      const resultado = await buscarProspectosDeHoy(faltantes);
      console.log(`  ↳ Nuevos: ${resultado.nuevos} | Descartados: ${resultado.descartadosPorValidacion} | España: ${resultado.deEspana} | Con post: ${resultado.conPost}`);

      if (resultado.nuevos > 0) {
        sinResultadosConsecutivos = 0;
        totalPendientes = await pendientesHoy();
        console.log(`  📊 Total pendientes hoy: ${totalPendientes}/${OBJETIVO_DIARIO}`);
      } else {
        sinResultadosConsecutivos++;
      }
    } catch (e: any) {
      // Detectar error de créditos agotados (HTTP 402)
      if (e.message?.includes('HTTP 402') || e.message?.includes('not-enough-usage')) {
        console.error('\n❌ CRÉDITOS APIFY AGOTADOS. Añade saldo en https://console.apify.com/billing');
        break;
      }
      console.error(`  ❌ Error en ronda ${ronda}: ${e.message}`);
      sinResultadosConsecutivos++;
    }
  }

  // Resultado final
  const finalCount = await pendientesHoy();
  console.log(`\n🏁 Búsqueda ICP completada. Prospectos pendientes hoy: ${finalCount}/${OBJETIVO_DIARIO}`);

  if (finalCount === 0) {
    console.log('⚠️  No se encontraron prospectos. Verifica los créditos de Apify y las keywords.');
    process.exit(0);
  }

  // ─── Paso 2: Generar mensajes y comentarios con Claude ───────────────────────
  console.log('\n🤖 Generando mensajes de conexión y comentarios con Claude...\n');
  try {
    const resultado = await personalizarMensajesYAudios();
    console.log(`\n✅ Personalización completada:`);
    console.log(`   Mensajes generados:   ${resultado.generados}`);
    console.log(`   Con comentario post:  ${resultado.conComentario}`);
    if (!resultado.audioDisponible) {
      console.log(`   Audio:                no disponible (falta token ElevenLabs)`);
    }
  } catch (e: any) {
    console.error(`❌ Error en personalización: ${e.message}`);
  }

  console.log('\n🚀 Pipeline diario completado.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error fatal:', e.message);
  process.exit(1);
});
