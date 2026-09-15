/**
 * validation.ts
 * "Hiper validación" local de un prospecto antes de dejarlo entrar a la cola: formato de URL
 * de LinkedIn correcto y campos mínimos presentes. No visita el perfil en vivo (visitar
 * perfiles de forma automática es justo el tipo de actividad que hace saltar las alarmas
 * anti-bot de LinkedIn), así que esto valida forma/completitud, no "el perfil existe".
 */
import { LINKEDIN_URL_REGEX, BLACKLIST_KEYWORDS } from './config';
import { esProfesionalOnline } from './online';
import { paisPermitido } from './geography';
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

/** Validación estricta para INSERTAR un prospecto nuevo: ICP online obligatorio, país opcional. */
export function esProspectoValido(p: ProspectoCrudo): boolean {
  if (!p.nombre?.trim() || !esUrlLinkedInValida(p.url)) {
    return false;
  }

  // Cargo es necesario para validar el ICP
  if (!p.cargo?.trim()) return false;

  // Si hay ubicación explícita, debe ser un país permitido (ES/GB/US/CA).
  // Si la ubicación está vacía (el enriquecedor falló o el perfil no la tiene),
  // dejamos pasar — se guardará con pais=NULL y la UI lo mostrará igualmente.
  if (p.ubicacion?.trim()) {
    const pais = paisPermitido(p.ubicacion);
    if (pais === null) return false; // país explícito no permitido → descartar
  }

  const textToSearch = `${p.cargo} ${p.bio || ''}`.toLowerCase();
  if (BLACKLIST_KEYWORDS.some((kw) => textToSearch.includes(kw))) {
    return false;
  }

  return esProfesionalOnline(p.cargo, p.bio);
}


/**
 * Validación ligera para rows YA GUARDADAS en BD (cambios de estado, display, outreach).
 * Solo verifica que los campos estructurales mínimos están presentes (nombre, url, cargo).
 * No re-valida el país porque ya se comprobó en esProspectoValido() al insertar:
 * los leads del actor de posts pueden tener pais=NULL y seguir siendo válidos ICP.
 */
export function esFilaProspectoValida(row: {
  nombre: string; url_perfil: string; cargo: string | null;
  dato_personalizado: string | null; ubicacion?: string | null;
}): boolean {
  return Boolean(
    row.nombre?.trim() &&
    esUrlLinkedInValida(row.url_perfil) &&
    row.cargo?.trim()
  );
}
