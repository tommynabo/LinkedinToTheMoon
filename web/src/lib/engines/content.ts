/** Motor de contenido: selecciona el formato, prepara un brief verificable y redacta un borrador. */
import { callClaudeJSON } from '../claude';
import { DEFAULT_CONTENT_CLAUDE_MODEL, CONTENT_PILLARS, ICP_DESCRIPTION, type ContentPillar } from '../config';
import { ensureSchema, sql } from '../db';
import { construirPromptVisual, generarImagenParaPost, tieneImagenHabilitada } from '../openaiImage';
import type { EditorialBrief, IdeaRow } from '../types';
import { getContentTypeForDate, getTechnicalPillarForDate, type ContentType } from '../content/editorial';
import { createBrief } from '../content/ideation';
import { validateDraft, type DraftToValidate } from '../content/validation';
import { VOICE_GUIDE } from '../content/voice';

interface PostGenerado extends DraftToValidate {}

export interface ResultadoPost {
  pilar: string;
  tipo: ContentType;
  tema: string;
  fuentes: number;
  fallback: boolean;
  conImagen: boolean;
}

const PILAR_ACTUALIDAD: ContentPillar = {
  nombre: 'Actualidad / Datos y recursos',
  objetivo: 'Interpretar novedades, datos y recursos útiles de IA y negocio digital.',
  ejemploAngulo: 'Una novedad concreta, su consecuencia operativa y qué merece la pena hacer con ella.',
};

export interface PreviewPost {
  tipo: ContentType;
  pilar: string;
  tema: string;
  fuentes: EditorialBrief['fuentes'];
  fallback: boolean;
  post: PostGenerado;
}

/** Genera una muestra para revisión editorial; nunca inserta ni marca ideas como usadas. */
export async function previsualizarPost(tipo: ContentType, now = new Date()): Promise<PreviewPost> {
  await ensureSchema();
  const idea = await tomarSiguienteIdeaSinUsar(tipo);
  const technicalPillar = getTechnicalPillarForDate(now);
  let pilar = elegirPilar(tipo, technicalPillar, idea);
  const ejemplos = await obtenerMejoresPostsComoEjemplo(2);
  const temasRecientes = await obtenerTemasRecientes(20);
  const brief = await createBrief(tipo, pilar, idea, temasRecientes, technicalPillar);
  if (brief.fallback) {
    tipo = 'tecnico';
    pilar = technicalPillar;
  }
  const post = await redactarYValidarPost(pilar, brief, ejemplos, temasRecientes);
  return { tipo, pilar: pilar.nombre, tema: brief.tema, fuentes: brief.fuentes, fallback: Boolean(brief.fallback), post };
}

export async function generarPostDelDia(now = new Date()): Promise<ResultadoPost> {
  await ensureSchema();
  let tipo = getContentTypeForDate(now);
  const idea = await tomarSiguienteIdeaSinUsar(tipo);
  const technicalPillar = getTechnicalPillarForDate(now);
  let pilar = elegirPilar(tipo, technicalPillar, idea);
  const ejemplos = await obtenerMejoresPostsComoEjemplo(2);
  const temasRecientes = await obtenerTemasRecientes(20);
  const brief = await createBrief(tipo, pilar, idea, temasRecientes, technicalPillar);
  if (brief.fallback) {
    tipo = 'tecnico';
    pilar = technicalPillar;
  }
  const post = await redactarYValidarPost(pilar, brief, ejemplos, temasRecientes);

  let imagenUrl: string | null = null;
  let conImagen = false;
  if (tieneImagenHabilitada()) {
    try {
      imagenUrl = await generarImagenParaPost(construirPromptVisual(pilar, post.hookA), `${todayISO()}_${slugify(pilar.nombre)}`);
      conImagen = true;
    } catch (error) {
      console.error('Error generando imagen de portada:', error);
    }
  }

  await sql`
    INSERT INTO posts (fecha, pilar, tipo_contenido, tema, hook_a, hook_b, hook_c, desarrollo, fuentes, brief_generacion, imagen_url, estado)
    VALUES (CURRENT_DATE, ${pilar.nombre}, ${tipo}, ${brief.tema}, ${post.hookA}, ${post.hookB}, ${post.hookC},
            ${post.desarrollo}, ${JSON.stringify(brief.fuentes)}, ${JSON.stringify(brief)}, ${imagenUrl}, 'Borrador')
  `;
  if (idea) await sql`UPDATE ideas SET usado = true WHERE id = ${idea.id}`;
  return { pilar: pilar.nombre, tipo, tema: brief.tema, fuentes: brief.fuentes.length, fallback: Boolean(brief.fallback), conImagen };
}

function elegirPilar(tipo: ContentType, technicalPillar: ContentPillar, idea: IdeaRow | null): ContentPillar {
  if (tipo === 'actualidad') return PILAR_ACTUALIDAD;
  return CONTENT_PILLARS.find((pillar) => pillar.nombre === idea?.pilar_sugerido) || technicalPillar;
}

async function tomarSiguienteIdeaSinUsar(tipo: ContentType): Promise<IdeaRow | null> {
  const { rows } = await sql<IdeaRow>`
    SELECT * FROM ideas WHERE usado = false AND COALESCE(tipo_contenido, 'tecnico') = ${tipo}
    ORDER BY id ASC LIMIT 1
  `;
  return rows[0] ?? null;
}

async function obtenerMejoresPostsComoEjemplo(cantidad: number): Promise<string[]> {
  const { rows } = await sql<{ desarrollo: string }>`
    SELECT desarrollo FROM posts WHERE desarrollo IS NOT NULL AND fecha < CURRENT_DATE
      AND (impresiones IS NOT NULL OR likes_comentarios IS NOT NULL)
    ORDER BY impresiones DESC NULLS LAST, likes_comentarios DESC NULLS LAST, id DESC LIMIT ${cantidad}
  `;
  return rows.map((row) => row.desarrollo);
}

async function obtenerTemasRecientes(cantidad: number): Promise<string[]> {
  const { rows } = await sql<{ hook_a: string | null; tema: string | null; pilar: string }>`
    SELECT hook_a, tema, pilar FROM posts WHERE fecha >= CURRENT_DATE - INTERVAL '60 days'
    ORDER BY id DESC LIMIT ${cantidad}
  `;
  return rows.map((row) => row.tema || row.hook_a || `[${row.pilar}]`).filter(Boolean) as string[];
}

function construirPromptRedaccion(pilar: ContentPillar, brief: EditorialBrief, ejemplos: string[], temasRecientes: string[], repairErrors: string[] = []): string {
  const facts = brief.hechos.map((fact) => `- ${fact.afirmacion}${fact.numeros.length ? ` (cifras permitidas: ${fact.numeros.join(', ')})` : ''}${fact.sourceUrl ? ` [${fact.sourceUrl}]` : ''}`).join('\n');
  const sources = brief.fuentes.map((source) => `- ${source.titulo}: ${source.url}`).join('\n') || 'No hay enlaces que incluir.';
  const examples = ejemplos.map((example, index) => `Ejemplo de tono ${index + 1}:\n${example}`).join('\n\n') || 'No hay ejemplos históricos con métricas.';
  const repair = repairErrors.length ? `\nCorrige específicamente estos errores:\n${repairErrors.map((error) => `- ${error}`).join('\n')}` : '';
  return `
Eres el ghostwriter de LinkedIn de Tomás. Redacta un único post en español a partir del brief aprobado.
${ICP_DESCRIPTION}
${VOICE_GUIDE}
Pilar: ${pilar.nombre}
Tema: ${brief.tema}
Tesis: ${brief.tesis}
Ángulo: ${brief.angulo}
Estructura elegida: ${brief.estructura}
Hechos aprobados:\n${facts}
Fuentes disponibles:\n${sources}
Temas recientes que no debes repetir: ${temasRecientes.join(' | ') || 'ninguno'}
Referencias de rendimiento, solo para tono, nunca para copiar datos:\n${examples}

Reglas:
- Un post, una idea. No inventes datos, clientes, experiencias ni citas. No uses números fuera de las cifras permitidas.
- Escribe entre 8 y 20 bloques. Cada bloque tiene una o dos frases y se separa con una línea en blanco.
- Mezcla frases cortas y medias. No conviertas cada línea en un eslogan.
- Usa una lista solo si los hechos o pasos realmente lo piden.
- El CTA es opcional. Si existe, debe surgir del contenido, no terminar siempre en una venta por DM.
- Incluye una URL solo si aparece exactamente en las fuentes disponibles.
- Sin emojis, guiones largos, frases de gurú ni lenguaje corporativo.
${repair}
Devuelve únicamente JSON: {"hookA":"","hookB":"","hookC":"","desarrollo":"post completo, incluido cualquier CTA"}.
`.trim();
}

async function redactarYValidarPost(pilar: ContentPillar, brief: EditorialBrief, ejemplos: string[], temasRecientes: string[]): Promise<PostGenerado> {
  const model = process.env.CONTENT_CLAUDE_MODEL || DEFAULT_CONTENT_CLAUDE_MODEL;
  let post = await callClaudeJSON<PostGenerado>(construirPromptRedaccion(pilar, brief, ejemplos, temasRecientes), 1800, model);
  post = normalizarFormatoPost(post);
  let errors = validateDraft(post, { allowedSourceUrls: brief.fuentes.map((source) => source.url), facts: brief.hechos });
  if (errors.length > 0) {
    post = await callClaudeJSON<PostGenerado>(construirPromptRedaccion(pilar, brief, ejemplos, temasRecientes, errors), 1800, model);
    post = normalizarFormatoPost(post);
    errors = validateDraft(post, { allowedSourceUrls: brief.fuentes.map((source) => source.url), facts: brief.hechos });
  }
  if (errors.length > 0) throw new Error(`El post no pasó la validación editorial: ${errors.join(' ')}`);
  return post;
}

function normalizarFormatoPost(post: PostGenerado): PostGenerado {
  const desarrollo = post.desarrollo
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([.!?])[ \t]+(?=[A-ZÁÉÍÓÚÑ¿])/g, '$1\n\n')
    .replace(/\n(?!\n)/g, '\n\n')
    .trim();
  return { ...post, desarrollo };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
}