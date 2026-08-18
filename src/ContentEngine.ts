/**
 * ContentEngine.ts
 * Motor ① — "botón de generar post" (sección 04 del PDF).
 * Rota pilares fijos, prioriza el banco de ideas semanal, y pide a Claude 3 hooks + 1
 * desarrollo. Escribe un borrador en la pestaña "Posts"; publicar sigue siendo manual.
 */

interface PostGenerado {
  hookA: string;
  hookB: string;
  hookC: string;
  desarrollo: string;
  cta: string;
}

interface ResultadoPost {
  pilar: string;
  conImagen: boolean;
}

/** Función que dispara el menú "Generar Post del Día" (ejecución manual, muestra un alert). */
function generarPostDelDia(): void {
  const resultado = generarPostDelDiaCore();
  SpreadsheetApp.getUi().alert(
    `Post generado (pilar: ${resultado.pilar})${resultado.conImagen ? ' con imagen de portada' : ''}. Revísalo en la pestaña "Posts", elige el hook ganador y publícalo tú mismo en LinkedIn.`
  );
}

/**
 * Lógica real del motor de contenido, sin ninguna llamada a SpreadsheetApp.getUi(): la usan
 * tanto el menú manual como el autopiloto diario (Autopilot.ts), que corre sin interfaz.
 */
function generarPostDelDiaCore(): ResultadoPost {
  const pilar = elegirPilarDelDia();
  const idea = tomarSiguienteIdeaSinUsar();
  const ejemplos = obtenerMejoresPostsComoEjemplo(2);

  const prompt = construirPromptMaestro(pilar, idea, ejemplos);
  const post = callClaudeJSON<PostGenerado>(prompt, 1200);

  let imagenUrl = '';
  let conImagen = false;
  if (tieneImagenHabilitada()) {
    try {
      const promptVisual = construirPromptVisual(pilar, post.hookA);
      imagenUrl = generarImagenParaPost(promptVisual, `${todayISO()}_${pilar.nombre}`);
      conImagen = true;
    } catch (err) {
      imagenUrl = `ERROR generando imagen: ${(err as Error).message}`;
    }
  }

  appendRowObject(SHEETS.POSTS, POSTS_HEADERS, {
    Fecha: todayISO(),
    Pilar: pilar.nombre,
    'Hook A': sanitizeForSheet(post.hookA),
    'Hook B': sanitizeForSheet(post.hookB),
    'Hook C': sanitizeForSheet(post.hookC),
    Desarrollo: sanitizeForSheet(`${post.desarrollo}\n\n${post.cta}`),
    Imagen: imagenUrl,
    Estado: 'Borrador',
    'Link al post publicado': '',
    'Likes/Comentarios': '',
  });

  if (idea) {
    marcarIdeaComoUsada(idea.fila);
  }

  return { pilar: pilar.nombre, conImagen };
}

const POSTS_HEADERS = [
  'Fecha',
  'Pilar',
  'Hook A',
  'Hook B',
  'Hook C',
  'Desarrollo',
  'Imagen',
  'Estado',
  'Link al post publicado',
  'Likes/Comentarios',
];

/** Rotación cíclica y determinista de pilares según el día del año (sección 4.2, paso 1). */
function elegirPilarDelDia(): ContentPillar {
  const inicioDeAnio = new Date(new Date().getFullYear(), 0, 0);
  const diferenciaMs = Date.now() - inicioDeAnio.getTime();
  const diaDelAnio = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));
  const indice = diaDelAnio % CONTENT_PILLARS.length;
  return CONTENT_PILLARS[indice];
}

interface IdeaBanco {
  fila: number;
  texto: string;
  pilarSugerido: string;
}

/** Prioriza el banco de ideas semanal antes de generar desde cero (sección 4.4). */
function tomarSiguienteIdeaSinUsar(): IdeaBanco | null {
  const sheet = getSpreadsheet().getSheetByName(SHEETS.IDEAS);
  if (!sheet) return null;
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map((h) => String(h).trim());
  const idxTexto = headers.indexOf('Idea suelta');
  const idxPilar = headers.indexOf('Pilar sugerido');
  const idxUsado = headers.indexOf('Usado');
  if (idxTexto === -1 || idxUsado === -1) return null;

  for (let i = 1; i < values.length; i++) {
    const usado = String(values[i][idxUsado]).trim().toLowerCase();
    if (usado !== 'sí' && usado !== 'si' && values[i][idxTexto]) {
      return {
        fila: i + 1, // 1-indexed para la API de Sheets
        texto: String(values[i][idxTexto]),
        pilarSugerido: idxPilar !== -1 ? String(values[i][idxPilar]) : '',
      };
    }
  }
  return null;
}

function marcarIdeaComoUsada(fila: number): void {
  const sheet = getSheetOrThrow(SHEETS.IDEAS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const idxUsado = headers.indexOf('Usado');
  if (idxUsado !== -1) {
    sheet.getRange(fila, idxUsado + 1).setValue('Sí');
  }
}

/** Los 2 posts con más likes+comentarios, para clonar el estilo (sección 4.2, paso 2). */
function obtenerMejoresPostsComoEjemplo(cantidad: number): string[] {
  const posts = readSheetAsObjects(SHEETS.POSTS);
  const conMetricas = posts
    .filter((p) => p['Desarrollo'])
    .sort((a, b) => (Number(b['Likes/Comentarios']) || 0) - (Number(a['Likes/Comentarios']) || 0));
  return conMetricas.slice(0, cantidad).map((p) => String(p['Desarrollo']));
}

function construirPromptMaestro(pilar: ContentPillar, idea: IdeaBanco | null, ejemplos: string[]): string {
  const ejemplosTexto =
    ejemplos.length > 0
      ? ejemplos.map((e, i) => `Ejemplo ${i + 1}:\n${e}`).join('\n\n')
      : '(Todavía no hay posts anteriores con métricas suficientes; usa un estilo directo y cercano.)';

  const ideaTexto = idea
    ? `Idea de partida (usa esto como semilla, no la ignores): "${idea.texto}"`
    : '(No hay idea pendiente en el banco esta semana; parte del ángulo de ejemplo del pilar.)';

  return `
Eres el ghostwriter de LinkedIn de Tomás, un ingeniero que construye sistemas avanzados de prospección B2B.
Su tono es: directo, autoritario, seco pero cercano al final.
Su audiencia es: dueños de agencias, consultores B2B y growth partners que pierden horas en scraping manual o tienen bases de datos sucias.

${ICP_DESCRIPTION}

Pilar de hoy: ${pilar.nombre} — ${pilar.objetivo}
Ángulo de referencia del pilar: "${pilar.ejemploAngulo}"
${ideaTexto}

Usa como referencia de estilo estos posts anteriores que funcionaron bien:
${ejemplosTexto}

Debes generar 1 post consolidado, con 3 alternativas de primera línea para elegir. Sigue ESTRICTAMENTE la fórmula del Playbook:
1. Primera línea (Hooks): Una escena hiper-específica, lectura fría del dolor del usuario. Entra directo al problema. Máximo 15 palabras.
2. Salto de línea como pausa obligatoria.
3. Autoridad sin vacilar (Desarrollo): Afirmaciones directas, verbos en presente, frases cortas de 1-2 líneas. CERO condicionales (prohibido usar "creo que", "podría", "tal vez"). Una idea por párrafo.
4. Calidez (Final del desarrollo): Una frase que te humanice justo después del dato técnico duro (ej. "Lo que más me gusta de la automatización no es... es ver la cara del cliente").
5. CTA final: Una pregunta o petición de una sola acción (comentar o escribir DM).

Responde ÚNICAMENTE con un objeto JSON con esta forma exacta, sin texto adicional:
{"hookA": "Primera opción de primera línea...", "hookB": "Segunda opción...", "hookC": "Tercera opción...", "desarrollo": "Cuerpo del post (sin el hook, empezando directamente con la autoridad...)", "cta": "CTA final"}
`.trim();
}
