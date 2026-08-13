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
 */
import { PROSPECTOS_POR_DIA, SCORE_KEYWORDS } from './config';
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
