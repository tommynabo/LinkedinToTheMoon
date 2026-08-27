/**
 * engines/daily.ts
 * Orquestador de la rutina diaria: archiva lo procesado, corre los 3 motores en orden,
 * registra el resultado en "cron_runs" y envía el correo-resumen. Lo usan tanto el cron
 * (/api/cron/daily) como el botón "Ejecutar ahora" del dashboard.
 */
import { ensureSchema, sql } from '../db';
import { enviarResumenPorCorreo } from '../email';
import { archivarProspectosProcesados, buscarProspectosDeHoy } from './prospecting';
import { generarPostDelDia } from './content';
import { personalizarMensajesYAudios } from './personalization';

export interface ResumenRutina {
  lineas: string[];
  huboError: boolean;
}

export async function ejecutarRutinaDiaria(urlDashboard: string): Promise<ResumenRutina> {
  await ensureSchema();

  const lineas: string[] = [];
  let huboError = false;

  try {
    const archivados = await archivarProspectosProcesados();
    if (archivados > 0) {
      lineas.push(`🗂️ ${archivados} prospecto(s) del día anterior archivados en el CRM.`);
    }
  } catch (err) {
    huboError = true;
    lineas.push(`❌ Archivado de CRM falló: ${(err as Error).message}`);
  }

  try {
    const post = await generarPostDelDia();
    lineas.push(`✅ Post del día generado (pilar: ${post.pilar})${post.conImagen ? ' con imagen de portada' : ''}.`);
  } catch (err) {
    huboError = true;
    lineas.push(`❌ Motor de contenido falló: ${(err as Error).message}`);
  }

  try {
    const prospeccion = await buscarProspectosDeHoy();
    if (prospeccion.fuente === 'ninguna') {
      lineas.push('⚠️ No se encontraron prospectos nuevos (configura Apify o pega un export en /import).');
    } else {
      lineas.push(
        `✅ ${prospeccion.nuevos} prospectos nuevos (fuente: ${prospeccion.fuente}, ${prospeccion.deEspana} de España, ${prospeccion.conPost} con post, ${prospeccion.descartadosPorValidacion} descartados por validación).`
      );
    }
  } catch (err) {
    huboError = true;
    lineas.push(`❌ Motor de prospección falló: ${(err as Error).message}`);
  }

  try {
    const personalizacion = await personalizarMensajesYAudios();
    lineas.push(
      `✅ ${personalizacion.generados} mensaje(s)${personalizacion.audioDisponible ? ' + audio(s)' : ' (sin audio: falta ElevenLabs)'} personalizados, ${personalizacion.conComentario} con comentario de post.`
    );
  } catch (err) {
    huboError = true;
    lineas.push(`❌ Motor de personalización falló: ${(err as Error).message}`);
  }

  await sql`INSERT INTO cron_runs (resumen, hubo_error) VALUES (${lineas.join('\n')}, ${huboError})`;
  await enviarResumenPorCorreo(lineas, huboError, urlDashboard);

  return { lineas, huboError };
}
