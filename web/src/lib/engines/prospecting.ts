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

  // Separar por ubicación. Pool amplio (×4) para tener suficiente cantera de donde sacar
  // 25 con post reciente sin quedarnos cortos.
  const deEspanaAll = candidatosClasificados.filter((c) => c.esEspana).sort((a, b) => b.score - a.score);
  const restoAll    = candidatosClasificados.filter((c) => !c.esEspana).sort((a, b) => b.score - a.score);

  const poolEspana = deEspanaAll.slice(0, Math.max(MINIMO_ESPANA_POR_DIA * 4, 60));
  const poolResto  = restoAll.slice(0, Math.max(PROSPECTOS_POR_DIA * 4, 80));
  const preSeleccionados = [...poolEspana, ...poolResto];

  console.log(`[Prospecting] Pool preseleccionado: ${preSeleccionados.length} (${poolEspana.length} ES + ${poolResto.length} resto)`);

  // ─────────────────────────────────────────────────────────────────────────
  // Buscar posts para TODOS los candidatos del pool, sin excepción.
  //
  // CORRECCIÓN vs. versión anterior: antes se saltaba el segundo scraper para
  // los perfiles que ya traían `ultimoPostTema` del primer scraper. El problema
  // es que ese campo suele ser solo el "tema" (2-3 palabras), no el texto real,
  // así que se guardaba un texto inútil y el comentario no se podía generar.
  // Ahora siempre llamamos al scraper de posts; el `ultimoPostTema` solo se usa
  // como fallback si el scraper no devuelve nada.
  // ─────────────────────────────────────────────────────────────────────────
  let ultimosPosts = new Map<string, { texto: string; url: string; fecha: string | null }>();

  if (fuente === 'Apify') {
    const todasLasUrls = preSeleccionados.map((c) => c.prospecto.url);

    if (todasLasUrls.length > 0) {
      // Chunk en lotes de 15 para evitar el timeout de 60s de Apify run-sync
      const chunkSize = 15;
      const chunks: string[][] = [];
      for (let i = 0; i < todasLasUrls.length; i += chunkSize) {
        chunks.push(todasLasUrls.slice(i, i + chunkSize));
      }

      console.log(`[Prospecting] Buscando posts en ${chunks.length} lotes (${todasLasUrls.length} perfiles)...`);

      for (const chunk of chunks) {
        const resultado = await buscarUltimosPosts(chunk);
        for (const [key, val] of resultado.entries()) {
          ultimosPosts.set(key, val);
        }
        // Espera corta entre lotes para no saturar al actor de Apify
        if (chunks.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`[Prospecting] Posts encontrados por el scraper: ${ultimosPosts.size} de ${todasLasUrls.length}`);
    }
  }

  // Función para evaluar si un post es reciente (últimos 30 días)
  const haceUnMes = new Date();
  haceUnMes.setMonth(haceUnMes.getMonth() - 1);
  const unMesMs = haceUnMes.getTime();

  function esPostReciente(fechaStr: string | null | undefined): boolean {
    // Si no hay fecha, no podemos datarlo → lo dejamos pasar (mejor así que descartar
    // un post válido por falta de metadato de fecha en la API de Apify).
    if (!fechaStr) return true;
    const fecha = new Date(fechaStr).getTime();
    if (Number.isNaN(fecha)) return true; // fecha inválida → no descartar
    return fecha >= unMesMs;
  }

  function esTextoPostValido(texto: string | null | undefined): boolean {
    return Boolean(texto && texto.trim().length >= MIN_POST_CHARS);
  }

  // Evaluar cada candidato con lógica clara usando el flag booleano
  const candidatosValidos = [];
  let descartadosPorPostViejo = 0;

  for (const c of preSeleccionados) {
    const urlNorm = normalizeLinkedInUrl(c.prospecto.url);
    const postScraper = ultimosPosts.get(urlNorm);

    // El texto del post: preferimos el del segundo scraper (más completo).
    // Solo usamos ultimoPostTema del primer scraper como último recurso.
    const textoPost = postScraper?.texto?.trim() || c.prospecto.ultimoPostTema?.trim() || null;
    const fechaPost  = postScraper?.fecha || c.prospecto.ultimoPostFecha || null;

    // Un post cuenta como "real" solo si tiene suficiente texto para comentar.
    const postEsValido = esTextoPostValido(textoPost);

    if (postEsValido) {
      if (esPostReciente(fechaPost)) {
        c.tienePostReal = true;
        c.score += 1000; // bonus masivo para priorizar en el ranking final
        candidatosValidos.push(c);
      } else {
        // Post viejo (> 30 días): descartamos
        descartadosPorPostViejo++;
        continue;
      }
    } else {
      // Sin post (o texto demasiado corto): lo mantenemos pero sin bonus ni flag.
      // Irán al final del ranking y serán eliminados por el filtro duro de abajo.
      candidatosValidos.push(c);
    }
  }

  console.log(`[Prospecting] Candidatos tras evaluar posts: ${candidatosValidos.length} (${candidatosValidos.filter(c => c.tienePostReal).length} con post real, ${descartadosPorPostViejo} descartados por post viejo)`);

  // Reordenar con el nuevo score
  const deEspanaConPosts = candidatosValidos.filter((c) => c.esEspana).sort((a, b) => b.score - a.score);
  const restoConPosts    = candidatosValidos.filter((c) => !c.esEspana).sort((a, b) => b.score - a.score);

  // Hacer el corte final de PROSPECTOS_POR_DIA
  const elegidosEspana   = deEspanaConPosts.slice(0, MINIMO_ESPANA_POR_DIA);
  const huecosRestantes  = PROSPECTOS_POR_DIA - elegidosEspana.length;
  const relleno          = [...deEspanaConPosts.slice(elegidosEspana.length), ...restoConPosts]
                             .sort((a, b) => b.score - a.score)
                             .slice(0, huecosRestantes);

  let nuevos = [...elegidosEspana, ...relleno].sort((a, b) => b.score - a.score);

  // Filtrado ESTRICTO: Solo aceptamos prospectos que tengan un post real reciente.
  // Si no hay suficientes, no se rellena con perfiles sin post, a petición expresa del usuario.
  nuevos = nuevos.filter(c => c.tienePostReal);

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
