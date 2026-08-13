/**
 * apify.ts
 * Automatiza la búsqueda de prospectos vía un actor de Apify. Pensado por defecto para
 * `harvestapi/linkedin-profile-search` (LinkedIn Profile Search Scraper, sin cookies,
 * https://apify.com/harvestapi/linkedin-profile-search) — pon ese valor en APIFY_ACTOR_ID.
 * El esquema de salida depende del actor concreto que uses, así que normalizarItem() acepta
 * varios nombres de campo habituales (incluidos los de harvestapi); ajústalo si tu actor
 * devuelve nombres distintos. El input de búsqueda por defecto usa las mismas palabras clave
 * del ICP (ver SCORE_KEYWORDS en config.ts).
 *
 * El ICP quiere mayoría hispanohablante (ver RATIO_MINIMO_HISPANOHABLANTE en config.ts), así
 * que por defecto se lanzan DOS búsquedas: una grande sesgada a países hispanohablantes
 * (UBICACIONES_HISPANOHABLANTES) y otra pequeña sin restricción de ubicación para variedad.
 * Si defines APIFY_LOCATIONS (separadas por coma) se respeta esa lista tal cual y se hace
 * una única búsqueda con ella, sin la búsqueda global adicional. El filtrado/priorización
 * final por idioma real (incluida la exclusión de portugués/brasileño) pasa en
 * engines/prospecting.ts vía idioma.ts.
 *
 * El actor de búsqueda de perfiles NO devuelve el contenido de sus posts recientes, así que
 * para el último post usamos un segundo actor, `harvestapi/linkedin-profile-posts`
 * (buscarUltimosPosts) — barato (~$0.002/post) y solo se llama para los prospectos que ya
 * pasaron el filtro/dedupe, nunca para todo el resultado bruto de la búsqueda.
 */
import { PROSPECTOS_POR_DIA, SCORE_KEYWORDS, UBICACIONES_HISPANOHABLANTES } from './config';
import { normalizeLinkedInUrl } from './validation';
import type { ProspectoCrudo } from './types';

export function tieneApifyConfigurado(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN && process.env.APIFY_ACTOR_ID);
}

async function ejecutarActorSync(
  actorId: string,
  token: string,
  input: Record<string, unknown>
): Promise<Record<string, any>[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(
    actorId
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Error llamando a Apify (HTTP ${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as Record<string, any>[];
}

function deduplicarPorUrl(items: Record<string, any>[]): ProspectoCrudo[] {
  const vistos = new Set<string>();
  const candidatos: ProspectoCrudo[] = [];
  for (const item of items) {
    const prospecto = normalizarItem(item);
    const clave = normalizeLinkedInUrl(prospecto.url);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    candidatos.push(prospecto);
  }
  return candidatos;
}

/** Lanza el/los actor(es) de Apify de forma síncrona y devuelve los candidatos normalizados. */
export async function buscarProspectosConApify(): Promise<ProspectoCrudo[]> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token || !actorId) return [];

  const searchQuery = process.env.APIFY_SEARCH_QUERY || SCORE_KEYWORDS.join(' OR ');
  const locationsOverride = (process.env.APIFY_LOCATIONS || '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);

  const base = (maxItems: number) => ({
    profileScraperMode: 'Full',
    searchQuery,
    maxItems,
    takePages: Math.max(1, Math.ceil(maxItems / 25)),
  });

  if (locationsOverride.length > 0) {
    // El usuario definió ubicaciones explícitas: se respetan tal cual, una sola búsqueda.
    const items = await ejecutarActorSync(actorId, token, {
      ...base(PROSPECTOS_POR_DIA * 3),
      locations: locationsOverride,
    });
    return deduplicarPorUrl(items);
  }

  // Pool grande sesgado a países hispanohablantes + pool pequeño sin restricción de
  // ubicación (variedad ~25%), en paralelo. El resultado combinado se filtra/prioriza por
  // idioma real en engines/prospecting.ts.
  const poolHispano = Math.max(PROSPECTOS_POR_DIA * 3, 60);
  const poolGlobal = PROSPECTOS_POR_DIA;

  const [itemsHispano, itemsGlobal] = await Promise.all([
    ejecutarActorSync(actorId, token, { ...base(poolHispano), locations: UBICACIONES_HISPANOHABLANTES }),
    ejecutarActorSync(actorId, token, base(poolGlobal)),
  ]);

  return deduplicarPorUrl([...itemsHispano, ...itemsGlobal]);
}

/**
 * Dado un lote de URLs de perfil, devuelve el último post de cada una (si lo tiene): texto y
 * URL directa al post. Usa `harvestapi/linkedin-profile-posts` (sobrescribible con
 * APIFY_POSTS_ACTOR_ID). Nunca lanza: si Apify falla o un perfil no tiene posts, esa URL
 * simplemente no aparece en el mapa devuelto, para no tumbar toda la prospección por un
 * único error de scraping.
 */
export async function buscarUltimosPosts(urls: string[]): Promise<Map<string, { texto: string; url: string }>> {
  const resultado = new Map<string, { texto: string; url: string }>();
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_POSTS_ACTOR_ID || 'harvestapi/linkedin-profile-posts';
  if (!token || urls.length === 0) return resultado;

  try {
    const items = await ejecutarActorSync(actorId, token, {
      targetUrls: urls,
      maxPosts: 1,
      includeReposts: false,
    });

    for (const item of items) {
      const autorUrl = item.author?.linkedinUrl || item.authorUrl || '';
      const contenido = (item.content || item.text || '').trim();
      const postUrl = item.linkedinUrl || item.url || '';
      if (!autorUrl || !contenido) continue;
      const clave = normalizeLinkedInUrl(autorUrl);
      if (!resultado.has(clave)) resultado.set(clave, { texto: contenido, url: postUrl });
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
