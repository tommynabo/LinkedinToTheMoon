/**
 * apify.ts
 * Automatiza la búsqueda de prospectos vía un actor de Apify.
 *
 * Actor por defecto recomendado: `memo23/linkedin-people-search` (LinkedIn People Search
 * Scraper, sin cookies, https://apify.com/memo23/linkedin-people-search) — pago por evento
 * (~$0.004-0.005/perfil), SIN límite artificial de "runs gratis" para cuentas free (a
 * diferencia de harvestapi/linkedin-profile-search, cuyo propio autor bloquea cuentas no
 * de pago tras 10 runs). También se soporta `harvestapi/linkedin-profile-search` (input
 * `profileScraperMode`/`searchQuery`/`locations[]`) por compatibilidad retroactiva.
 * El esquema de entrada/salida depende del actor concreto que uses: esActorMemo23() decide
 * qué forma de input construir, y normalizarItem() acepta varios nombres de campo habituales
 * (de ambos actores) al normalizar la salida; ajústalo si usas un actor distinto. El input
 * de búsqueda por defecto usa las mismas palabras clave del ICP (ver SCORE_KEYWORDS en
 * config.ts).
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

/** `memo23/linkedin-people-search` usa un input distinto (mode/keywords/location single-string/maxResults). */
function esActorMemo23(actorId: string): boolean {
  return actorId.toLowerCase().includes('memo23');
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

  if (esActorMemo23(actorId)) {
    return buscarConMemo23(actorId, token, locationsOverride);
  }

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
 * `memo23/linkedin-people-search` no acepta un array de ubicaciones (solo un `location`
 * string) ni distingue "hispano" de "global" por país, así que replicamos el mismo sesgo
 * ~75/25 usando el IDIOMA de las keywords en vez de la ubicación: un grupo de búsquedas
 * con keywords en español (que naturalmente devuelve sobre todo hispanohablantes/
 * lusófonos, filtrados después por idioma real en prospecting.ts) y otro grupo con
 * keywords en inglés para variedad global. Si el usuario definió APIFY_LOCATIONS se usa
 * solo la primera ubicación de la lista como filtro adicional (el actor solo admite una).
 *
 * IMPORTANTE (verificado empíricamente): este actor lanza una búsqueda tipo
 * Google/Bing por debajo, y una única query con muchos términos unidos por "OR" se queda
 * corta (~15-20 resultados únicos aunque pidas maxResults mucho más alto), porque el motor
 * de búsqueda público solo profundiza tanto en una query compuesta. Lanzar UNA búsqueda POR
 * KEYWORD por separado (en paralelo) da bastantes más resultados únicos en total para el
 * mismo coste aproximado. Ver /memories/repo para el detalle de esta medición.
 */
async function buscarConMemo23(
  actorId: string,
  token: string,
  locationsOverride: string[]
): Promise<ProspectoCrudo[]> {
  const keywordsHispano = process.env.APIFY_SEARCH_QUERY
    ? process.env.APIFY_SEARCH_QUERY.split(',').map((k) => k.trim()).filter(Boolean)
    : SCORE_KEYWORDS;
  const keywordsGlobal = process.env.APIFY_SEARCH_QUERY_GLOBAL
    ? process.env.APIFY_SEARCH_QUERY_GLOBAL.split(',').map((k) => k.trim()).filter(Boolean)
    : ['coach', 'consultant', 'mentor', 'founder'];
  const location = locationsOverride[0];

  const [resultadosHispano, resultadosGlobal] = await Promise.all([
    Promise.all(
      keywordsHispano.map((keywords) =>
        ejecutarActorSync(actorId, token, {
          mode: 'public',
          keywords,
          maxResults: 20,
          ...(location ? { location } : {}),
        })
      )
    ),
    Promise.all(
      keywordsGlobal.map((keywords) =>
        ejecutarActorSync(actorId, token, { mode: 'public', keywords, maxResults: 10 })
      )
    ),
  ]);

  return deduplicarPorUrl([...resultadosHispano.flat(), ...resultadosGlobal.flat()]);
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
    cargo: item.headline || item.jobTitle || item.summary || item.cargo || '',
    empresa: empresaActual || item.currentCompany || item.companyName || item.company || item.empresa || '',
    bio: item.about || item.bio || item.headline || item.summary || '',
    ultimoPostTema: item.lastPostTopic || item.lastPostText || '',
    ultimoPostFecha: item.lastPostDate || null,
    seguidores: typeof seguidores === 'number' ? seguidores : null,
  };
}
