/**
 * engines/personalization.ts
 * Motor ③ — mensaje personalizado + comentario de post + audio con tu voz clonada. Procesa
 * TODOS los prospectos "Pendiente" que aún no tengan mensaje (sin límite de cantidad — el
 * mensaje de conexión es obligatorio para todos, generarlo es barato; solo el comentario de
 * post es opcional, y solo si el prospecto tiene un último post capturado CON suficiente
 * texto para comentar: mínimo MIN_POST_CHARS caracteres).
 *
 * El ICP no está limitado a un idioma: los perfiles pueden estar en español, inglés o
 * cualquier otro. Por eso cada prompt le pide a Claude que detecte el idioma del propio
 * perfil (cargo/post/bio) y responda ÍNTEGRAMENTE en ese idioma, en vez de asumir español.
 */
import { ensureSchema, sql } from '../db';
import { callClaude } from '../claude';
import { generarAudioPersonalizado, tieneAudioHabilitado } from '../elevenlabs';

// Debe coincidir con el valor en engines/prospecting.ts
const MIN_POST_CHARS = 50;

export interface ResultadoPersonalizacion {
  generados: number;
  audioDisponible: boolean;
  conComentario: number;   // ← nuevo: cuántos generaron comentario
}

export async function personalizarMensajesYAudios(): Promise<ResultadoPersonalizacion> {
  await ensureSchema();

  const audioDisponible = tieneAudioHabilitado();
  const { rows } = await sql<{
    id: number;
    nombre: string;
    cargo: string | null;
    dato_personalizado: string | null;
    ultimo_post_texto: string | null;
  }>`
    SELECT id, nombre, cargo, dato_personalizado, ultimo_post_texto FROM prospectos
    WHERE estado = 'Pendiente' AND (texto_mensaje IS NULL OR texto_mensaje = '')
    ORDER BY score DESC, id ASC
  `;

  let generados = 0;
  let conComentario = 0;

  for (const row of rows) {
    try {
      const ultimoPost = row.ultimo_post_texto?.trim() || null;
      const bio = row.dato_personalizado?.trim() || '';

      // Solo intentamos generar el comentario si el texto del post tiene suficiente
      // contenido. Un "tema" de 2-3 palabras del primer scraper no cuenta.
      const postApto = ultimoPost && ultimoPost.length >= MIN_POST_CHARS;

      let comentarioPost: string | null = null;
      if (postApto) {
        // El comentario se genera en su propio try/catch para que un fallo de Claude
        // no impida guardar el mensaje de conexión (que es más crítico).
        try {
          comentarioPost = await generarComentarioPost(row.nombre, row.cargo || '', ultimoPost!);
          conComentario++;
        } catch (err) {
          console.error(`[Personalization] Error generando comentario para prospecto ${row.id}:`, err);
          comentarioPost = null; // dejamos null, no es un error fatal
        }
      } else if (ultimoPost) {
        console.warn(`[Personalization] Post de prospecto ${row.id} demasiado corto (${ultimoPost.length} chars < ${MIN_POST_CHARS}), sin comentario.`);
      }

      const mensaje = await generarMensajePersonalizado(row.nombre, row.cargo || '', bio, ultimoPost);
      let linkAudio: string | null = null;

      if (audioDisponible) {
        try {
          linkAudio = await generarAudioPersonalizado(mensaje, `${todayISO()}_${row.id}`);
        } catch (err) {
          console.error(`[Personalization] Error generando audio para prospecto ${row.id}:`, err);
        }
      }

      await sql`
        UPDATE prospectos
        SET texto_mensaje = ${mensaje}, comentario_post = ${comentarioPost}, link_audio = ${linkAudio}
        WHERE id = ${row.id}
      `;
      generados++;
    } catch (err) {
      console.error(`[Personalization] Error crítico procesando prospecto ${row.id}:`, err);
      await sql`
        UPDATE prospectos SET texto_mensaje = ${`ERROR: ${(err as Error).message}`} WHERE id = ${row.id}
      `;
    }
  }

  return { generados, audioDisponible, conComentario };
}

const INSTRUCCION_IDIOMA = `
CRÍTICO: El idioma de tu respuesta DEBE SER EXACTAMENTE EL MISMO en el que está escrito el texto de referencia.
- Perfil o post en ESPAÑOL → responde en ESPAÑOL.
- En INGLÉS → en INGLÉS.
No te confundas si el cargo tiene palabras en inglés ("Growth Partner") pero el resto está en español. Nunca traduzcas si la persona claramente habla español.
`.trim();

// Excepción SOLO para el comentario de post: si el idioma detectado es francés, italiano o
// escandinavo, escribe en inglés (para no dejar comentarios en idiomas raros para el resto).
const EXCEPCION_IDIOMA_COMENTARIO = `
Excepción: si el idioma es francés, italiano, sueco, noruego, danés, finlandés o islandés,
escribe en INGLÉS (el resto de idiomas, incluido español, siguen la regla normal).
`.trim();

const INSTRUCCION_TONO = `
Escribo desde el móvil, sin revisar. Tono directo, joven, sin poses.
En español: nada de "estimado", "me complace", ni palabras de relaciones públicas.
En inglés: nada de "hope this finds you well", "I came across your profile", ni "I'd love to connect".

PROHIBIDO en CUALQUIER idioma (son marcadores claros de IA, no los uses nunca):
- En español: potenciar, apalancar, transformar, impulsar, ecosistema, sinergia, en el mundo actual, en el panorama actual, innovador, disruptivo, en este sentido, desde luego, sin duda, sin lugar a dudas, en primer lugar, en definitiva, en conclusión, me alegra, me complace, es un placer.
- En inglés: leverage, synergy, unlock, delve, transformative, game-changer, crucial, moreover, in today's fast-paced world, it's worth noting, I hope this message finds you well, touch base, circle back, reach out, I came across, I'd love to, I'm excited to.

VARIACIÓN DE FRASES (clave para sonar humano):
Mezcla frases muy cortas (3-6 palabras) con frases algo más largas. No todas igual de largas. Eso es lo que hace que suene real.
`.trim();

export async function generarComentarioPost(nombre: string, cargo: string, ultimoPost: string): Promise<string> {
  const prompt = `
${INSTRUCCION_IDIOMA}
${EXCEPCION_IDIOMA_COMENTARIO}
${INSTRUCCION_TONO}

Último post de LinkedIn de ${nombre} (${cargo}):
"""
${ultimoPost}
"""

Escribe un comentario para dejar debajo de ese post.

Reglas estrictas:
1. Reacciona a la IDEA CENTRAL del post. No cites literalmente ninguna frase suya.
2. Elige el ángulo que mejor encaje (no uses siempre el mismo):
   - Reacción directa y corta a la idea.
   - Pregunta que le pique la curiosidad.
   - Darle la razón añadiendo algo tuyo.
3. Que se note que lo leíste. Sin sonar a venta ni a ensayo.
4. Máximo 1 frase corta. Excepcionalmente 2 muy breves.
5. Sin guiones ("\-", "—", "–"). Usa comas o puntos.
6. Sin introducciones como "¡Qué interesante!", "Gran post", "Me ha encantado", "100%", emojis de aplauso, ni ningún arranque típico de bot.
7. No empieces NUNCA con el nombre de la persona.
8. Escríbelo como si lo escribieras de golpe desde el móvil, sin revisar.

Responde ÚNICAMENTE con el texto del comentario. Sin comillas ni explicaciones.
`.trim();

  const texto = await callClaude(prompt, 120);
  return texto.trim();
}

export async function generarMensajePersonalizado(
  nombre: string,
  cargo: string,
  bio: string,
  ultimoPost: string | null
): Promise<string> {
  const referencia = ultimoPost
    ? `Su último post (resume la idea principal, no lo copies entero):\n"""\n${ultimoPost}\n"""`
    : `Dato de su perfil/bio: "${bio}".`;

  const prompt = `
${INSTRUCCION_IDIOMA}
${INSTRUCCION_TONO}

Escribe un mensaje de solicitud de conexión en LinkedIn para ${nombre}, ${cargo}.

${referencia}

Reglas:
1. Arranca con algo específico de ESE perfil o post. Que sea evidente que es para esta persona, no una plantilla. Cada mensaje debe abrir distinto.
2. Ve directo: ofrece sistemas de prospección B2B y arquitectura de datos. Sin rodeos, sin falsas simpatías, sin preguntas innecesarias.
3. Pitch en 1 frase. Claro, no técnico. Sin jerga de startup.
4. CTA final corto: "¿Te llama la atención?" o similar. Una sola frase.
5. Sin guiones ("\-", "—", "–"). Usa comas o puntos.
6. FORMATO: cada frase en su propia línea, separada por una línea en blanco. Sin bloques de texto.
7. Máximo 4 frases en total. Máximo 300 caracteres en total.
8. Mezcla frases cortas y largas. No todas iguales. Eso es lo que suena humano.

EJEMPLO DE FORMATO (no copies el contenido, solo el formato):

Vi tu post sobre la captación en B2B.

Nosotros automatizamos ese proceso con sistemas de datos a escala.

¿Te llama la atención?

Responde ÚNICAMENTE con el texto del mensaje. Sin comillas ni explicaciones.
`.trim();

  const texto = await callClaude(prompt, 400);
  return texto.trim();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Regenera el texto_mensaje de TODOS los prospectos en estado 'Pendiente' o 'Comentado'
 * que ya tenían un mensaje (es decir, los que hay ahora mismo en esas columnas).
 * Útil para aplicar un nuevo formato de escritura a mensajes ya generados.
 */
export async function regenerarMensajesExistentes(): Promise<{ regenerados: number }> {
  await ensureSchema();

  const { rows } = await sql<{
    id: number;
    nombre: string;
    cargo: string | null;
    dato_personalizado: string | null;
    ultimo_post_texto: string | null;
  }>`
    SELECT id, nombre, cargo, dato_personalizado, ultimo_post_texto FROM prospectos
    WHERE estado IN ('Pendiente', 'Comentado')
    ORDER BY score DESC, id ASC
  `;

  let regenerados = 0;

  for (const row of rows) {
    try {
      const ultimoPost = row.ultimo_post_texto?.trim() || null;
      const bio = row.dato_personalizado?.trim() || '';
      const mensaje = await generarMensajePersonalizado(row.nombre, row.cargo || '', bio, ultimoPost);
      await sql`UPDATE prospectos SET texto_mensaje = ${mensaje} WHERE id = ${row.id}`;
      regenerados++;
    } catch (err) {
      console.error(`[Personalization] Error regenerando mensaje para prospecto ${row.id}:`, err);
    }
  }

  return { regenerados };
}

/**
 * Regenera el comentario_post de TODOS los prospectos en estado 'Pendiente' o 'Comentado'
 * que ya tenían un post con suficiente texto (mínimo MIN_POST_CHARS caracteres).
 * Útil para aplicar un nuevo tono/formato a comentarios ya generados.
 */
export async function regenerarComentariosExistentes(): Promise<{ regenerados: number }> {
  await ensureSchema();

  const { rows } = await sql<{
    id: number;
    nombre: string;
    cargo: string | null;
    ultimo_post_texto: string | null;
  }>`
    SELECT id, nombre, cargo, ultimo_post_texto FROM prospectos
    WHERE estado IN ('Pendiente', 'Comentado')
      AND ultimo_post_texto IS NOT NULL
      AND LENGTH(ultimo_post_texto) >= ${MIN_POST_CHARS}
    ORDER BY score DESC, id ASC
  `;

  let regenerados = 0;

  for (const row of rows) {
    try {
      const ultimoPost = row.ultimo_post_texto!.trim();
      const comentario = await generarComentarioPost(row.nombre, row.cargo || '', ultimoPost);
      await sql`UPDATE prospectos SET comentario_post = ${comentario} WHERE id = ${row.id}`;
      regenerados++;
    } catch (err) {
      console.error(`[Personalization] Error regenerando comentario para prospecto ${row.id}:`, err);
    }
  }

  return { regenerados };
}

