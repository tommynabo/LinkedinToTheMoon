/**
 * engines/personalization.ts
 * Motor ③ — mensaje personalizado + audio con tu voz clonada. Procesa en lote los
 * prospectos "Pendiente" sin mensaje todavía, hasta PROSPECTOS_POR_DIA.
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
  }>`
    SELECT id, nombre, cargo, dato_personalizado FROM prospectos
    WHERE estado = 'Pendiente' AND (texto_mensaje IS NULL OR texto_mensaje = '')
    ORDER BY score DESC, id ASC
    LIMIT ${PROSPECTOS_POR_DIA}
  `;

  let generados = 0;

  for (const row of rows) {
    try {
      const mensaje = await generarMensajePersonalizado(row.nombre, row.cargo || '', row.dato_personalizado || '');
      let linkAudio: string | null = null;

      if (audioDisponible) {
        try {
          linkAudio = await generarAudioPersonalizado(mensaje, `${todayISO()}_${row.id}`);
        } catch (err) {
          console.error(`Error generando audio para prospecto ${row.id}:`, err);
        }
      }

      await sql`
        UPDATE prospectos SET texto_mensaje = ${mensaje}, link_audio = ${linkAudio} WHERE id = ${row.id}
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

async function generarMensajePersonalizado(nombre: string, cargo: string, datoPersonalizado: string): Promise<string> {
  const prompt = `
Genera un mensaje de conexión de LinkedIn de máximo 3 frases para ${nombre}, ${cargo}.
Menciona de forma natural este dato personalizado: "${datoPersonalizado}".

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
