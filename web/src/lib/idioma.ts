/**
 * idioma.ts
 * Heurística barata (sin dependencias ni llamadas a Claude) para clasificar el idioma
 * aproximado de un texto corto (cargo/bio de un candidato), usada solo para priorizar y
 * filtrar en engines/prospecting.ts. NO se usa para la personalización final: eso lo decide
 * Claude leyendo el perfil real (ver engines/personalization.ts).
 */

const MARCADORES_EXCLUSIVOS_PT = /\b(não|nao|você|voce|então|entao|obrigad[oa]|também|tambem|ções|ção)\b/gi;

const MARCADORES: Record<'es' | 'en' | 'fr', RegExp> = {
  es: /\b(qué|que|cómo|como|más|mas|también|tambien|años|trabajo|empresa|muy|así|asi|hola|gracias|sí|porque|con|los|las|una|estás|estoy|ayudo|ayudar)\b/gi,
  en: /\b(the|and|with|you|your|are|for|this|that|have|help|working|business|leader|coach)\b/gi,
  fr: /\b(vous|nous|avec|pour|dans|les|des|être|leur|leurs|votre|notre|coach|entreprise)\b/gi,
};

/** Clasificación aproximada: 'es' | 'pt' | 'en' | 'fr' | 'otro'. No es exacta, es heurística. */
export function detectarIdiomaAprox(texto: string): 'es' | 'pt' | 'en' | 'fr' | 'otro' {
  const t = (texto || '').toLowerCase().trim();
  if (!t) return 'otro';

  // "es" y "pt" comparten muchas palabras (empresa, está...); si aparece algún marcador
  // EXCLUSIVO de portugués, se clasifica como "pt" con prioridad, porque el pedido es
  // excluir portugués/brasileño por completo, no solo deprimirlo en el ranking.
  if ((t.match(MARCADORES_EXCLUSIVOS_PT) || []).length > 0) return 'pt';

  const puntuaciones = Object.entries(MARCADORES).map(
    ([idioma, regex]) => [idioma, (t.match(regex) || []).length] as const
  );
  const [idiomaTop, puntuacionTop] = puntuaciones.sort((a, b) => b[1] - a[1])[0];
  if (puntuacionTop === 0) return 'otro';
  return idiomaTop as 'es' | 'en' | 'fr';
}

const SUBDOMINIO_ESPANA = /:\/\/es\.linkedin\.com\//i;
const SUBDOMINIO_OTRO_PAIS = /:\/\/([a-z]{2})\.linkedin\.com\//i;
const MARCADORES_ESPANA =
  /\b(espa[nñ]a|spain|madrid|barcelona|valencia|sevilla|bilbao|zaragoza|m[aá]laga|murcia|palma de mallorca|valladolid|vigo|gij[oó]n|a coru[nñ]a|alicante|c[oó]rdoba)\b/i;

/**
 * Heurística barata para decidir si un prospecto es de España específicamente (no solo
 * hispanohablante en general). Señal principal: el subdominio de país en la URL de LinkedIn
 * (es.linkedin.com); si la URL trae el subdominio de OTRO país (ar., mx., co., br., uk...)
 * se descarta España sin mirar el texto, por ser una señal más fiable que las palabras. Si
 * la URL no trae subdominio de país (www./sin subdominio), cae a buscar España/ciudades
 * españolas en el texto (cargo+bio).
 */
export function esDeEspana(url: string, texto: string): boolean {
  if (SUBDOMINIO_ESPANA.test(url || '')) return true;
  const otroPais = (url || '').match(SUBDOMINIO_OTRO_PAIS);
  if (otroPais && otroPais[1].toLowerCase() !== 'es') return false;
  return MARCADORES_ESPANA.test(texto || '');
}
