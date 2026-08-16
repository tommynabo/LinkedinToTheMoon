/**
 * validation.ts
 * "Hiper validación" local de un prospecto antes de dejarlo entrar a la cola: formato de URL
 * de LinkedIn correcto y campos mínimos presentes. No visita el perfil en vivo (visitar
 * perfiles de forma automática es justo el tipo de actividad que hace saltar las alarmas
 * anti-bot de LinkedIn), así que esto valida forma/completitud, no "el perfil existe".
 */
import { LINKEDIN_URL_REGEX, BLACKLIST_KEYWORDS } from './config';
import type { ProspectoCrudo } from './types';

export function normalizeLinkedInUrl(url: string): string {
  if (!url) return '';
  return url
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^([a-z]{2}|www)\./, '');
}

export function esUrlLinkedInValida(url: string): boolean {
  return LINKEDIN_URL_REGEX.test((url || '').trim());
}

export function esProspectoValido(p: ProspectoCrudo): boolean {
  if (!p.nombre?.trim() || !p.cargo?.trim() || !esUrlLinkedInValida(p.url)) {
    return false;
  }

  const textToSearch = `${p.cargo} ${p.bio || ''}`.toLowerCase();
  if (BLACKLIST_KEYWORDS.some((kw) => textToSearch.includes(kw))) {
    return false;
  }

  return true;
}
