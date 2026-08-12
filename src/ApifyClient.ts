/**
 * ApifyClient.ts
 * Automatiza la busqueda de prospectos vía un actor de Apify (fuente recomendada en la
 * seccion 5.1 del PDF junto a Sales Navigator). El esquema de salida depende del actor
 * concreto que uses, así que normalizeApifyItem() acepta varios nombres de campo habituales;
 * ajústalo si tu actor devuelve nombres distintos.
 */

function getApifyConfig(): { token: string; actorId: string } | null {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(PROPERTY_KEYS.APIFY_API_TOKEN);
  const actorId = props.getProperty(PROPERTY_KEYS.APIFY_ACTOR_ID);
  if (!token || !actorId) return null;
  return { token, actorId };
}

/** Lanza el actor de Apify de forma síncrona y devuelve los items normalizados. */
function buscarProspectosConApify(): ProspectoCrudo[] {
  const config = getApifyConfig();
  if (!config) return [];

  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(
    config.actorId
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(config.token)}`;

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({}),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`Error llamando a Apify (HTTP ${code}): ${response.getContentText()}`);
  }

  const items = JSON.parse(response.getContentText()) as Record<string, any>[];
  return items.map(normalizeApifyItem);
}

function normalizeApifyItem(item: Record<string, any>): ProspectoCrudo {
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
