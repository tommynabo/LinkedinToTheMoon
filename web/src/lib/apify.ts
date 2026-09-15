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
 * de búsqueda por defecto usa las mismas palabras clave del ICP (ver ONLINE_SEARCH_KEYWORDS en
 * online.ts).
 *
 * Países admitidos: España, Reino Unido, Estados Unidos y Canadá. El filtro final
 * exige ubicación explícita del autor; una búsqueda sesgada no prueba su residencia.
 * Los buscadores de posts pueden devolver autores sin ubicación: se descartan.
 *
 * El actor de búsqueda de perfiles NO devuelve el contenido de sus posts recientes, así que
 * para el último post usamos un segundo actor, `harvestapi/linkedin-profile-posts`
 * (buscarUltimosPosts) — barato (~$0.002/post) y solo se llama para los prospectos que ya
 * pasaron el filtro/dedupe, nunca para todo el resultado bruto de la búsqueda.
 */
import { PROSPECTOS_POR_DIA, UBICACION_PRIORITARIA } from './config';
import { PAISES_BUSQUEDA, paisPermitido, ubicacionPerfil } from './geography';
import { ONLINE_SEARCH_KEYWORDS, esProfesionalOnline } from './online';
import { esProspectoValido, normalizeLinkedInUrl } from './validation';
import type { ProspectoCrudo } from './types';

export function tieneApifyConfigurado(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN && process.env.APIFY_ACTOR_ID);
}

/** `memo23/linkedin-people-search` usa un input distinto (mode/keywords/location single-string/maxResults). */
function esActorMemo23(actorId: string): boolean {
  return actorId.toLowerCase().includes('memo23') && !actorId.toLowerCase().includes('post');
}

function esActorDePosts(actorId: string): boolean {
  return actorId.toLowerCase().includes('post-search') || actorId.toLowerCase().includes('posts-scraper');
}

async function ejecutarActorSync(
  actorId: string,
  token: string,
  input: Record<string, unknown>,
  retries = 3
): Promise<Record<string, any>[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(
    actorId
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`Error llamando a Apify (HTTP ${response.status}): ${await response.text()}`);
      }

      return (await response.json()) as Record<string, any>[];
    } catch (err: any) {
      lastError = err;
      const esReintentable = err.message &&
        (err.message.includes('HTTP 5') || err.message.includes('HTTP 400') ||
         err.name === 'FetchError' || err.name === 'TypeError');
      if (attempt < retries && esReintentable) {
        const delay = attempt * 5000; // 5s, 10s entre reintentos
        console.warn(`[Apify] Intento ${attempt} fallido, reintentando en ${delay/1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Enriquecimiento de perfiles vía `harvestapi/linkedin-profile-scraper`: el modo `public`
 * (sin cookies) de los actores de búsqueda casi siempre devuelve `headline`/`location` vacíos
 * o con texto genérico de LinkedIn para visitantes anónimos, lo que hace fallar la
 * validación de país/ICP aunque el candidato sea válido. Rellena ubicacion/cargo/bio/empresa
 * reales para cada URL antes de validar. Muta los objetos en el array recibido. Nunca lanza:
 * si el enrichment falla, los candidatos quedan tal cual (los descartará la validación normal).
 */
async function enriquecerPerfiles(candidatos: ProspectoCrudo[], token: string): Promise<void> {
  if (candidatos.length === 0) return;
  const profileActorId = process.env.APIFY_PROFILE_ACTOR_ID || 'harvestapi/linkedin-profile-scraper';
  try {
    const perfilesPorUrl = new Map<string, ProspectoCrudo>();
    for (let index = 0; index < candidatos.length; index += 10) {
      const lote = candidatos.slice(index, index + 10);
      const perfiles = await ejecutarActorSync(profileActorId, token, {
        profileScraperMode: 'Profile details no email ($4 per 1k)',
        queries: lote.map((prospecto) => prospecto.url),
      });
      for (const perfil of perfiles) {
        const url = perfil.linkedinUrl || perfil.profileUrl || perfil.url || '';
        if (url) perfilesPorUrl.set(normalizeLinkedInUrl(url), normalizarItem(perfil));
      }
    }
    for (const prospecto of candidatos) {
      const perfil = perfilesPorUrl.get(normalizeLinkedInUrl(prospecto.url));
      if (perfil) {
        prospecto.ubicacion = perfil.ubicacion || prospecto.ubicacion;
        prospecto.cargo = perfil.cargo || prospecto.cargo;
        prospecto.bio = perfil.bio || prospecto.bio;
        prospecto.empresa = perfil.empresa || prospecto.empresa;
      }
    }
    console.log(`[Apify] Enrichment de perfil obtenido para ${perfilesPorUrl.size}/${candidatos.length} candidatos.`);
  } catch (error) {
    console.error('[Apify] No se pudieron enriquecer los perfiles:', error);
  }
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

/**
 * Lanza una búsqueda Apify para UNA keyword concreta y devuelve los candidatos normalizados.
 *
 * La selección de qué keyword usar y en qué ubicación corresponde al llamador
 * (run_prospecting_icp.ts o engines/prospecting.ts), que rota por ONLINE_SEARCH_KEYWORDS.
 * Esto permite buscar keyword a keyword hasta llenar el cupo diario, parando en cuanto
 * se llega a los 25 para no gastar créditos extra.
 *
 * @param keyword  Término exacto de búsqueda (ej: 'consultor SEO'). Sin OR compuesto.
 * @param location Ubicación para la búsqueda (ej: 'Spain'). Una sola por llamada.
 */
export async function buscarProspectosConApify(
  keyword?: string,
  location?: string,
): Promise<ProspectoCrudo[]> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token || !actorId) return [];

  if (esActorDePosts(actorId)) {
    return buscarProspectosPorPosts(actorId, token, PROSPECTOS_POR_DIA);
  }

  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24
  );
  const keywordFinal =
    keyword ??
    (process.env.APIFY_SEARCH_QUERY ? process.env.APIFY_SEARCH_QUERY.split(',')[0].trim() : null) ??
    ONLINE_SEARCH_KEYWORDS[dayOfYear % ONLINE_SEARCH_KEYWORDS.length];

  const locationFinal =
    location ??
    process.env.APIFY_LOCATIONS?.split(',')[0]?.trim() ??
    UBICACION_PRIORITARIA;

  if (esActorMemo23(actorId)) {
    return buscarConMemo23(actorId, token, keywordFinal, locationFinal);
  }

  // Fallback para harvestapi u otros actores (sí soportan location como filtro real)
  const items = await ejecutarActorSync(actorId, token, {
    profileScraperMode: 'Full',
    searchQuery: keywordFinal,
    maxItems: 50,
    takePages: 2,
    locations: [locationFinal],
  });
  return deduplicarPorUrl(items);
}

/**
 * `memo23/linkedin-people-search` usa una búsqueda Google/Bing pública.
 *
 * Estrategia de mínimo coste:
 * 1. Buscar UNA sola keyword por llamada (no OR compuesto) — más resultados, más estable.
 * 2. Pre-filtrar por cargo ANTES de enriquecer (ahorra ~80% de créditos del enriquecedor).
 * 3. Usar maxResults: 25 — suficiente para el pre-filtro sin gastar créditos extra.
 * 4. Enriquecer SOLO los candidatos que pasan el pre-filtro ICP.
 *
 * La keyword se recibe ya seleccionada desde buscarProspectosConApify(),
 * que rota por ONLINE_SEARCH_KEYWORDS según el día del año.
 *
 * IMPORTANTE: el parámetro `location` es OBLIGATORIO en memo23. Sin él el actor
 * devuelve run-failed (HTTP 400). Usar el país del ICP como ubicación
 * (Spain, United Kingdom, United States).
 */
async function buscarConMemo23(
  actorId: string,
  token: string,
  keyword: string,
  location: string = 'Spain',
): Promise<ProspectoCrudo[]> {
  console.log(`[Apify] memo23: "${keyword}" en ${location}`);

  const rawItems = await ejecutarActorSync(actorId, token, {
    mode: 'public',
    query: keyword,
    location,
    maxResults: 50,
  });

  const candidatos = deduplicarPorUrl(rawItems);

  // PRE-FILTRO ICP: filtra claramente no-ICP antes del enriquecedor (ahorra créditos)
  const preFiltered = candidatos.filter((p) => esProfesionalOnline(p.cargo, p.bio));
  console.log(`[Apify] Pre-filtro ICP: ${preFiltered.length}/${candidatos.length} pasan`);

  if (preFiltered.length === 0) return [];

  await enriquecerPerfiles(preFiltered, token);
  return preFiltered;
}

/**
 * Post-Centric Scraping: Busca posts directamente usando harvestapi/linkedin-post-search
 * Esto garantiza que el 100% de los resultados tienen un post reciente.
 */
async function buscarProspectosPorPosts(
  actorId: string,
  token: string,
  objetivo: number
): Promise<ProspectoCrudo[]> {
  const keywordsPrincipales = process.env.APIFY_SEARCH_QUERY
    ? process.env.APIFY_SEARCH_QUERY.split(',').map((k) => k.trim()).filter(Boolean)
    : ONLINE_SEARCH_KEYWORDS;
  const keywordsResto = process.env.APIFY_SEARCH_QUERY_GLOBAL
    ? process.env.APIFY_SEARCH_QUERY_GLOBAL.split(',').map((k) => k.trim()).filter(Boolean)
    : ONLINE_SEARCH_KEYWORDS;

  // Rotamos keywords para no buscar todas a la vez y ahorrar costes.
  // 4 keywords × maxPosts posts = pool amplio para filtrar el ICP.
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
  
  const keywordsDisponibles = [...keywordsPrincipales, ...keywordsResto];
  const rotacion = [
    keywordsDisponibles[dayOfYear % keywordsDisponibles.length],
    keywordsDisponibles[(dayOfYear + 1) % keywordsDisponibles.length],
    keywordsDisponibles[(dayOfYear + 2) % keywordsDisponibles.length],
    keywordsDisponibles[(dayOfYear + 3) % keywordsDisponibles.length]
  ];

  console.log(`[Apify] Post-centric rotación del día ${dayOfYear}: ${rotacion.join(', ')}`);
  // Pedimos más posts para compensar los descartes por país/ICP (los países ES/GB tienen menos volumen).
  const maxPosts = Math.max(50, Math.ceil(objetivo * 5));

  // Inyectar modificadores de ubicación para reducir resultados globales (que serían descartados luego)
  const locEspana = process.env.APIFY_LOCATIONS ? process.env.APIFY_LOCATIONS.split(',')[0].trim() : 'Spain';
  const locGlobal = process.env.APIFY_LOCATIONS_GLOBAL ? process.env.APIFY_LOCATIONS_GLOBAL.split(',')[0].trim() : 'United States';
  
  const rotacionConUbicacion = [
    `${rotacion[0]} AND ${locEspana}`,
    `${rotacion[1]} AND ${locEspana}`,
    `${rotacion[2]} AND ${locGlobal}`,
    `${rotacion[3]} AND ${locGlobal}`,
  ];

  const resultados = await Promise.all(
    rotacionConUbicacion.map((keyword) =>
      ejecutarActorSync(actorId, token, {
        searchQueries: [keyword],
        maxPosts,
        datePosted: 'past-month',
      })
    )
  );

  const crudos: ProspectoCrudo[] = [];
  const vistos = new Set<string>();

  for (const item of resultados.flat()) {
    // Soportamos tanto harvestapi como memo23/otros
    const author = item.author || item.authorProfile || {};
    const url = author.linkedinUrl || author.url || item.authorUrl || item.linkedinUrl;
    if (!url || url.includes('/company/')) continue; // ignorar posts de empresa

    const clave = normalizeLinkedInUrl(url);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);

    const postText = (item.text || item.content || item.postContent || '').trim();
    let postDate = null;
    if (typeof item.postedAt === 'object' && item.postedAt?.date) {
      postDate = item.postedAt.date;
    } else {
      postDate = item.publishedAt || item.postedAt || item.date || item.publishedAtISO || null;
    }

    crudos.push({
      nombre: author.fullName || author.name || item.authorName || '',
      url: url.split('?')[0],
      cargo: author.headline || author.jobTitle || author.info || item.authorHeadline || '',
      empresa: author.companyName || '',
      bio: author.headline || author.about || author.info || '',
      ultimoPostTema: postText,
      ultimoPostFecha: postDate,
      ultimoPostUrl: item.linkedinUrl || item.url || '',
      seguidores: author.followers || item.authorFollowers || null,
      ubicacion: ubicacionPerfil(author) || ubicacionPerfil({ location: item.authorLocation }),
      vieneDePost: true,
    });
  }

  console.log(`[Apify] Posts scraper: ${crudos.length} autores únicos encontrados.`);

  // Pre-filtrado ICP rápido con datos del post (cargo/bio del autor).
  // Esto descarta la basura obvia ANTES del enrichment costoso de perfil.
  // Los que no pasan esProspectoValido aquí tienen cargo vacío o claramente no-ICP.
  const preFiltradasICP = crudos.filter((p) => {
    // Si no tiene cargo en el post, no filtramos aún (el enrichment lo completará).
    if (!p.cargo?.trim()) return true;
    // Si tiene cargo y claramente no es ICP, descartamos ya.
    return esProfesionalOnline(p.cargo, p.bio);
  });
  console.log(`[Apify] Tras pre-filtrado ICP por cargo del post: ${preFiltradasICP.length}/${crudos.length} candidatos.`);

  if (preFiltradasICP.length > 0) {
    await enriquecerPerfiles(preFiltradasICP, token);
  }

  // Devolvemos los pre-filtrados (ya enriquecidos). El filtro final esProspectoValido()
  // en prospecting.ts descartará los que tras el enrichment no sean ICP o no tengan país válido.
  return preFiltradasICP;
}

/**
 * Dado un lote de URLs de perfil, devuelve el último post de cada una (si lo tiene): texto y
 * URL directa al post. Usa `harvestapi/linkedin-profile-posts` (sobrescribible con
 * APIFY_POSTS_ACTOR_ID). Nunca lanza: si Apify falla o un perfil no tiene posts, esa URL
 * simplemente no aparece en el mapa devuelto, para no tumbar toda la prospección por un
 * único error de scraping.
 */
export async function buscarUltimosPosts(urls: string[]): Promise<Map<string, { texto: string; url: string; fecha: string | null }>> {
  const resultado = new Map<string, { texto: string; url: string; fecha: string | null }>();
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_POSTS_ACTOR_ID || 'harvestapi/linkedin-profile-posts';
  if (!token || urls.length === 0) return resultado;

  try {
    const items = await ejecutarActorSync(actorId, token, {
      targetUrls: urls,
      maxPosts: 1,
      includeReposts: true,
    });

    for (const item of items) {
      const autorUrl = item.author?.linkedinUrl || item.authorUrl || '';
      const contenido = (item.content || item.text || item.repost?.content || '').trim();
      const postUrl = item.linkedinUrl || item.url || '';
      
      let fecha = null;
      if (typeof item.postedAt === 'object' && item.postedAt?.date) {
        fecha = item.postedAt.date;
      } else {
        fecha = item.publishedAt || item.postedAt || item.date || item.publishedAtISO || null;
      }

      if (!autorUrl || !contenido) continue;
      const clave = normalizeLinkedInUrl(autorUrl);
      if (!resultado.has(clave)) resultado.set(clave, { texto: contenido, url: postUrl, fecha });
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
    ubicacion: ubicacionPerfil(item),
  };
}

