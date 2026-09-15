import { BANNED_AI_PHRASES } from './voice';

export interface DraftToValidate {
  hookA: string;
  hookB: string;
  hookC: string;
  desarrollo: string;
}

export interface BriefFact {
  afirmacion: string;
  numeros?: string[];
}

export interface ValidationContext {
  allowedSourceUrls: string[];
  facts: BriefFact[];
}

export function validateDraft(draft: DraftToValidate, context: ValidationContext): string[] {
  const errors: string[] = [];
  const hooks = [draft.hookA, draft.hookB, draft.hookC].map((hook) => hook.trim());
  if (hooks.some((hook) => !hook)) errors.push('Falta al menos uno de los tres hooks.');
  if (hooks.some((hook) => hook.split(/\s+/).length > 18)) errors.push('Un hook supera las 18 palabras.');

  const text = draft.desarrollo.trim();
  const blocks = text.split(/\n\s*\n/).filter(Boolean);
  if (blocks.length > 40) errors.push('El post no puede tener más de 40 bloques legibles.');
  if (blocks.some((block) => block.split(/(?<=[.!?])\s+/).length > 4)) errors.push('Hay un bloque con más de cuatro frases.');

  const normalized = text.toLocaleLowerCase('es-ES');
  const banned = BANNED_AI_PHRASES.find((phrase) => normalized.includes(phrase));
  if (banned) errors.push(`Contiene el cliché de IA: "${banned}".`);

  const urls = text.match(/https?:\/\/[^\s)]+/g) || [];
  const unknownUrl = urls.find((url) => !context.allowedSourceUrls.includes(url));
  if (unknownUrl) errors.push(`Incluye una URL no presente en las fuentes: ${unknownUrl}`);

  const allowedNumbers = new Set(context.facts.flatMap((fact) => fact.numeros || []));
  const textWithoutListMarkers = text.replace(/^\s*\d+[.)]\s+/gm, '');
  const numbers = textWithoutListMarkers.match(/\b\d+(?:[.,]\d+)?\s?(?:%|millones|mil|€|\$)/g) || [];
  const unsupportedNumber = numbers.find((number) => !allowedNumbers.has(number));
  if (unsupportedNumber) errors.push(`Incluye una cifra no aprobada en el brief: ${unsupportedNumber}`);

  return errors;
}