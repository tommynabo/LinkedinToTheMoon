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
  const temasRecientes = await obtenerTemasRecientes(8);

  const prompt = construirPromptMaestro(pilar, idea, ejemplos, temasRecientes);
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
  // Excluye los borradores de hoy: si no, al regenerar un post el mismo día se usa el
  // propio borrador recién creado como "ejemplo de estilo" y Claude acaba repitiéndolo.
  const { rows } = await sql<{ desarrollo: string }>`
    SELECT desarrollo FROM posts
    WHERE desarrollo IS NOT NULL AND fecha < CURRENT_DATE
    ORDER BY likes_comentarios DESC NULLS LAST, id DESC
    LIMIT ${cantidad}
  `;
  return rows.map((r) => r.desarrollo);
}

/** Últimos hooks+pilar publicados/generados, para que el prompt evite repetir el mismo ángulo. */
async function obtenerTemasRecientes(cantidad: number): Promise<string[]> {
  const { rows } = await sql<{ hook_a: string | null; pilar: string }>`
    SELECT hook_a, pilar FROM posts
    WHERE fecha >= CURRENT_DATE - INTERVAL '21 days'
    ORDER BY id DESC
    LIMIT ${cantidad}
  `;
  return rows.filter((r) => r.hook_a).map((r) => `[${r.pilar}] ${r.hook_a}`);
}

function construirPromptMaestro(
  pilar: ContentPillar,
  idea: IdeaRow | null,
  ejemplos: string[],
  temasRecientes: string[]
): string {
  const ejemplosTexto =
    ejemplos.length > 0
      ? ejemplos.map((e, i) => `Ejemplo ${i + 1}:\n${e}`).join('\n\n')
      : '(Todavía no hay posts anteriores con métricas suficientes; usa un estilo directo y cercano.)';

  const ideaTexto = idea
    ? `Idea de partida (usa esto como semilla, no la ignores): "${idea.idea}"`
    : '(No hay idea pendiente en el banco esta semana; parte del ángulo de ejemplo del pilar.)';

  const temasRecientesTexto =
    temasRecientes.length > 0
      ? `Temas/ángulos ya publicados recientemente (PROHIBIDO repetirlos o parafrasearlos con otras palabras, busca un ángulo genuinamente distinto):\n${temasRecientes.map((t) => `- ${t}`).join('\n')}`
      : '';

  return `
Eres el ghostwriter de LinkedIn de Tomás. Él NO vende bots de WhatsApp ni automatizaciones fáciles. Él construye y lidera arquitecturas de datos de IA y sistemas de prospección súper complejos (refinerías B2B, ApexEngine, FlowNext) para clientes élite (ej. consultora #1 de Youtube España, app fitness #1 de España).
Su tono es: Autoridad seca, altamente técnico pero entendible, directo, con peso real. 

${ICP_DESCRIPTION}

Pilar de hoy: ${pilar.nombre} — ${pilar.objetivo}
Ángulo de referencia del pilar: "${pilar.ejemploAngulo}"
${ideaTexto}

${temasRecientesTexto}

Usa como referencia el TONO de estos posts anteriores, PERO IGNORA SU FORMATO (debes usar el nuevo formato de frases separadas indicado abajo):
${ejemplosTexto}

REGLAS ESTRICTAS PARA EL POST:
- Un post = Una idea. PROHIBIDO hablar de "agentes de Instagram", "bots de WhatsApp" o "ahorrar tiempo".
- Enfócate en problemas concretos y demuestra autoridad: casos reales, métricas, arquitecturas, procesos paso a paso.
- El post debe incluir: Hook (primera línea que para el scroll) + Cuerpo (Contexto, Proof of Work, Takeaway) + CTA.
- FORMATO BROETRY OBLIGATORIO: cada frase en su propia línea, separada por UNA línea en blanco del resto. Sin párrafos largos. Sin bloques de texto. Igual que el ejemplo de abajo:

---EJEMPLO DE FORMATO CORRECTO---
Contacté a 200 personas en LinkedIn en 2 semanas.

Solo 8 respondieron.

El problema no era el volumen.

Era que mandaba el mismo mensaje a todos.

Esto cambió cuando empecé a cruzar datos de actividad reciente con señales de intención de compra.

Primera semana: ratio de respuesta del 1,8%.

Tercera semana: 9,2% de respuestas cualificadas.

No cambié el canal.

Cambié la inteligencia detrás del mensaje.

Si quieres ver cómo funciona la arquitectura, escríbeme por DM.
---FIN DEL EJEMPLO---

- PROHIBIDO: párrafos largos, bloques de más de 2 líneas seguidas, guiones como "-" o "—", emojis, preguntas de gurú ("¿Qué opinas?").

Responde ÚNICAMENTE con un objeto JSON con esta forma exacta, sin texto adicional:
{"hookA": "primera frase del post (el hook, máx 12 palabras)", "hookB": "alternativa de hook 2", "hookC": "alternativa de hook 3", "desarrollo": "POST COMPLETO en formato broetry: hook elegido + cuerpo + CTA, con cada frase separada por línea en blanco", "cta": "CTA final aislado"}
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
