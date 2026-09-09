/** Only explicit profile location counts; never infer residence from names, bios or language. */
export type PaisPermitido = 'ES' | 'GB' | 'US' | 'CA';
export const PAISES_BUSQUEDA = ['Spain', 'United Kingdom', 'United States', 'Canada'];
const aliases: Record<string, PaisPermitido> = {
  es: 'ES', esp: 'ES', spain: 'ES', espana: 'ES', espanya: 'ES',
  gb: 'GB', gbr: 'GB', uk: 'GB', 'united kingdom': 'GB', 'reino unido': 'GB',
  'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US',
  'estados unidos': 'US', 'ee uu': 'US',
  ca: 'CA', can: 'CA', canada: 'CA',
};

export function paisPermitido(ubicacion: unknown): PaisPermitido | null {
  if (typeof ubicacion !== 'string') return null;
  const texto = ubicacion.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  // Require a whole country or the final comma-separated country, not a substring.
  // City-only locations and ambiguous free text fail closed (e.g. London, Ontario).
  const pais = texto.split(',').at(-1)?.trim() || '';
  // CA after a city may mean California; require the full country there.
  if (texto.includes(',') && ['ca', 'can'].includes(pais)) return null;
  return aliases[pais] || null;
}

/** Support string and structured location payloads without coercing objects to strings. */
export function ubicacionPerfil(perfil: Record<string, any>): string {
  const location = perfil.location || perfil.geoLocation || perfil.address;
  const country = perfil.countryCode || perfil.country || location?.countryCode || location?.country;
  if (typeof country === 'string' && country.trim()) return country.trim();
  if (country && typeof country === 'object') {
    const value = country.code || country.name;
    if (typeof value === 'string') return value;
  }
  if (typeof location === 'string') return location;
  if (location && typeof location === 'object') {
    const value = location.parsed?.country || location.linkedinText || location.name || location.text;
    if (typeof value === 'string') return value;
  }
  return '';
}
