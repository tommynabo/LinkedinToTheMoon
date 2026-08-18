/**
 * queries.ts
 * Lecturas de solo consulta usadas por las páginas del dashboard.
 */
import { ensureSchema, sql } from './db';
import type { CronRunRow, CrmRow, IdeaRow, PostRow, ProspectoRow } from './types';

export async function getPosts(): Promise<PostRow[]> {
  await ensureSchema();
  const { rows } = await sql<PostRow>`SELECT * FROM posts ORDER BY fecha DESC, id DESC LIMIT 60`;
  return rows;
}

export async function getProspectos(): Promise<ProspectoRow[]> {
  await ensureSchema();
  const { rows } = await sql<ProspectoRow>`
    SELECT * FROM prospectos ORDER BY created_at ASC LIMIT 500
  `;
  return rows;
}

export async function getCrm(): Promise<CrmRow[]> {
  await ensureSchema();
  const { rows } = await sql<CrmRow>`SELECT * FROM crm ORDER BY fecha_envio DESC NULLS LAST, id DESC LIMIT 300`;
  return rows;
}

export async function getIdeas(): Promise<IdeaRow[]> {
  await ensureSchema();
  const { rows } = await sql<IdeaRow>`SELECT * FROM ideas ORDER BY usado ASC, id DESC LIMIT 100`;
  return rows;
}

export async function getUltimasEjecuciones(): Promise<CronRunRow[]> {
  await ensureSchema();
  const { rows } = await sql<CronRunRow>`SELECT * FROM cron_runs ORDER BY id DESC LIMIT 10`;
  return rows;
}

export interface ResumenKpis {
  publicadosEsteMes: number;
  enviadosEstaSemana: number;
  tasaAceptacion: string;
  tasaRespuesta: string;
}

export async function getResumenKpis(): Promise<ResumenKpis> {
  await ensureSchema();

  const { rows: postsRows } = await sql<{ total: string }>`
    SELECT COUNT(*)::text AS total FROM posts
    WHERE estado = 'Publicado' AND fecha >= date_trunc('month', CURRENT_DATE)
  `;

  const { rows: enviadosRows } = await sql<{ total: string }>`
    SELECT COUNT(*)::text AS total FROM crm
    WHERE fecha_envio >= (CURRENT_DATE - INTERVAL '7 days')
  `;

  const { rows: tasasRows } = await sql<{ total: string; aceptaron: string; respondieron: string }>`
    SELECT
      COUNT(*) FILTER (WHERE fecha_envio IS NOT NULL)::text AS total,
      COUNT(*) FILTER (WHERE acepto_conexion IS TRUE)::text AS aceptaron,
      COUNT(*) FILTER (WHERE respondio IS TRUE)::text AS respondieron
    FROM crm
  `;

  const total = Number(tasasRows[0]?.total || 0);
  const aceptaron = Number(tasasRows[0]?.aceptaron || 0);
  const respondieron = Number(tasasRows[0]?.respondieron || 0);

  return {
    publicadosEsteMes: Number(postsRows[0]?.total || 0),
    enviadosEstaSemana: Number(enviadosRows[0]?.total || 0),
    tasaAceptacion: total > 0 ? `${Math.round((aceptaron / total) * 100)}%` : 'N/D',
    tasaRespuesta: total > 0 ? `${Math.round((respondieron / total) * 100)}%` : 'N/D',
  };
}
