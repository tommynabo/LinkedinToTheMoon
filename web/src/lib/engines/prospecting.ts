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

export interface ResultadoProspeccion {
  nuevos: number;
  fuente: 'Apify' | 'Import manual' | 'ninguna';
  descartadosPorValidacion: number;
  deEspana: number;
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
    return { nuevos: 0, fuente: 'ninguna', descartadosPorValidacion: 0, deEspana: 0 };
  }

  const validos = candidatos.filter(esProspectoValido);
  const descartadosPorValidacion = candidatos.length - validos.length;

  const urlsConocidas = await getUrlsConocidas();
  const candidatosClasificados = validos
    .filter((p) => !urlsConocidas.has(normalizeLinkedInUrl(p.url)))
    .map((p) => ({
      prospecto: p,
      score: calcularScore(p),
      idioma: detectarIdiomaAprox(`${p.cargo} ${p.bio}`),
      esEspana: esDeEspana(p.url, `${p.cargo} ${p.bio}`),
    }))
    // Exclusión total de portugués/brasileño, pedido explícito del ICP (no es solo cuota).
    .filter((c) => c.idioma !== 'pt');

  // Separar por ubicación y pre-seleccionar un grupo más amplio (top ~70) para buscar posts
  const deEspanaAll = candidatosClasificados.filter((c) => c.esEspana).sort((a, b) => b.score - a.score);
  const restoAll = candidatosClasificados.filter((c) => !c.esEspana).sort((a, b) => b.score - a.score);

  const poolEspana = deEspanaAll.slice(0, Math.max(MINIMO_ESPANA_POR_DIA * 2, 30));
  const poolResto = restoAll.slice(0, Math.max(PROSPECTOS_POR_DIA * 2, 40));
  const preSeleccionados = [...poolEspana, ...poolResto];

  // Buscar posts ANTES de hacer el corte final para priorizar a los que sí tengan post
  let ultimosPosts = new Map<string, { texto: string; url: string }>();
  if (fuente === 'Apify') {
    const urlsSinPost = preSeleccionados
      .filter((c) => !c.prospecto.ultimoPostTema)
      .map((c) => c.prospecto.url);
    if (urlsSinPost.length > 0) {
      ultimosPosts = await buscarUltimosPosts(urlsSinPost);
    }
  }

  // Dar un bonus masivo a los que tienen post
  for (const c of preSeleccionados) {
    const urlNorm = normalizeLinkedInUrl(c.prospecto.url);
    const tienePost = Boolean(c.prospecto.ultimoPostTema || ultimosPosts.has(urlNorm));
    if (tienePost) {
      c.score += 1000;
    }
  }

  // Reordenar con el nuevo score
  const deEspanaConPosts = preSeleccionados.filter((c) => c.esEspana).sort((a, b) => b.score - a.score);
  const restoConPosts = preSeleccionados.filter((c) => !c.esEspana).sort((a, b) => b.score - a.score);

  // Hacer el corte final de PROSPECTOS_POR_DIA
  const elegidosEspana = deEspanaConPosts.slice(0, MINIMO_ESPANA_POR_DIA);
  const huecosRestantes = PROSPECTOS_POR_DIA - elegidosEspana.length;
  const relleno = [...deEspanaConPosts.slice(elegidosEspana.length), ...restoConPosts].slice(0, huecosRestantes);

  const nuevos = [...elegidosEspana, ...relleno].sort((a, b) => b.score - a.score);
  const totalDeEspana = nuevos.filter((c) => c.esEspana).length;

  for (const { prospecto, score } of nuevos) {
    const postEncontrado = ultimosPosts.get(normalizeLinkedInUrl(prospecto.url));
    const ultimoPostTexto = prospecto.ultimoPostTema || postEncontrado?.texto || null;
    const ultimoPostUrl = postEncontrado?.url || null;
    const urlNormalizada = normalizeLinkedInUrl(prospecto.url);

    await sql`
      INSERT INTO prospectos (fecha_extraccion, nombre, url_perfil, cargo, score, dato_personalizado, ultimo_post_texto, ultimo_post_url, estado)
      VALUES (CURRENT_DATE, ${prospecto.nombre}, ${urlNormalizada}, ${prospecto.cargo}, ${score},
              ${prospecto.bio || null}, ${ultimoPostTexto}, ${ultimoPostUrl}, 'Pendiente')
    `;

    await sql`
      INSERT INTO historico_urls (url_perfil)
      VALUES (${urlNormalizada})
      ON CONFLICT (url_perfil) DO NOTHING
    `;
  }

  if (fuente === 'Import manual') {
    await sql`DELETE FROM prospectos_import`;
  }

  return { nuevos: nuevos.length, fuente, descartadosPorValidacion, deEspana: totalDeEspana };
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
