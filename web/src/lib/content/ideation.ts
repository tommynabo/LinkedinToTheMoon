import { callClaudeJSON, callClaudeJSONWithWebSearch } from '../claude';
import { DEFAULT_CONTENT_CLAUDE_MODEL, type ContentPillar } from '../config';
import type { EditorialBrief, EditorialSource, IdeaRow } from '../types';
import type { ContentType } from './editorial';

interface BriefResponse {
  tema: string;
  tesis: string;
  angulo: string;
  estructura: EditorialBrief['estructura'];
  hechos: EditorialBrief['hechos'];
}

function normalizeBrief(response: BriefResponse, sources: EditorialSource[], fallback = false): EditorialBrief {
  if (!response.tema || !response.tesis || !response.angulo || response.hechos.length === 0) {
    throw new Error('El brief no contiene tema, tesis, ángulo y hechos suficientes.');
  }
  return { ...response, fuentes: sources, fallback };
}

export async function createTechnicalBrief(
  pillar: ContentPillar,
  idea: IdeaRow | null,
  recentTopics: string[]
): Promise<EditorialBrief> {
  const seed = idea
    ? `Idea aportada por Tomás: "${idea.idea}"${idea.fuente_url ? `\nFuente aportada: ${idea.fuente_url}` : ''}`
    : 'No hay idea manual. Propón un ángulo técnico nuevo y concreto a partir del pilar.';
  const result = await callClaudeJSON<BriefResponse>(`
Eres editor de LinkedIn. Prepara un brief para un post técnico, no escribas el post.
Pilar: ${pillar.nombre}. Objetivo: ${pillar.objetivo}. Ángulo de referencia: ${pillar.ejemploAngulo}
${seed}
Temas recientes que no puedes repetir: ${recentTopics.join(' | ') || 'ninguno'}

Devuelve JSON: {"tema":"","tesis":"","angulo":"","estructura":"caso-tecnico|tutorial|contrarian","hechos":[{"afirmacion":"hecho verificable o experiencia explícitamente aportada","numeros":[],"sourceUrl":""}]}.
No inventes clientes, resultados, métricas, experiencias ni URLs. Si no hay fuente, deja sourceUrl vacío y formula el hecho como explicación técnica general, sin cifras.
`.trim(), 1400, process.env.CONTENT_CLAUDE_MODEL || DEFAULT_CONTENT_CLAUDE_MODEL);
  return normalizeBrief(result, idea?.fuente_url ? [{ titulo: 'Fuente aportada por Tomás', url: idea.fuente_url, fecha: null }] : []);
}

export async function createCurrentEventsBrief(recentTopics: string[]): Promise<EditorialBrief> {
  const { value, sources } = await callClaudeJSONWithWebSearch<BriefResponse>(`
Investiga una noticia, dato curioso, recurso gratuito o workflow reciente sobre IA, tecnología o negocio digital que interese a consultores y fundadores B2B en España.
Busca antes de responder. Descarta rumores, resultados sin fecha y temas sin utilidad práctica.
Temas recientes prohibidos: ${recentTopics.join(' | ') || 'ninguno'}.

Devuelve solo JSON: {"tema":"","tesis":"","angulo":"","estructura":"noticia|recurso|tutorial|contrarian","hechos":[{"afirmacion":"","numeros":["cifras exactas usadas"],"sourceUrl":"URL de una fuente encontrada"}]}.
Incluye 2-4 hechos. Toda cifra o afirmación controvertida debe tener sourceUrl de las fuentes encontradas. No inventes URLs, cifras ni hechos.
`.trim());
  const brief = normalizeBrief(value, sources);
  const sourceUrls = new Set(sources.map((source) => source.url));
  if (brief.hechos.some((fact) => !fact.sourceUrl || !sourceUrls.has(fact.sourceUrl))) {
    throw new Error('El brief de actualidad contiene hechos sin fuente verificable.');
  }
  return brief;
}

export async function createBrief(
  type: ContentType,
  pillar: ContentPillar,
  idea: IdeaRow | null,
  recentTopics: string[],
  fallbackPillar: ContentPillar = pillar
): Promise<EditorialBrief> {
  if (type === 'tecnico') return createTechnicalBrief(pillar, idea, recentTopics);
  try {
    return await createCurrentEventsBrief(recentTopics);
  } catch (error) {
    console.warn('La investigación de actualidad falló; se usará un brief técnico seguro.', error);
    const fallback = await createTechnicalBrief(fallbackPillar, null, recentTopics);
    return { ...fallback, fallback: true };
  }
}