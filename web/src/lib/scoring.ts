/**
 * scoring.ts
 * Puntuación automática de prospectos y deduplicación contra el histórico (Prospectos + CRM).
 */
import { sql } from './db';
import { PROGRAMA_KEYWORDS, SCORE_KEYWORDS, SCORE_RULES } from './config';
import { normalizeLinkedInUrl } from './validation';
import type { ProspectoCrudo } from './types';

export function calcularScore(p: ProspectoCrudo): number {
  let score = 0;
  const bioLower = (p.bio || '').toLowerCase();

  if (SCORE_KEYWORDS.some((k) => bioLower.includes(k))) {
    score += SCORE_RULES.BIO_KEYWORDS;
  }

  if (p.ultimoPostFecha) {
    const fecha = new Date(p.ultimoPostFecha);
    const dias = (Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24);
    if (!Number.isNaN(dias) && dias <= 14) {
      score += SCORE_RULES.ACTIVO_14_DIAS;
    }
  }

  if (p.seguidores !== null && p.seguidores >= 1000 && p.seguidores <= 20000) {
    score += SCORE_RULES.SEGUIDORES_RANGO;
  }

  if (PROGRAMA_KEYWORDS.some((k) => bioLower.includes(k))) {
    score += SCORE_RULES.VENDE_PROGRAMAS;
  }

  return score;
}

/** URLs ya conocidas (cola activa + histórico) para poder deduplicar antes de insertar. */
export async function getUrlsConocidas(): Promise<Set<string>> {
  const { rows } = await sql<{ url_perfil: string }>`
    SELECT url_perfil FROM prospectos
    UNION
    SELECT url_perfil FROM crm
    UNION
    SELECT url_perfil FROM historico_urls
  `;
  return new Set(rows.map((r) => normalizeLinkedInUrl(r.url_perfil)));
}
