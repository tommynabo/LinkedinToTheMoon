/**
 * regenerate_mensajes_direct.ts
 * Regenera mensajes de conexión para todos los prospectos Pendiente + Comentado
 * usando pg directamente (sin @vercel/postgres) para evitar problemas de pooler desde local.
 */
import { config } from 'dotenv';
config();

import { Client } from 'pg';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
// Usamos la URL non-pooling sin channel_binding para conexión directa desde local
const DB_URL = (process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL)!
  .replace('channel_binding=require&', '')
  .replace('channel_binding=require', '');

const INSTRUCCION_IDIOMA = `
CRÍTICO: El idioma de tu respuesta DEBE SER EXACTAMENTE EL MISMO en el que está escrito el texto de referencia.
- Si el perfil o el post está en ESPAÑOL, debes escribir en ESPAÑOL.
- Si está en INGLÉS, debes escribir en INGLÉS.
No te confundas por el hecho de que su cargo pueda incluir palabras en inglés como "Growth Partner" si el resto del texto está en español.
`.trim();

const INSTRUCCION_TONO = `
Tono: juvenil, cercano y espontáneo, como si lo escribieras rápido desde el móvil sin pulirlo
demasiado. Mete muletillas y palabras coloquiales de forma natural — en español algo tipo
"mola", "molaría", "cositas", "tal cual", "un rollo", "vaya crack", diminutivos...; en otros
idiomas el equivalente que suene igual de joven y natural en ESE idioma (en inglés algo tipo
"ngl", "lowkey", "kinda", "love this"). No fuerces la jerga si no encaja con el post — que
suene a persona real escribiendo rápido, no a plantilla ni a IA.
`.trim();

async function callClaude(prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await response.json() as { content: Array<{ type: string; text?: string }> };
  const block = body.content?.find((b) => b.type === 'text' && b.text);
  return block?.text?.trim() ?? '';
}

function construirPrompt(nombre: string, cargo: string, bio: string, ultimoPost: string | null): string {
  const referencia = ultimoPost
    ? `Su último post en LinkedIn decía (resúmelo o cita algo concreto, no lo copies entero):\n"""\n${ultimoPost}\n"""`
    : `Este es un dato personalizado sobre su perfil/bio: "${bio}".`;

  return `
${INSTRUCCION_IDIOMA}
${INSTRUCCION_TONO}

Genera un mensaje de conexión de LinkedIn para ${nombre}, ${cargo}.

${referencia}

Haz referencia natural a ese contenido concreto (su post si lo tienes, si no su bio) — debe
notarse que el mensaje es solo para ella/él, no una plantilla genérica. Evita abrir siempre
igual (nada de "me quedé pensando en tu post sobre..."); busca un enfoque distinto cada vez.

Ve directo al grano a vender. Nada de preguntas, rodeos ni falsas simpatías.
El objetivo es ofrecer nuestros sistemas de prospección B2B y arquitectura de datos de forma clara y directa en este primer mensaje. Haz un pitch corto y contundente.
PROHIBIDO usar guiones (como "-", "—" o "–") en el texto. Usa comas o puntos en su lugar.

FORMATO OBLIGATORIO: escribe cada frase en su propia línea, separada por UNA línea en blanco
de la siguiente. Sin párrafos largos. Sin bloques de texto. Igual que este ejemplo:

---EJEMPLO DE FORMATO CORRECTO---
Vi tu post sobre escalabilidad en SaaS.

Lo que haces con los datos de actividad es exactamente lo que necesitan la mayoría de founders para no desperdiciar su pipeline.

Nosotros construimos sistemas de prospección B2B con arquitectura de datos que hacen esto automático, a escala.

¿Conectamos?
---FIN DEL EJEMPLO---

Máximo 4 frases en total. Que quepa en un mensaje de conexión de LinkedIn (300 caracteres máximo en total).

Responde ÚNICAMENTE con el texto del mensaje en ese formato, sin comillas ni explicaciones adicionales.
`.trim();
}

async function main() {
  console.log('🔄 Iniciando regeneración de mensajes (Pendiente + Comentado)...');
  console.log(`📦 Modelo Claude: ${CLAUDE_MODEL}`);

  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  console.log('⏳ Conectando a la base de datos...');
  await client.connect();
  console.log('✅ Conexión establecida.');

  const { rows } = await client.query<{
    id: number;
    nombre: string;
    cargo: string | null;
    dato_personalizado: string | null;
    ultimo_post_texto: string | null;
    estado: string;
  }>(`
    SELECT id, nombre, cargo, dato_personalizado, ultimo_post_texto, estado
    FROM prospectos
    WHERE estado IN ('Pendiente', 'Comentado')
    ORDER BY score DESC, id ASC
  `);

  console.log(`📋 Prospectos a regenerar: ${rows.length}`);
  if (rows.length === 0) {
    console.log('ℹ️  No hay prospectos en Pendiente ni Comentado.');
    await client.end();
    process.exit(0);
  }

  let regenerados = 0;
  let errores = 0;

  for (const row of rows) {
    try {
      const ultimoPost = row.ultimo_post_texto?.trim() || null;
      const bio = row.dato_personalizado?.trim() || '';
      const prompt = construirPrompt(row.nombre, row.cargo || '', bio, ultimoPost);
      const mensaje = await callClaude(prompt);
      await client.query('UPDATE prospectos SET texto_mensaje = $1 WHERE id = $2', [mensaje, row.id]);
      regenerados++;
      console.log(`  ✓ [${regenerados}/${rows.length}] ${row.nombre} (${row.estado})`);
    } catch (err) {
      errores++;
      console.error(`  ✗ Error en ${row.nombre} (id=${row.id}):`, err);
    }
  }

  await client.end();
  console.log(`\n✅ Completado: ${regenerados} regenerados, ${errores} errores.`);
  process.exit(errores > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
