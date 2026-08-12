/**
 * ImageClient.ts
 * Genera una imagen de portada opcional para el post del día (OpenAI Images API) y la guarda
 * en Drive. Si no hay OPENAI_API_KEY configurada, el motor de contenido simplemente omite
 * este paso (igual que ElevenLabs es opcional para el audio).
 */

function tieneImagenHabilitada(): boolean {
  return Boolean(PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.OPENAI_API_KEY));
}

/** Genera una imagen a partir de un prompt visual y devuelve la URL del archivo en Drive. */
function generarImagenParaPost(promptVisual: string, nombreArchivo: string): string {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty(PROPERTY_KEYS.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error('Falta OPENAI_API_KEY. Configúrala desde el menú "⚙️ Configurar claves API".');
  }
  const model = props.getProperty(PROPERTY_KEYS.OPENAI_IMAGE_MODEL) || DEFAULT_OPENAI_IMAGE_MODEL;

  const payload = {
    model: model,
    prompt: promptVisual,
    size: '1024x1024',
    n: 1,
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/images/generations', options);
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`Error llamando a la API de imágenes (HTTP ${code}): ${response.getContentText()}`);
  }

  const parsed = JSON.parse(response.getContentText()) as { data: { b64_json?: string; url?: string }[] };
  const item = parsed.data && parsed.data[0];
  if (!item) {
    throw new Error('La API de imágenes no devolvió ningún resultado.');
  }

  const folder = getOrCreateNamedFolder('LinkedIn to the Moon - Imágenes', PROPERTY_KEYS.DRIVE_IMAGE_FOLDER_ID);
  let blob: GoogleAppsScript.Base.Blob;

  if (item.b64_json) {
    blob = Utilities.newBlob(Utilities.base64Decode(item.b64_json), 'image/png', `${nombreArchivo}.png`);
  } else if (item.url) {
    blob = UrlFetchApp.fetch(item.url).getBlob().setName(`${nombreArchivo}.png`);
  } else {
    throw new Error('La respuesta de la API de imágenes no trae ni b64_json ni url.');
  }

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/** Construye un prompt visual simple a partir del pilar y el hook ganador (idioma neutro). */
function construirPromptVisual(pilar: ContentPillar, hook: string): string {
  return `Professional, clean, modern flat-design illustration for a LinkedIn post about: "${hook}". Theme: ${pilar.nombre}. No text, no logos, minimalist, soft corporate color palette.`;
}
