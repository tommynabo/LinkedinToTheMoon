/**
 * elevenlabs.ts
 * Genera audio con tu voz clonada (Text-to-Speech) y lo sube a Vercel Blob.
 */
import { subirArchivo } from './blob';

export function tieneAudioHabilitado(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

/** Convierte un texto en audio (mp3) usando tu Voice ID de ElevenLabs y lo sube a Blob. */
export async function generarAudioPersonalizado(texto: string, nombreArchivo: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error('Faltan ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en Vercel.');
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': apiKey,
      accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: texto,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.65, similarity_boost: 0.8 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Error llamando a ElevenLabs (HTTP ${response.status}): ${await response.text()}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return subirArchivo(`audios/${nombreArchivo}.mp3`, Buffer.from(arrayBuffer), 'audio/mpeg');
}
