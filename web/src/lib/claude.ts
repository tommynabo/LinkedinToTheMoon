/**
 * claude.ts
 * Wrapper mínimo sobre la API de Mensajes de Anthropic (Claude) usando fetch nativo.
 */
import { DEFAULT_CLAUDE_MODEL, DEFAULT_CONTENT_CLAUDE_MODEL } from './config';
import type { EditorialSource } from './types';

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason?: string;
}

interface ClaudeWebSearchResult extends ClaudeContentBlock {
  content?: Array<{ title: string; url: string; page_age?: string | null }> | { error_code?: string };
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
async function requestClaude(payload: Record<string, unknown>): Promise<ClaudeResponse> {
  const apiKey = getApiKeyOrThrow();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Error llamando a Claude (HTTP ${response.status}): ${body}`);
  }

  return JSON.parse(body) as ClaudeResponse;
}

export async function callClaude(prompt: string, maxTokens = 1024, model = process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL): Promise<string> {
  const parsed = await requestClaude({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = (parsed.content || []).find((b) => b.type === 'text' && typeof b.text === 'string');

  if (!textBlock?.text) {
    const tiposRecibidos = (parsed.content || []).map((b) => b.type).join(', ') || 'ninguno';
    throw new Error(`Claude no devolvió ningún bloque de texto. Tipos recibidos: ${tiposRecibidos}`);
  }

  return textBlock.text;
}

/** Igual que callClaude, pero intenta parsear la respuesta como JSON (para salidas estructuradas). */
export async function callClaudeJSON<T>(prompt: string, maxTokens = 1024, model?: string): Promise<T> {
  const text = await callClaude(prompt, maxTokens, model);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No se encontró JSON en la respuesta de Claude:\n${text}`);
  }
  return JSON.parse(match[0]) as T;
}

export async function callClaudeJSONWithWebSearch<T>(prompt: string, maxTokens = 2048): Promise<{ value: T; sources: EditorialSource[] }> {
  const model = process.env.CONTENT_CLAUDE_MODEL || DEFAULT_CONTENT_CLAUDE_MODEL;
  const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [{ role: 'user', content: prompt }];
  let parsed = await requestClaude({
    model,
    max_tokens: maxTokens,
    messages,
    tools: [{
      type: 'web_search_20260318',
      name: 'web_search',
      max_uses: 3,
      allowed_callers: ['direct'],
      user_location: { type: 'approximate', country: 'ES', timezone: 'Europe/Madrid' },
    }],
  });

  if (parsed.stop_reason === 'pause_turn') {
    messages.push({ role: 'assistant', content: parsed.content });
    parsed = await requestClaude({
      model,
      max_tokens: maxTokens,
      messages,
      tools: [{ type: 'web_search_20260318', name: 'web_search', max_uses: 3, allowed_callers: ['direct'] }],
    });
  }

  const searchBlocks = parsed.content.filter((block) => block.type === 'web_search_tool_result') as ClaudeWebSearchResult[];
  const searchError = searchBlocks.find((block) => block.content && !Array.isArray(block.content));
  if (searchError) throw new Error(`La búsqueda web de Claude falló: ${searchError.content && !Array.isArray(searchError.content) ? searchError.content.error_code || 'error desconocido' : 'error desconocido'}`);

  const sources = searchBlocks.flatMap((block) => Array.isArray(block.content)
    ? block.content.map((result) => ({ titulo: result.title, url: result.url, fecha: result.page_age || null }))
    : []);
  const text = parsed.content.filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Claude no devolvió el brief JSON esperado: ${text}`);

  return { value: JSON.parse(match[0]) as T, sources };
}
