/**
 * claude.ts
 * Wrapper mínimo sobre la API de Mensajes de Anthropic (Claude) usando fetch nativo.
 */
import { DEFAULT_CLAUDE_MODEL } from './config';

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
}

function getApiKeyOrThrow(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY en Vercel.');
  }
  return key;
}

/**
 * Llama a Claude con un prompt de usuario y devuelve el primer bloque de texto de la
 * respuesta. No asumimos que content[0] sea texto: Claude puede devolver otros tipos de
 * bloque primero.
 */
export async function callClaude(prompt: string, maxTokens = 1024): Promise<string> {
  const apiKey = getApiKeyOrThrow();
  const model = process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Error llamando a Claude (HTTP ${response.status}): ${body}`);
  }

  const parsed = JSON.parse(body) as ClaudeResponse;
  const textBlock = (parsed.content || []).find((b) => b.type === 'text' && typeof b.text === 'string');

  if (!textBlock?.text) {
    const tiposRecibidos = (parsed.content || []).map((b) => b.type).join(', ') || 'ninguno';
    throw new Error(`Claude no devolvió ningún bloque de texto. Tipos recibidos: ${tiposRecibidos}`);
  }

  return textBlock.text;
}

/** Igual que callClaude, pero intenta parsear la respuesta como JSON (para salidas estructuradas). */
export async function callClaudeJSON<T>(prompt: string, maxTokens = 1024): Promise<T> {
  const text = await callClaude(prompt, maxTokens);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No se encontró JSON en la respuesta de Claude:\n${text}`);
  }
  return JSON.parse(match[0]) as T;
}
