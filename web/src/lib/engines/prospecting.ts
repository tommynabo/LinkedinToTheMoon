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

  // El ICP quiere un mínimo de MINIMO_ESPANA_POR_DIA (de PROSPECTOS_POR_DIA) que sean de
  // España específicamente: se priorizan los detectados como "de España" hasta cubrir esa
  // cuota, y el resto de huecos se rellena con los mejores candidatos restantes (de
  // cualquier otro sitio, sin restricción adicional).
  const deEspana = candidatosClasificados.filter((c) => c.esEspana).sort((a, b) => b.score - a.score);
  const resto = candidatosClasificados.filter((c) => !c.esEspana).sort((a, b) => b.score - a.score);

  const elegidosEspana = deEspana.slice(0, MINIMO_ESPANA_POR_DIA);
  const huecosRestantes = PROSPECTOS_POR_DIA - elegidosEspana.length;
  const relleno = [...deEspana.slice(elegidosEspana.length), ...resto].slice(0, huecosRestantes);

  const nuevos = [...elegidosEspana, ...relleno].sort((a, b) => b.score - a.score);
  const totalDeEspana = nuevos.filter((c) => c.esEspana).length;

  // El buscador de perfiles no trae el contenido de sus posts recientes; lo pedimos aparte
  // (segundo actor, barato) solo para los que ya pasaron el filtro, y solo si venían de Apify
  // (el import manual ya puede traer "ultimo_post" pegado a mano en la columna correspondiente).
  let ultimosPosts = new Map<string, { texto: string; url: string }>();
  if (fuente === 'Apify') {
    const urlsSinPost = nuevos.filter(({ prospecto }) => !prospecto.ultimoPostTema).map(({ prospecto }) => prospecto.url);
    if (urlsSinPost.length > 0) {
      ultimosPosts = await buscarUltimosPosts(urlsSinPost);
    }
  }

  for (const { prospecto, score } of nuevos) {
    const postEncontrado = ultimosPosts.get(normalizeLinkedInUrl(prospecto.url));
    const ultimoPostTexto = prospecto.ultimoPostTema || postEncontrado?.texto || null;
    const ultimoPostUrl = postEncontrado?.url || null;
    await sql`
      INSERT INTO prospectos (fecha_extraccion, nombre, url_perfil, cargo, score, dato_personalizado, ultimo_post_texto, ultimo_post_url, estado)
      VALUES (CURRENT_DATE, ${prospecto.nombre}, ${prospecto.url}, ${prospecto.cargo}, ${score},
              ${prospecto.bio || null}, ${ultimoPostTexto}, ${ultimoPostUrl}, 'Pendiente')
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
