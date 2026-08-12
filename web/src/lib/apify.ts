/**
 * apify.ts
 * Automatiza la búsqueda de prospectos vía un actor de Apify. El esquema de salida depende
 * del actor concreto que uses, así que normalizarItem() acepta varios nombres de campo
 * habituales; ajústalo si tu actor devuelve nombres distintos.
 */
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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Error llamando a Apify (HTTP ${response.status}): ${await response.text()}`);
  }

  const items = (await response.json()) as Record<string, any>[];
  return items.map(normalizarItem);
}

function normalizarItem(item: Record<string, any>): ProspectoCrudo {
  return {
    nombre: item.fullName || item.name || item.nombre || '',
    url: item.profileUrl || item.url || item.linkedinUrl || '',
    cargo: item.headline || item.jobTitle || item.cargo || '',
    empresa: item.companyName || item.company || item.empresa || '',
    bio: item.bio || item.about || item.headline || '',
    ultimoPostTema: item.lastPostTopic || item.lastPostText || '',
    ultimoPostFecha: item.lastPostDate || null,
    seguidores: typeof item.followers === 'number' ? item.followers : null,
  };
}
