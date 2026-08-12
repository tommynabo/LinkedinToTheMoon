/**
 * engines/content.ts
 * Motor ① — genera el post del día. Rota pilares fijos, prioriza el banco de ideas semanal,
 * y pide a Claude 3 hooks + 1 desarrollo (+ imagen de portada opcional). Escribe un borrador
 * en la tabla "posts"; publicar sigue siendo manual.
 */
import { ensureSchema, sql } from '../db';
import { CONTENT_PILLARS, ICP_DESCRIPTION, type ContentPillar } from '../config';
import { callClaudeJSON } from '../claude';
import { construirPromptVisual, generarImagenParaPost, tieneImagenHabilitada } from '../openaiImage';
import type { IdeaRow } from '../types';

interface PostGenerado {
  hookA: string;
  hookB: string;
  hookC: string;
  desarrollo: string;
  cta: string;
}

export interface ResultadoPost {
  pilar: string;
  conImagen: boolean;
}

export async function generarPostDelDia(): Promise<ResultadoPost> {
  await ensureSchema();

  const pilar = elegirPilarDelDia();
  const idea = await tomarSiguienteIdeaSinUsar();
  const ejemplos = await obtenerMejoresPostsComoEjemplo(2);

  const prompt = construirPromptMaestro(pilar, idea, ejemplos);
  const post = await callClaudeJSON<PostGenerado>(prompt, 1200);

  let imagenUrl: string | null = null;
  let conImagen = false;
  if (tieneImagenHabilitada()) {
    try {
      const promptVisual = construirPromptVisual(pilar, post.hookA);
      imagenUrl = await generarImagenParaPost(promptVisual, `${todayISO()}_${slugify(pilar.nombre)}`);
      conImagen = true;
    } catch (err) {
      imagenUrl = null;
      console.error('Error generando imagen de portada:', err);
    }
  }

  const desarrolloCompleto = `${post.desarrollo}\n\n${post.cta}`;

  await sql`
    INSERT INTO posts (fecha, pilar, hook_a, hook_b, hook_c, desarrollo, imagen_url, estado)
    VALUES (CURRENT_DATE, ${pilar.nombre}, ${post.hookA}, ${post.hookB}, ${post.hookC}, ${desarrolloCompleto}, ${imagenUrl}, 'Borrador')
  `;

  if (idea) {
    await sql`UPDATE ideas SET usado = true WHERE id = ${idea.id}`;
  }

  return { pilar: pilar.nombre, conImagen };
}

function elegirPilarDelDia(): ContentPillar {
  const inicioDeAnio = new Date(new Date().getFullYear(), 0, 0);
  const diaDelAnio = Math.floor((Date.now() - inicioDeAnio.getTime()) / (1000 * 60 * 60 * 24));
  return CONTENT_PILLARS[diaDelAnio % CONTENT_PILLARS.length];
}

async function tomarSiguienteIdeaSinUsar(): Promise<IdeaRow | null> {
  const { rows } = await sql<IdeaRow>`
    SELECT * FROM ideas WHERE usado = false ORDER BY id ASC LIMIT 1
  `;
  return rows[0] ?? null;
}

async function obtenerMejoresPostsComoEjemplo(cantidad: number): Promise<string[]> {
  const { rows } = await sql<{ desarrollo: string }>`
    SELECT desarrollo FROM posts
    WHERE desarrollo IS NOT NULL
    ORDER BY likes_comentarios DESC NULLS LAST, id DESC
    LIMIT ${cantidad}
  `;
  return rows.map((r) => r.desarrollo);
}

function construirPromptMaestro(pilar: ContentPillar, idea: IdeaRow | null, ejemplos: string[]): string {
  const ejemplosTexto =
    ejemplos.length > 0
      ? ejemplos.map((e, i) => `Ejemplo ${i + 1}:\n${e}`).join('\n\n')
      : '(Todavía no hay posts anteriores con métricas suficientes; usa un estilo directo y cercano.)';

  const ideaTexto = idea
    ? `Idea de partida (usa esto como semilla, no la ignores): "${idea.idea}"`
    : '(No hay idea pendiente en el banco esta semana; parte del ángulo de ejemplo del pilar.)';

  return `
Eres el ghostwriter de LinkedIn de Tomás, fundador de una agencia de IA.
Su tono es: directo, cercano, sin tecnicismos innecesarios, con opinión propia.
Su audiencia es: coaches y consultores independientes, y dueños de comunidades/formaciones
online, que quieren escalar sin contratar más equipo.

${ICP_DESCRIPTION}

Pilar de hoy: ${pilar.nombre} — ${pilar.objetivo}
Ángulo de referencia del pilar: "${pilar.ejemploAngulo}"
${ideaTexto}

Usa como referencia de estilo estos posts anteriores que funcionaron bien:
${ejemplosTexto}

Genera:
- 3 hooks alternativos (máx 12 palabras cada uno)
- 1 desarrollo de 150-220 palabras
- 1 CTA final que invite a comentar o escribir por DM (nunca venta directa agresiva)

Frases cortas, un salto de línea cada 1-2 frases, sin jerga corporativa, evita emojis
excesivos, evita sonar a "gurú de LinkedIn".

Responde ÚNICAMENTE con un objeto JSON con esta forma exacta, sin texto adicional:
{"hookA": "...", "hookB": "...", "hookC": "...", "desarrollo": "...", "cta": "..."}
`.trim();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}
