/**
 * db.ts
 * Conexión a Vercel Postgres + creación idempotente del esquema. No hace falta ninguna
 * migración manual: la primera petición (cron o página) crea las tablas si no existen.
 */
import { sql } from '@vercel/postgres';

export { sql };

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = crearTablas().catch((err) => {
      schemaReady = null; // permite reintentar en la siguiente petición si falló
      throw err;
    });
  }
  return schemaReady;
}

async function crearTablas(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL DEFAULT CURRENT_DATE,
      pilar TEXT NOT NULL,
      hook_a TEXT,
      hook_b TEXT,
      hook_c TEXT,
      desarrollo TEXT,
      imagen_url TEXT,
      estado TEXT NOT NULL DEFAULT 'Borrador',
      link_publicado TEXT,
      likes_comentarios INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS prospectos (
      id SERIAL PRIMARY KEY,
      fecha_extraccion DATE NOT NULL DEFAULT CURRENT_DATE,
      nombre TEXT NOT NULL,
      url_perfil TEXT NOT NULL,
      cargo TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      dato_personalizado TEXT,
      ultimo_post_texto TEXT,
      ultimo_post_url TEXT,
      comentario_post TEXT,
      texto_mensaje TEXT,
      link_audio TEXT,
      estado TEXT NOT NULL DEFAULT 'Pendiente',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  // Migración para instalaciones ya existentes (CREATE TABLE IF NOT EXISTS no añade columnas
  // a una tabla que ya existía antes de que se introdujeran estas dos).
  await sql`ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS ultimo_post_texto TEXT;`;
  await sql`ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS ultimo_post_url TEXT;`;
  await sql`ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS comentario_post TEXT;`;

  await sql`
    CREATE TABLE IF NOT EXISTS prospectos_import (
      id SERIAL PRIMARY KEY,
      nombre TEXT,
      url_perfil TEXT,
      cargo TEXT,
      empresa TEXT,
      bio TEXT,
      ultimo_post TEXT,
      seguidores INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS crm (
      id SERIAL PRIMARY KEY,
      nombre TEXT,
      url_perfil TEXT NOT NULL,
      cargo TEXT,
      score INTEGER,
      fecha_envio DATE,
      acepto_conexion BOOLEAN,
      respondio BOOLEAN,
      se_agendo_llamada BOOLEAN,
      se_convirtio_cliente BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      idea TEXT NOT NULL,
      pilar_sugerido TEXT,
      usado BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id SERIAL PRIMARY KEY,
      ejecutado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      resumen TEXT NOT NULL,
      hubo_error BOOLEAN NOT NULL DEFAULT false
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS historico_urls (
      id SERIAL PRIMARY KEY,
      url_perfil TEXT NOT NULL UNIQUE,
      fecha_agregado TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
}
