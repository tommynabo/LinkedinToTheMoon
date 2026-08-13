/**
 * engines/personalization.ts
 * Motor ③ — mensaje personalizado + comentario de post + audio con tu voz clonada. Procesa
 * en lote los prospectos "Pendiente" sin mensaje todavía, hasta PROSPECTOS_POR_DIA.
 *
 * El ICP no está limitado a un idioma: los perfiles pueden estar en español, inglés o
 * cualquier otro. Por eso cada prompt le pide a Claude que detecte el idioma del propio
 * perfil (cargo/post/bio) y responda ÍNTEGRAMENTE en ese idioma, en vez de asumir español.
 */
import { ensureSchema, sql } from '../db';
import { PROSPECTOS_POR_DIA } from '../config';
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
    LIMIT ${PROSPECTOS_POR_DIA}
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

export async function generarComentarioPost(nombre: string, cargo: string, ultimoPost: string): Promise<string> {
  const prompt = `
${INSTRUCCION_IDIOMA}

Este es el último post de LinkedIn de ${nombre} (${cargo}):
"""
${ultimoPost}
"""

Escribe un comentario corto para dejar directamente debajo de ESE post en LinkedIn. Nada
elaborado ni "especial": algo cortito, personal y chill, del estilo de un comentario real que
dejarías sin pensarlo mucho. Debe notarse que lo has leído (una sola idea o frase concreta del
post, no un cumplido genérico tipo "¡Gran post!"), pero sin sonar a ensayo ni a venta.

Máximo 1 frase corta (excepcionalmente 2 muy breves). Tono casual, como comentando entre
colegas, nunca formal ni entusiasta de más.

Responde ÚNICAMENTE con el texto del comentario, sin comillas ni explicaciones adicionales.
`.trim();

  const texto = await callClaude(prompt, 120);
  return texto.trim();
}

async function generarMensajePersonalizado(
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

Genera un mensaje de conexión de LinkedIn de máximo 3-4 frases para ${nombre}, ${cargo}.

${referencia}

Haz referencia natural a ese contenido concreto (su post si lo tienes, si no su bio) — debe
notarse que el mensaje es solo para ella/él, no una plantilla genérica.

No vendas nada en este primer mensaje. El objetivo único es que acepte la conexión y sienta
curiosidad. Cierra con una pregunta abierta y breve.
Tono: cercano, humano, como si Tomás le escribiera un audio de WhatsApp a un colega, no un
mensaje de ventas.

Responde ÚNICAMENTE con el texto del mensaje, sin comillas ni explicaciones adicionales.
`.trim();

  const texto = await callClaude(prompt, 300);
  return texto.trim();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

