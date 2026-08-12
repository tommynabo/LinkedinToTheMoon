/**
 * ElevenLabsClient.ts
 * Genera audio con tu voz clonada (Text-to-Speech) y lo guarda en Drive.
 */

function getElevenLabsConfigOrThrow(): { apiKey: string; voiceId: string } {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty(PROPERTY_KEYS.ELEVENLABS_API_KEY);
  const voiceId = props.getProperty(PROPERTY_KEYS.ELEVENLABS_VOICE_ID);
  if (!apiKey || !voiceId) {
    throw new Error(
      'Falta ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID. Configúralos desde el menú "⚙️ Configurar claves API".'
    );
  }
  return { apiKey, voiceId };
}

/**
 * Convierte un texto en audio (mp3) usando tu Voice ID de ElevenLabs y lo guarda en la carpeta
 * de Drive configurada. Devuelve la URL compartible del archivo.
 */
function generarAudioPersonalizado(texto: string, nombreArchivo: string): string {
  const { apiKey, voiceId } = getElevenLabsConfigOrThrow();

  const payload = {
    text: texto,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.65,
      similarity_boost: 0.8,
    },
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, options);
  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    throw new Error(`Error llamando a ElevenLabs (HTTP ${code}): ${response.getContentText()}`);
  }

  const blob = response.getBlob().setName(`${nombreArchivo}.mp3`);
  const folder = getAudioFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}

function getAudioFolder(): GoogleAppsScript.Drive.Folder {
  return getOrCreateNamedFolder('LinkedIn to the Moon - Audios', PROPERTY_KEYS.DRIVE_AUDIO_FOLDER_ID);
}
