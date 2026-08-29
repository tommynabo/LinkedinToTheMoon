/**
 * engines/prospecting.ts
 * Motor ② — busca y cualifica al ICP. Fuente automática: Apify (si hay token configurado).
 * Fallback manual: filas pegadas en la página /import (tabla "prospectos_import"). Siempre
 * valida, puntúa y deduplica contra el histórico (Prospectos + CRM) antes de escribir.
 */
import { ensureSchema, sql } from '../db';
import { PROSPECTOS_POR_DIA, MINIMO_ESPANA_POR_DIA } from '../config';
import { buscarProspectosConApify, buscarUltimosPosts, tieneApifyConfigurado } from '../apify';
import { detectarIdiomaAprox, esDeEspana } from '../idioma';
import { calcularScore, getUrlsConocidas } from '../scoring';
import { esProspectoValido, normalizeLinkedInUrl } from '../validation';
import type { ProspectoCrudo } from '../types';

// Longitud mínima del texto de un post para que valga para comentar.
// Un "tema" de 2-3 palabras del primer scraper NO cuenta como post real.
const MIN_POST_CHARS = 50;

export interface ResultadoProspeccion {
  nuevos: number;
  fuente: 'Apify' | 'Import manual' | 'ninguna';
  descartadosPorValidacion: number;
  deEspana: number;
  conPost: number;       // ← nuevo: cuántos de los guardados tienen post real
  sinPost: number;       // ← nuevo: cuántos se guardaron sin post (no debería haber)
}

export async function buscarProspectosDeHoy(): Promise<ResultadoProspeccion> {
  await ensureSchema();

  let candidatos: ProspectoCrudo[] = [];
  let fuente: ResultadoProspeccion['fuente'] = 'ninguna';

  if (tieneApifyConfigurado()) {
    candidatos = await buscarProspectosConApify();
    if (candidatos.length > 0) fuente = 'Apify';
  }

  if (candidatos.length === 0) {
    candidatos = await leerProspectosImportados();
    if (candidatos.length > 0) fuente = 'Import manual';
  }

  if (candidatos.length === 0) {
    return { nuevos: 0, fuente: 'ninguna', descartadosPorValidacion: 0, deEspana: 0, conPost: 0, sinPost: 0 };
  }

  const validos = candidatos.filter(esProspectoValido);
  const descartadosPorValidacion = candidatos.length - validos.length;
  console.log(`[Prospecting] Candidatos crudos: ${candidatos.length}, válidos: ${validos.length}, descartados: ${descartadosPorValidacion}`);

  const urlsConocidas = await getUrlsConocidas();
  const candidatosClasificados = validos
    .filter((p) => !urlsConocidas.has(normalizeLinkedInUrl(p.url)))
    .map((p) => ({
      prospecto: p,
      score: calcularScore(p),
      idioma: detectarIdiomaAprox(`${p.cargo} ${p.bio}`),
      esEspana: esDeEspana(p.url, `${p.cargo} ${p.bio}`),
      tienePostReal: false,   // ← flag explícito, se actualiza tras el scraper de posts
    }))
    // Exclusión total de portugués/brasileño, pedido explícito del ICP.
    .filter((c) => c.idioma !== 'pt');

  console.log(`[Prospecting] Tras deduplicar y filtrar PT: ${candidatosClasificados.length} candidatos`);

  const deEspanaAll = candidatosClasificados.filter((c) => c.esEspana).sort((a, b) => b.score - a.score);
  const restoAll    = candidatosClasificados.filter((c) => !c.esEspana).sort((a, b) => b.score - a.score);

  let ultimosPosts = new Map<string, { texto: string; url: string; fecha: string | null }>();

  const haceUnMes = new Date();
  haceUnMes.setMonth(haceUnMes.getMonth() - 1);
  const unMesMs = haceUnMes.getTime();

  function esPostReciente(fechaStr: string | null | undefined): boolean {
    if (!fechaStr) return true;
    const fecha = new Date(fechaStr).getTime();
    if (Number.isNaN(fecha)) return true;
    return fecha >= unMesMs;
  }

  function esTextoPostValido(texto: string | null | undefined): boolean {
    return Boolean(texto && texto.trim().length >= MIN_POST_CHARS);
  }

  async function procesarPostParaChunk(chunk: typeof candidatosClasificados) {
    if (chunk.length === 0) return [];
    
    if (fuente === 'Apify') {
      const urlsFaltantes = chunk.filter(c => !c.prospecto.vieneDePost).map(c => c.prospecto.url);
      if (urlsFaltantes.length > 0) {
        console.log(`[Prospecting] Buscando posts para lote de ${urlsFaltantes.length} perfiles...`);
        const resultado = await buscarUltimosPosts(urlsFaltantes);
        for (const [key, val] of resultado.entries()) {
          ultimosPosts.set(key, val);
        }
      }
    }
    
    const validos = [];
    for (const c of chunk) {
      const urlNorm = normalizeLinkedInUrl(c.prospecto.url);
      const postScraper = ultimosPosts.get(urlNorm);
      const textoPost = postScraper?.texto?.trim() || c.prospecto.ultimoPostTema?.trim() || null;
      const fechaPost  = postScraper?.fecha || c.prospecto.ultimoPostFecha || null;
      
      if (esTextoPostValido(textoPost) && esPostReciente(fechaPost)) {
        c.tienePostReal = true;
        c.score += 1000;
        validos.push(c);
      }
    }
    return validos.sort((a, b) => b.score - a.score);
  }

  const elegidosEspana: any[] = [];
  const chunkSize = 15;

  console.log(`[Prospecting] Iniciando extracción con bucle estricto. Objetivo: ${PROSPECTOS_POR_DIA} leads.`);

  // Fase 1: Conseguir MINIMO_ESPANA_POR_DIA
  while (elegidosEspana.length < MINIMO_ESPANA_POR_DIA && deEspanaAll.length > 0) {
    const chunk = deEspanaAll.splice(0, chunkSize);
    const validos = await procesarPostParaChunk(chunk);
    elegidosEspana.push(...validos);
  }

  let extraEspana: any[] = [];
  if (elegidosEspana.length > MINIMO_ESPANA_POR_DIA) {
    extraEspana = elegidosEspana.splice(MINIMO_ESPANA_POR_DIA);
  }

  // Fase 2: Conseguir el resto hasta PROSPECTOS_POR_DIA
  const queueRestante = [...deEspanaAll, ...restoAll].sort((a, b) => b.score - a.score);
  const elegidosFinales = [...elegidosEspana, ...extraEspana];

  while (elegidosFinales.length < PROSPECTOS_POR_DIA && queueRestante.length > 0) {
    const chunk = queueRestante.splice(0, chunkSize);
    const validos = await procesarPostParaChunk(chunk);
    elegidosFinales.push(...validos);
  }

  const nuevos = elegidosFinales.slice(0, PROSPECTOS_POR_DIA).sort((a, b) => b.score - a.score);
  console.log(`[Prospecting] Elegidos finales: ${nuevos.length} (todos con post real)`);

  const totalDeEspana = nuevos.filter((c) => c.esEspana).length;
  const totalConPost  = nuevos.filter((c) => c.tienePostReal).length;
  const totalSinPost  = nuevos.length - totalConPost;

  for (const { prospecto, score } of nuevos) {
    const urlNorm      = normalizeLinkedInUrl(prospecto.url);
    const postScraper  = ultimosPosts.get(urlNorm);
    // De nuevo: preferimos el texto del segundo scraper; el tema del primero solo como fallback.
    const ultimoPostTexto = postScraper?.texto?.trim() || prospecto.ultimoPostTema?.trim() || null;
    const ultimoPostUrl   = postScraper?.url || null;

    await sql`
      INSERT INTO prospectos (fecha_extraccion, nombre, url_perfil, cargo, score, dato_personalizado, ultimo_post_texto, ultimo_post_url, estado)
      VALUES (CURRENT_DATE, ${prospecto.nombre}, ${prospecto.url}, ${prospecto.cargo}, ${score},
              ${prospecto.bio || null}, ${ultimoPostTexto}, ${ultimoPostUrl}, 'Pendiente')
    `;

    await sql`
      INSERT INTO historico_urls (url_perfil)
      VALUES (${urlNorm})
      ON CONFLICT (url_perfil) DO NOTHING
    `;
  }

  if (fuente === 'Import manual') {
    await sql`DELETE FROM prospectos_import`;
  }

  return { nuevos: nuevos.length, fuente, descartadosPorValidacion, deEspana: totalDeEspana, conPost: totalConPost, sinPost: totalSinPost };
}

interface ImportRow {
  nombre: string | null;
  url_perfil: string | null;
  cargo: string | null;
  empresa: string | null;
  bio: string | null;
  ultimo_post: string | null;
  seguidores: number | null;
}

async function leerProspectosImportados(): Promise<ProspectoCrudo[]> {
  const { rows } = await sql<ImportRow>`SELECT * FROM prospectos_import`;
  return rows
    .filter((r) => r.url_perfil)
    .map((r) => ({
      nombre: r.nombre || '',
      url: r.url_perfil || '',
      cargo: r.cargo || '',
      empresa: r.empresa || '',
      bio: r.bio || '',
      ultimoPostTema: r.ultimo_post || '',
      ultimoPostFecha: null,
      seguidores: r.seguidores,
    }));
}

/**
 * Mueve al histórico "crm" las filas de "prospectos" marcadas Enviado/Descartado.
 * "Comentado" se deja fuera a propósito: es un estado intermedio (ya dejaste el
 * comentario en su post, pero todavía no has enviado la conexión) que debe seguir
 * visible en /prospectos hasta que pase a Enviado o Descartado.
 */
export async function archivarProspectosProcesados(): Promise<number> {
  await ensureSchema();

  const { rows } = await sql<{
    id: number;
    nombre: string;
    url_perfil: string;
    cargo: string | null;
    score: number;
    estado: string;
  }>`
    SELECT id, nombre, url_perfil, cargo, score, estado FROM prospectos
    WHERE estado IN ('Enviado', 'Descartado')
  `;

  for (const row of rows) {
    await sql`
      INSERT INTO crm (nombre, url_perfil, cargo, score, fecha_envio)
      VALUES (${row.nombre}, ${row.url_perfil}, ${row.cargo}, ${row.score},
              ${row.estado === 'Enviado' ? new Date().toISOString().slice(0, 10) : null})
    `;
    await sql`DELETE FROM prospectos WHERE id = ${row.id}`;
  }

  return rows.length;
}
