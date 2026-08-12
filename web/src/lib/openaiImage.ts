/**
 * openaiImage.ts
 * Genera una imagen de portada opcional para el post del día (OpenAI Images API) y la sube
 * a Vercel Blob. Si no hay OPENAI_API_KEY configurada, el motor de contenido omite este paso.
 */
import { subirArchivo } from './blob';
import { DEFAULT_OPENAI_IMAGE_MODEL, type ContentPillar } from './config';

export function tieneImagenHabilitada(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

interface OpenAIImageResponse {
  data: { b64_json?: string; url?: string }[];
}

export async function generarImagenParaPost(promptVisual: string, nombreArchivo: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Falta OPENAI_API_KEY en Vercel.');
  }
  const model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_OPENAI_IMAGE_MODEL;

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, prompt: promptVisual, size: '1024x1024', n: 1 }),
  });

  if (!response.ok) {
    throw new Error(`Error llamando a la API de imágenes (HTTP ${response.status}): ${await response.text()}`);
  }

  const parsed = (await response.json()) as OpenAIImageResponse;
  const item = parsed.data?.[0];
  if (!item) {
    throw new Error('La API de imágenes no devolvió ningún resultado.');
  }

  if (item.b64_json) {
    return subirArchivo(`imagenes/${nombreArchivo}.png`, Buffer.from(item.b64_json, 'base64'), 'image/png');
  }
  if (item.url) {
    const imgResponse = await fetch(item.url);
    const arrayBuffer = await imgResponse.arrayBuffer();
    return subirArchivo(`imagenes/${nombreArchivo}.png`, Buffer.from(arrayBuffer), 'image/png');
  }
  throw new Error('La respuesta de la API de imágenes no trae ni b64_json ni url.');
}

/** Construye un prompt visual simple a partir del pilar y el hook ganador. */
export function construirPromptVisual(pilar: ContentPillar, hook: string): string {
  return `Professional, clean, modern flat-design illustration for a LinkedIn post about: "${hook}". Theme: ${pilar.nombre}. No text, no logos, minimalist, soft corporate color palette.`;
}
