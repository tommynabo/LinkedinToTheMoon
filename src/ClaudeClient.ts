/**
 * ClaudeClient.ts
 * Wrapper minimo sobre la API de Mensajes de Anthropic (Claude) usando UrlFetchApp.
 * La clave nunca se hardcodea: se lee de Script Properties (ver Settings.ts).
 */

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
}

function getClaudeApiKeyOrThrow(): string {
  const key = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.CLAUDE_API_KEY);
  if (!key) {
    throw new Error('Falta CLAUDE_API_KEY. Configúrala desde el menú "⚙️ Configurar claves API".');
  }
  return key;
}

/**
 * Llama a Claude con un prompt de usuario y devuelve el primer bloque de texto de la respuesta.
 * No asumimos que content[0] sea texto: Claude puede devolver otros tipos de bloque primero.
 */
function callClaude(prompt: string, maxTokens: number = 1024): string {
  const apiKey = getClaudeApiKeyOrThrow();
  const model =
    PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.CLAUDE_MODEL) || DEFAULT_CLAUDE_MODEL;

  const payload = {
    model: model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(`Error llamando a Claude (HTTP ${code}): ${body}`);
  }

  const parsed = JSON.parse(body) as ClaudeResponse;
  const textBlock = (parsed.content || []).find((b) => b.type === 'text' && typeof b.text === 'string');

  if (!textBlock || !textBlock.text) {
    const tiposRecibidos = (parsed.content || []).map((b) => b.type).join(', ') || 'ninguno';
    throw new Error(`Claude no devolvió ningún bloque de texto. Tipos recibidos: ${tiposRecibidos}`);
  }

  return textBlock.text;
}

/** Igual que callClaude, pero intenta parsear la respuesta como JSON (para salidas estructuradas). */
function callClaudeJSON<T>(prompt: string, maxTokens: number = 1024): T {
  const text = callClaude(prompt, maxTokens);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No se encontró JSON en la respuesta de Claude:\n${text}`);
  }
  return JSON.parse(match[0]) as T;
}
