/**
 * ScoringUtils.ts
 * Puntuacion automatica de prospectos (seccion 5.2 del PDF).
 */

interface ProspectoCrudo {
  nombre: string;
  url: string;
  cargo: string;
  empresa: string;
  bio: string;
  ultimoPostTema: string;
  ultimoPostFecha: string | Date | null;
  seguidores: number | null;
}

function calcularScore(p: ProspectoCrudo, urlsEnCRM: Set<string>): number {
  let score = 0;
  const bioLower = (p.bio || '').toLowerCase();

  if (SCORE_KEYWORDS.some((k) => bioLower.includes(k))) {
    score += SCORE_RULES.BIO_KEYWORDS;
  }

  if (p.ultimoPostFecha) {
    const fecha = p.ultimoPostFecha instanceof Date ? p.ultimoPostFecha : new Date(p.ultimoPostFecha);
    const dias = (Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24);
    if (!isNaN(dias) && dias <= 14) {
      score += SCORE_RULES.ACTIVO_14_DIAS;
    }
  }

  if (p.seguidores !== null && p.seguidores >= 1000 && p.seguidores <= 20000) {
    score += SCORE_RULES.SEGUIDORES_RANGO;
  }

  if (PROGRAMA_KEYWORDS.some((k) => bioLower.includes(k))) {
    score += SCORE_RULES.VENDE_PROGRAMAS;
  }

  if (urlsEnCRM.has(normalizeLinkedInUrl(p.url))) {
    score += SCORE_RULES.YA_EN_CRM;
  }

  return score;
}

/** Normaliza una URL de LinkedIn para poder comparar/deduplicar de forma fiable. */
function normalizeLinkedInUrl(url: string): string {
  if (!url) return '';
  return url.trim().toLowerCase().replace(/\/+$/, '').replace(/^https?:\/\//, '').replace(/^www\./, '');
}

/** Construye el set de URLs ya conocidas (CRM + Prospectos actuales) para deduplicar. */
function getUrlsConocidas(): Set<string> {
  const urls = new Set<string>();
  for (const nombreHoja of [SHEETS.CRM, SHEETS.PROSPECTOS, SHEETS.HISTORICO_URLS]) {
    const sheet = getSpreadsheet().getSheetByName(nombreHoja);
    if (!sheet) continue;
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) continue;
    const headers = values[0].map((h) => String(h).trim());
    const urlIdx = headers.indexOf('URL perfil');
    if (urlIdx === -1) continue;
    for (const row of values.slice(1)) {
      const url = row[urlIdx];
      if (url) urls.add(normalizeLinkedInUrl(String(url)));
    }
  }
  return urls;
}
