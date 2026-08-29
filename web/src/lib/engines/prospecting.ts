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
  fuente: 'Apify' | 'Import manual' | 'Reserva' | 'Mixta' | 'ninguna';
  descartadosPorValidacion: number;
  deEspana: number;
  conPost: number;       // ← nuevo: cuántos de los guardados tienen post real
  sinPost: number;       // ← nuevo: cuántos se guardaron sin post (no debería haber)
}

export async function buscarProspectosDeHoy(): Promise<ResultadoProspeccion> {
  await ensureSchema();

  // PASO 1: Comprobar el reservorio (Cola de Reserva)
  const resultReserva = await sql`
    SELECT id FROM prospectos 
    WHERE estado = 'Reserva' 
    ORDER BY score DESC, created_at ASC 
    LIMIT ${PROSPECTOS_POR_DIA}
  `;
  
  const recuperadosDeReserva = resultReserva.rows;
  let nuevosPromovidos = 0;
  let fuente: ResultadoProspeccion['fuente'] = 'ninguna';
  
  if (recuperadosDeReserva.length > 0) {
    const ids = recuperadosDeReserva.map(r => r.id);
    for (const id of ids) {
      await sql`
        UPDATE prospectos 
        SET estado = 'Pendiente', fecha_extraccion = CURRENT_DATE 
        WHERE id = ${id}
      `;
    }
    nuevosPromovidos = ids.length;
    console.log(`[Prospecting] Promovidos ${nuevosPromovidos} prospectos desde la Reserva a Pendiente.`);
    fuente = 'Reserva';
  }

  // Si ya hemos llenado el cupo del día con la reserva, terminamos aquí sin llamar a Apify.
  if (nuevosPromovidos >= PROSPECTOS_POR_DIA) {
    return { 
      nuevos: nuevosPromovidos, 
      fuente: 'Reserva', 
      descartadosPorValidacion: 0, 
      deEspana: 0, 
      conPost: nuevosPromovidos, 
      sinPost: 0 
    };
  }

  const faltantes = PROSPECTOS_POR_DIA - nuevosPromovidos;
  console.log(`[Prospecting] Faltan ${faltantes} prospectos para llegar al cupo. Buscando nuevas fuentes...`);

  let candidatos: ProspectoCrudo[] = [];

  if (tieneApifyConfigurado()) {
    candidatos = await buscarProspectosConApify();
    if (candidatos.length > 0) fuente = nuevosPromovidos > 0 ? 'Mixta' : 'Apify';
  }

  if (candidatos.length === 0) {
    candidatos = await leerProspectosImportados();
    if (candidatos.length > 0) fuente = nuevosPromovidos > 0 ? 'Mixta' : 'Import manual';
  }

  if (candidatos.length === 0) {
    return { nuevos: nuevosPromovidos, fuente, descartadosPorValidacion: 0, deEspana: 0, conPost: nuevosPromovidos, sinPost: 0 };
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
      esEspana: esDeEspana(p.url, `${p.cargo} ${p.bio} ${p.ubicacion || ''}`),
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

  console.log(`[Prospecting] Iniciando validación y extracción de todos los candidatos. Objetivo para hoy: ${faltantes} leads.`);

  // Procesamos ABSOLUTAMENTE TODOS los candidatos válidos, porque los que sobren irán a la Reserva.
  const queueTotal = [...deEspanaAll, ...restoAll].sort((a, b) => b.score - a.score);
  const elegidosFinales: any[] = [];

  while (queueTotal.length > 0) {
    const chunk = queueTotal.splice(0, chunkSize);
    const validos = await procesarPostParaChunk(chunk);
    elegidosFinales.push(...validos);
  }

  const deEspanaValidos = elegidosFinales.filter((c) => c.esEspana).sort((a, b) => b.score - a.score);
  const restoValidos = elegidosFinales.filter((c) => !c.esEspana).sort((a, b) => b.score - a.score);

  // Intentamos asegurar la cuota de España
  const objetivoEspana = Math.min(faltantes, MINIMO_ESPANA_POR_DIA);
  const espanaParaHoy = deEspanaValidos.splice(0, objetivoEspana);

  // Rellenamos el resto de faltantes con resto (USA/UK, etc.)
  let faltanAun = faltantes - espanaParaHoy.length;
  const restoParaHoy = restoValidos.splice(0, faltanAun);

  // Si aun nos faltan porque no había suficiente resto, rellenamos con más de España
  faltanAun = faltantes - (espanaParaHoy.length + restoParaHoy.length);
  if (faltanAun > 0 && deEspanaValidos.length > 0) {
    espanaParaHoy.push(...deEspanaValidos.splice(0, faltanAun));
  }

  const nuevosPendientes = [...espanaParaHoy, ...restoParaHoy].sort((a, b) => b.score - a.score);
  const paraReserva = [...deEspanaValidos, ...restoValidos].sort((a, b) => b.score - a.score);

  console.log(`[Prospecting] Elegidos finales: ${nuevosPendientes.length} para hoy, y ${paraReserva.length} enviados a la Cola de Reserva.`);

  const insertarProspectos = async (items: any[], estado: string) => {
    for (const { prospecto, score } of items) {
      const urlNorm      = normalizeLinkedInUrl(prospecto.url);
      const postScraper  = ultimosPosts.get(urlNorm);
      const ultimoPostTexto = postScraper?.texto?.trim() || prospecto.ultimoPostTema?.trim() || null;
      const ultimoPostUrl   = postScraper?.url || prospecto.ultimoPostUrl || null;

      await sql`
        INSERT INTO prospectos (fecha_extraccion, nombre, url_perfil, cargo, score, dato_personalizado, ultimo_post_texto, ultimo_post_url, estado)
        VALUES (CURRENT_DATE, ${prospecto.nombre}, ${prospecto.url}, ${prospecto.cargo}, ${score},
                ${prospecto.bio || null}, ${ultimoPostTexto}, ${ultimoPostUrl}, ${estado})
      `;

      await sql`
        INSERT INTO historico_urls (url_perfil)
        VALUES (${urlNorm})
        ON CONFLICT (url_perfil) DO NOTHING
      `;
    }
  };

  await insertarProspectos(nuevosPendientes, 'Pendiente');
  await insertarProspectos(paraReserva, 'Reserva');

  if (fuente === 'Import manual' || fuente === 'Mixta') {
    await sql`DELETE FROM prospectos_import`;
  }

  const totalNuevosHoy = nuevosPromovidos + nuevosPendientes.length;
  const totalConPost = nuevosPendientes.filter((c) => c.tienePostReal).length + nuevosPromovidos;
  
  return { 
    nuevos: totalNuevosHoy, 
    fuente, 
    descartadosPorValidacion, 
    deEspana: nuevosPendientes.filter((c) => c.esEspana).length, 
    conPost: totalConPost, 
    sinPost: totalNuevosHoy - totalConPost 
  };
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
