/**
 * actions.ts
 * Server Actions: todas las mutaciones del dashboard pasan por aquí (sin API routes extra).
 */
'use server';

import { revalidatePath } from 'next/cache';
import { ensureSchema, sql } from './db';
import { ejecutarRutinaDiaria } from './engines/daily';
import { archivarProspectosProcesados } from './engines/prospecting';

export async function updateProspectoEstado(formData: FormData): Promise<void> {
  await ensureSchema();
  const id = Number(formData.get('id'));
  const estado = String(formData.get('estado') || 'Pendiente');
  if (!id) return;
  await sql`UPDATE prospectos SET estado = ${estado} WHERE id = ${id}`;
  revalidatePath('/prospectos');
}

export async function archivarEnviadosAction(): Promise<void> {
  await archivarProspectosProcesados();
  revalidatePath('/prospectos');
  revalidatePath('/crm');
}

export async function updatePostRow(formData: FormData): Promise<void> {
  await ensureSchema();
  const id = Number(formData.get('id'));
  if (!id) return;
  const estado = String(formData.get('estado') || 'Borrador');
  const linkPublicado = String(formData.get('link_publicado') || '') || null;
  const likesRaw = formData.get('likes_comentarios');
  const likes = likesRaw !== null && likesRaw !== '' ? Number(likesRaw) : null;

  await sql`
    UPDATE posts
    SET estado = ${estado}, link_publicado = ${linkPublicado}, likes_comentarios = ${likes}
    WHERE id = ${id}
  `;
  revalidatePath('/posts');
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const id = Number(formData.get('id'));
  if (!id) return;
  await sql`DELETE FROM posts WHERE id = ${id}`;
  revalidatePath('/posts');
}

export async function addIdeaAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const idea = String(formData.get('idea') || '').trim();
  const pilarSugerido = String(formData.get('pilar_sugerido') || '').trim() || null;
  if (!idea) return;
  await sql`INSERT INTO ideas (idea, pilar_sugerido) VALUES (${idea}, ${pilarSugerido})`;
  revalidatePath('/ideas');
}

export async function updateCrmRow(formData: FormData): Promise<void> {
  await ensureSchema();
  const id = Number(formData.get('id'));
  if (!id) return;
  const acepto = formData.get('acepto_conexion') === 'on';
  const respondio = formData.get('respondio') === 'on';
  const agendo = formData.get('se_agendo_llamada') === 'on';
  const convirtio = formData.get('se_convirtio_cliente') === 'on';

  await sql`
    UPDATE crm
    SET acepto_conexion = ${acepto}, respondio = ${respondio},
        se_agendo_llamada = ${agendo}, se_convirtio_cliente = ${convirtio}
    WHERE id = ${id}
  `;
  revalidatePath('/crm');
}

/** Parsea el texto pegado (TSV o CSV) en /import y lo guarda en la tabla de staging. */
export async function importarProspectosAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const texto = String(formData.get('csv') || '');
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Si la primera línea parece cabecera ("nombre", "url"...), la saltamos.
  const primeraEsCabecera = /nombre/i.test(lineas[0] || '') && /url/i.test(lineas[0] || '');
  const filas = primeraEsCabecera ? lineas.slice(1) : lineas;

  for (const linea of filas) {
    const separador = linea.includes('\t') ? '\t' : ',';
    const columnas = linea.split(separador).map((c) => c.trim());
    const [nombre, url, cargo, empresa, bio, ultimoPost, seguidores] = columnas;
    if (!url) continue;

    await sql`
      INSERT INTO prospectos_import (nombre, url_perfil, cargo, empresa, bio, ultimo_post, seguidores)
      VALUES (${nombre || ''}, ${url}, ${cargo || ''}, ${empresa || ''}, ${bio || ''}, ${ultimoPost || ''},
              ${seguidores ? Number(seguidores) || null : null})
    `;
  }

  revalidatePath('/import');
}

/** Botón "Ejecutar ahora": corre la misma rutina que el cron, bajo demanda. */
export async function runNowAction(): Promise<void> {
  await ejecutarRutinaDiaria(process.env.PUBLIC_APP_URL || 'https://vercel.com');
  revalidatePath('/');
  revalidatePath('/posts');
  revalidatePath('/prospectos');
}
