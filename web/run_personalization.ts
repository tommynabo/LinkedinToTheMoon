/**
 * run_personalization.ts
 * Genera los mensajes de conexión y comentarios de post para todos los
 * prospectos Pendiente que aún no los tienen.
 */
import { personalizarMensajesYAudios } from './src/lib/engines/personalization';
import { ensureSchema, sql } from './src/lib/db';

async function main() {
  await ensureSchema();

  // Cuántos pendientes hay sin mensaje
  const { rows: sinMensaje } = await sql`
    SELECT COUNT(*) as n FROM prospectos 
    WHERE estado = 'Pendiente' AND (texto_mensaje IS NULL OR texto_mensaje = '')
  `;
  const { rows: sinComentario } = await sql`
    SELECT COUNT(*) as n FROM prospectos 
    WHERE estado = 'Pendiente' 
      AND (comentario_post IS NULL OR comentario_post = '')
      AND ultimo_post_texto IS NOT NULL 
      AND LENGTH(ultimo_post_texto) >= 50
  `;

  console.log(`\n📋 Prospectos sin mensaje:    ${sinMensaje[0].n}`);
  console.log(`📋 Prospectos sin comentario: ${sinComentario[0].n}`);
  console.log('\n🤖 Generando mensajes y comentarios con Claude...\n');

  const resultado = await personalizarMensajesYAudios();

  console.log(`\n✅ Resultado:`);
  console.log(`   Mensajes generados:   ${resultado.generados}`);
  console.log(`   Con comentario post:  ${resultado.conComentario}`);
  console.log(`   Audio disponible:     ${resultado.audioDisponible}`);

  process.exit(0);
}

main().catch(e => { console.error('❌ Error fatal:', e.message); process.exit(1); });
