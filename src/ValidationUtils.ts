/**
 * ValidationUtils.ts
 * "Hiper validación" local de un prospecto antes de dejarlo entrar a la cola: formato de URL
 * de LinkedIn correcto y campos mínimos presentes. No visita el perfil (visitar perfiles de
 * forma automática es justo el tipo de actividad que puede hacer saltar las alarmas de
 * LinkedIn), así que esto es una validación de forma/completitud, no de "el perfil existe".
 */

function esUrlLinkedInValida(url: string): boolean {
  return LINKEDIN_URL_REGEX.test((url || '').trim());
}

function esProspectoValido(p: ProspectoCrudo): boolean {
  return Boolean(p.nombre && p.nombre.trim() && p.cargo && p.cargo.trim() && esUrlLinkedInValida(p.url));
}
