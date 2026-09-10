/** Conservative qualification from profile facts, never from the topic of a post.
 * A digital keyword alone does not prove an exclusively online business.
 */
export const ONLINE_SEARCH_KEYWORDS = [
  'online business founder', 'SaaS founder', 'online consultant',
  'consultor online', 'agencia 100% online', 'digital product founder',
  'freelance remote developer', 'online coach',
];

export function esProfesionalOnline(cargo: string | null | undefined, bio: string | null | undefined): boolean {
  const title = normalizar(cargo);
  const text = `${title} ${normalizar(bio)}`;
  const role = /\b(founder|cofounder|co founder|owner|ceo|fundador[a]?|cofundador[a]?|duen[oa]|propietari[oa]|autonom[oa]|freelanc(?:e|er)|independiente|self employed|consultant|consultor[a]?|coach|developer|desarrollador[a]?|engineer|ingenier[oa]|designer|disenador[a]?|copywriter|marketer|specialist|especialista|strategist|estratega|director[a]?|manager|partner|profesional|professional)\b/;
  const physical = /\b(in person|on site|onsite|presencial|hibrid[oa]|hybrid|brick and mortar|physical (?:store|shop|clinic)|tienda fisica|restaurant|restaurante|dentist|dentista|realtor|inmobiliari[oa]|construction|construccion|salon|peluqueria)\b/;
  const negated = /\b(not|no|never|sin)\s+(?:an?\s+)?(?:online|remote|remoto|digital)\b/;
  const explicit = /\b(?:100\s*%\s*(?:online|digital|remote|remot[oa])|(?:fully|exclusively|entirely|only|exclusivamente|totalmente|solo)\s+(?:online|remote|remot[oa]|digital)|online only|remote only|negocio(?:s)? online|online business|online consult(?:ant|ing)|consultor[a]? online|online coach(?:ing)?|coach(?:ing)? online)\b/;
  // Intrinsically digital products, with professional context in the title.
  const native = /\b(saas|software as a service|digital products?|productos? digitales?|infoproductos?)\b/;
  const remoteService = /\b(remote|remot[oa])\b/.test(title)
    && /\b(developer|desarrollador[a]?|software|copywriter|designer|disenador[a]?|consultant|consultor[a]?)\b/.test(title);
  return role.test(title) && !physical.test(text) && !negated.test(text)
    && (explicit.test(text) || native.test(title) || remoteService);
}

function normalizar(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
}
