/**
 * apify.ts
 * Automatiza la búsqueda de prospectos vía un actor de Apify. Pensado por defecto para
 * `harvestapi/linkedin-profile-search` (LinkedIn Profile Search Scraper, sin cookies,
 * https://apify.com/harvestapi/linkedin-profile-search) — pon ese valor en APIFY_ACTOR_ID.
 * El esquema de salida depende del actor concreto que uses, así que normalizarItem() acepta
 * varios nombres de campo habituales (incluidos los de harvestapi); ajústalo si tu actor
 * devuelve nombres distintos. El input de búsqueda por defecto usa las mismas palabras clave
 * del ICP (ver SCORE_KEYWORDS en config.ts); puedes sobrescribirlo con APIFY_SEARCH_QUERY y
 * opcionalmente restringir ubicación con APIFY_LOCATIONS (separadas por coma).
 *
 * El actor de búsqueda de perfiles NO devuelve el contenido de sus posts recientes, así que
 * para el último post usamos un segundo actor, `harvestapi/linkedin-profile-posts`
 * (buscarUltimosPosts) — barato (~$0.002/post) y solo se llama para los prospectos que ya
 * pasaron el filtro/dedupe, nunca para todo el resultado bruto de la búsqueda.
 */
import { PROSPECTOS_POR_DIA, SCORE_KEYWORDS } from './config';
import { normalizeLinkedInUrl } from './validation';
import type { ProspectoCrudo } from './types';

export function tieneApifyConfigurado(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN && process.env.APIFY_ACTOR_ID);
}

/** Lanza el actor de Apify de forma síncrona y devuelve los items normalizados. */
export async function buscarProspectosConApify(): Promise<ProspectoCrudo[]> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token || !actorId) return [];

  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(
    actorId
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const locations = (process.env.APIFY_LOCATIONS || '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);

  // Input pensado para harvestapi/linkedin-profile-search; si usas otro actor con otro
  // esquema de input, sobrescribe APIFY_SEARCH_QUERY o adapta este objeto.
  const input = {
    profileScraperMode: 'Full',
    searchQuery: process.env.APIFY_SEARCH_QUERY || SCORE_KEYWORDS.join(' OR '),
    maxItems: PROSPECTOS_POR_DIA,
    takePages: Math.max(1, Math.ceil(PROSPECTOS_POR_DIA / 25)),
    ...(locations.length > 0 ? { locations } : {}),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Error llamando a Apify (HTTP ${response.status}): ${await response.text()}`);
  }

  const items = (await response.json()) as Record<string, any>[];
  return items.map(normalizarItem);
}

/**
 * Dado un lote de URLs de perfil, devuelve el texto del post más reciente de cada una (si lo
 * tiene). Usa `harvestapi/linkedin-profile-posts` (sobrescribible con APIFY_POSTS_ACTOR_ID).
 * Nunca lanza: si Apify falla o un perfil no tiene posts, esa URL simplemente no aparece en el
 * mapa devuelto, para no tumbar toda la prospección por un único error de scraping.
 */
export async function buscarUltimosPosts(urls: string[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_POSTS_ACTOR_ID || 'harvestapi/linkedin-profile-posts';
  if (!token || urls.length === 0) return resultado;

  const requestUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(
    actorId
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUrls: urls, maxPosts: 1, includeReposts: false }),
    });

    if (!response.ok) {
      console.error(`Error llamando a Apify (posts, HTTP ${response.status}): ${await response.text()}`);
      return resultado;
    }

    const items = (await response.json()) as Record<string, any>[];
    for (const item of items) {
      const autorUrl = item.author?.linkedinUrl || item.authorUrl || '';
      const contenido = (item.content || item.text || '').trim();
      if (!autorUrl || !contenido) continue;
      const clave = normalizeLinkedInUrl(autorUrl);
      if (!resultado.has(clave)) resultado.set(clave, contenido);
    }
  } catch (err) {
    console.error('Error obteniendo últimos posts de Apify:', err);
  }

  return resultado;
}

function normalizarItem(item: Record<string, any>): ProspectoCrudo {
  const nombreCompleto = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
  const empresaActual = item.currentPosition?.[0]?.companyName || item.experience?.[0]?.companyName;
  const seguidores = item.followerCount ?? item.followers;

  return {
    nombre: item.fullName || nombreCompleto || item.name || item.nombre || '',
    url: item.linkedinUrl || item.profileUrl || item.url || '',
    cargo: item.headline || item.jobTitle || item.cargo || '',
    empresa: empresaActual || item.companyName || item.company || item.empresa || '',
    bio: item.about || item.bio || item.headline || '',
    ultimoPostTema: item.lastPostTopic || item.lastPostText || '',
    ultimoPostFecha: item.lastPostDate || null,
    seguidores: typeof seguidores === 'number' ? seguidores : null,
  };
}
