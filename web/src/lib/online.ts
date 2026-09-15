/**
 * online.ts
 * Keywords de búsqueda del ICP y validador de "profesional online B2B".
 *
 * IMPORTANTE — cómo funciona la búsqueda:
 * El sistema pasa CADA keyword de ONLINE_SEARCH_KEYWORDS como una búsqueda SEPARADA
 * al actor memo23/linkedin-people-search. No se usan consultas OR compuestas porque
 * son inestables con el motor de búsqueda subyacente (Google/Bing) y retornan menos
 * resultados. Cada keyword debe ser un término exacto de título LinkedIn de tu ICP.
 *
 * esProfesionalOnline() filtra perfiles ANTES de enriquecerlos (ahorro de créditos).
 * Solo pasan al enriquecedor los perfiles cuyo cargo/bio ya sugiere ser ICP.
 */

/**
 * Pool de keywords de búsqueda ICP. El sistema rota por este array, usando 1 keyword
 * por búsqueda para maximizar resultados. Deben ser cargos/títulos exactos de LinkedIn.
 */
export const ONLINE_SEARCH_KEYWORDS = [
  'consultor SEO',
  'growth partner',
  'copywriter B2B',
  'ghostwriter LinkedIn',
  'creative strategist',
  'performance marketing',
  'consultor marca personal',
  'ads specialist',
  'infoproductos',
  'coach online',
  'SaaS founder',
  'fractional CMO',
  'consultor digital',
  'growth hacking',
];

/**
 * Determina si un perfil encaja con el ICP "Independiente B2B High-Ticket Digital".
 *
 * Diseñado para usarse ANTES del enriquecimiento de perfil (pre-filtro barato).
 * Es deliberadamente permisivo cuando el cargo está vacío (no hay datos aún) y
 * estricto solo cuando hay cargo/bio claros que indican servicio físico o no-ICP.
 *
 * Lógica:
 * 1. Si cargo vacío → pasar (el enriquecedor lo completará luego)
 * 2. Si cargo tiene una palabra de rol B2B/digital → pasar
 * 3. Si bio o cargo indica servicio físico → descartar
 * 4. Si cargo indica negocio claramente offline (dentista, construcción...) → descartar
 */
export function esProfesionalOnline(
  cargo: string | null | undefined,
  bio: string | null | undefined,
): boolean {
  const title = normalizar(cargo);
  const bioNorm = normalizar(bio);
  const fullText = `${title} ${bioNorm}`;

  // Si no hay cargo, dejamos pasar para que el enriquecedor lo rellene
  if (!title.trim()) return true;

  // Indicadores de servicios físicos/presenciales — descarte inmediato
  const physical =
    /\b(in person|on site|onsite|presencial|hibrid[oa]|hybrid|brick and mortar|physical (?:store|shop|clinic)|tienda fisica|restaurant(?:e)?|dentist(?:a)?|realtor|inmobiliari[oa]|construction|construcci[oó]n|salon|peluquer[ií]a|taller|mechanic|m[eé]canic[ao]|fontaner[ao]|electricista|plumber)\b/;
  if (physical.test(fullText)) return false;

  // Negaciones explícitas de digital (ej: "no soy consultor online")
  const negated =
    /\b(not|no|never|sin)\s+(?:an?\s+)?(?:online|remote|remoto|digital)\b/;
  if (negated.test(fullText)) return false;

  // === Roles B2B digitales nativos ===
  // Cualquiera de estos términos en el cargo es suficiente para pasar
  const digitalNativeInTitle =
    /\b(seo|sem|growth|growth\s+partner|growth\s+hack(?:ing|er)?|ads|ppc|paid\s+(?:media|social)|copywriter|copy(?:writing)?|ghostwriter|creative\s+strategist|conversion|contenido|content\s+(?:creator|strategist|writer)|marca\s+personal|personal\s+brand|performance\s+marketing|infoproducto|coach\s+online|online\s+coach|saas|software\s+as\s+a\s+service|fractional|cmo|cto|cpo|product\s+(?:manager|owner)|marketing\s+digital|digital\s+marketing|ecommerce|e-commerce|d2c|direct\s+to\s+consumer|funnel|email\s+marketing|marketing\s+automat|linkedin\s+(?:coach|expert|trainer)|social\s+selling|outbound|inbound|revenue\s+operat|demand\s+gen)\b/;

  if (digitalNativeInTitle.test(title)) return true;

  // === Roles genéricos que necesitan contexto digital ===
  const genericRole =
    /\b(founder|cofounder|co-?founder|owner|ceo|fundador[a]?|cofundador[a]?|due[nñ][oa]|propietari[oa]|aut[oó]nom[oa]|freelanc(?:e|er)|independiente|self.?employed|consultant|consultor[a]?|coach|developer|desarrollador[a]?|engineer|ingenier[oa]|designer|dise[nñ]ador[a]?|marketer|specialist|especialista|experto[a]?|strategist|estratega|director[a]?|manager|partner|profesional|professional|agencia|agency)\b/;

  if (!genericRole.test(title)) return false;

  // El rol genérico necesita señal digital en título o bio
  const digitalContext =
    /\b(online|digital|remote|remot[oa]|saas|software|app|platform|plataforma|virtual|web|internet|ecommerce|e-commerce|d2c|marketing|growth|seo|sem|ads|content|contenido|copy|funnel|automation|autom(?:aci[oó]n|atizaci[oó]n)|linkedin|social\s+media|redes\s+sociales|b2b|infoproducto|curso|mentor[ií]a|programa\s+online|negocio\s+online)\b/;

  return digitalContext.test(fullText);
}

function normalizar(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
