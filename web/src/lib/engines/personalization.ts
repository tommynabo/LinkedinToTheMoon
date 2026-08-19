/**
 * engines/personalization.ts
 * Motor ③ — mensaje personalizado + comentario de post + audio con tu voz clonada. Procesa
 * TODOS los prospectos "Pendiente" que aún no tengan mensaje (sin límite de cantidad — el
 * mensaje de conexión es obligatorio para todos, generarlo es barato; solo el comentario de
 * post es opcional, y solo si el prospecto tiene un último post capturado).
 *
 * El ICP no está limitado a un idioma: los perfiles pueden estar en español, inglés o
 * cualquier otro. Por eso cada prompt le pide a Claude que detecte el idioma del propio
 * perfil (cargo/post/bio) y responda ÍNTEGRAMENTE en ese idioma, en vez de asumir español.
 */
import { ensureSchema, sql } from '../db';
import { callClaude } from '../claude';
import { generarAudioPersonalizado, tieneAudioHabilitado } from '../elevenlabs';

export interface ResultadoPersonalizacion {
  generados: number;
  audioDisponible: boolean;
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

  for (const row of rows) {
    try {
      const ultimoPost = row.ultimo_post_texto?.trim() || null;
      const bio = row.dato_personalizado?.trim() || '';

      let comentarioPost: string | null = null;
      if (ultimoPost) {
        comentarioPost = await generarComentarioPost(row.nombre, row.cargo || '', ultimoPost);
      }

      const mensaje = await generarMensajePersonalizado(row.nombre, row.cargo || '', bio, ultimoPost);
      let linkAudio: string | null = null;

      if (audioDisponible) {
        try {
          linkAudio = await generarAudioPersonalizado(mensaje, `${todayISO()}_${row.id}`);
        } catch (err) {
          console.error(`Error generando audio para prospecto ${row.id}:`, err);
        }
      }

      await sql`
        UPDATE prospectos
        SET texto_mensaje = ${mensaje}, comentario_post = ${comentarioPost}, link_audio = ${linkAudio}
        WHERE id = ${row.id}
      `;
      generados++;
    } catch (err) {
      await sql`
        UPDATE prospectos SET texto_mensaje = ${`ERROR: ${(err as Error).message}`} WHERE id = ${row.id}
      `;
    }
  }

  return { generados, audioDisponible };
}

const INSTRUCCION_IDIOMA = `
Detecta el idioma en el que está escrito el perfil (el texto de referencia que te paso abajo:
su cargo, su post o su bio). Responde ÍNTEGRAMENTE en ese mismo idioma (puede ser español,
inglés o cualquier otro) — nunca traduzcas ni cambies de idioma.
`.trim();

// Excepción SOLO para el comentario de post (no para el mensaje de conexión): si el idioma
// detectado es francés, italiano o de un país escandinavo, se escribe en inglés en vez de en
// ese idioma — pedido explícito para evitar comentarios en idiomas "raros" para el resto de
// gente que lea el post.
const EXCEPCION_IDIOMA_COMENTARIO = `
Excepción importante: si el idioma detectado es francés, italiano, sueco, noruego, danés,
finlandés o islandés, escribe el comentario en INGLÉS en vez de en ese idioma (el resto de
idiomas, incluido el español, siguen la regla normal de arriba).
`.trim();

const INSTRUCCION_TONO = `
Tono: juvenil, cercano y espontáneo, como si lo escribieras rápido desde el móvil sin pulirlo
demasiado. Mete muletillas y palabras coloquiales de forma natural — en español algo tipo
"mola", "molaría", "cositas", "tal cual", "un rollo", "vaya crack", diminutivos...; en otros
idiomas el equivalente que suene igual de joven y natural en ESE idioma (en inglés algo tipo
"ngl", "lowkey", "kinda", "love this"). No fuerces la jerga si no encaja con el post — que
suene a persona real escribiendo rápido, no a plantilla ni a IA.
`.trim();

export async function generarComentarioPost(nombre: string, cargo: string, ultimoPost: string): Promise<string> {
  const prompt = `
${INSTRUCCION_IDIOMA}
${EXCEPCION_IDIOMA_COMENTARIO}
${INSTRUCCION_TONO}

Este es el último post de LinkedIn de ${nombre} (${cargo}):
"""
${ultimoPost}
"""

Escribe un comentario corto para dejar directamente debajo de ESE post en LinkedIn.

Evita el patrón repetitivo de citar textualmente una frase suya tipo "me quedé pensando en
eso que dices de...". En vez de eso, elige el enfoque que mejor pegue con este post en
concreto (varía, no uses siempre el mismo):
- Una reacción general y directa a la idea de fondo del post (sin citar literalmente una frase).
- Una pregunta con chispa que le pique la curiosidad sobre el tema, para darle caña.
- Ponerte de su lado, reforzando o construyendo sobre su punto de vista con algo tuyo.

Nada elaborado ni "especial": cortito, personal y chill, del estilo de un comentario real que
dejarías sin pensarlo mucho. Debe notarse que lo has leído, pero sin sonar a ensayo ni a venta.

Máximo 1 frase corta (excepcionalmente 2 muy breves).
PROHIBIDO usar guiones (como "-", "—" o "–") en el texto. Usa comas o puntos en su lugar.

Responde ÚNICAMENTE con el texto del comentario, sin comillas ni explicaciones adicionales.
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
    ? `Su último post en LinkedIn decía (resúmelo o cita algo concreto, no lo copies entero):\n"""\n${ultimoPost}\n"""`
    : `Este es un dato personalizado sobre su perfil/bio: "${bio}".`;

  const prompt = `
${INSTRUCCION_IDIOMA}
${INSTRUCCION_TONO}

Genera un mensaje de conexión de LinkedIn de máximo 3-4 frases para ${nombre}, ${cargo}.

${referencia}

Haz referencia natural a ese contenido concreto (su post si lo tienes, si no su bio) — debe
notarse que el mensaje es solo para ella/él, no una plantilla genérica. Evita abrir siempre
igual (nada de "me quedé pensando en tu post sobre..." como fórmula fija); busca un enfoque
distinto cada vez, el que mejor encaje.

Ve directo al grano a vender. Nada de preguntas, rodeos ni falsas simpatías. 
El objetivo es ofrecer nuestros sistemas de prospección B2B y arquitectura de datos de forma clara y directa en este primer mensaje. Haz un pitch corto y contundente.
PROHIBIDO usar guiones (como "-", "—" o "–") en el texto. Usa comas o puntos en su lugar.

Responde ÚNICAMENTE con el texto del mensaje, sin comillas ni explicaciones adicionales.
`.trim();

  const texto = await callClaude(prompt, 300);
  return texto.trim();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

