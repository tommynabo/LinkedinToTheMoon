import { sql } from '@vercel/postgres';

async function test() {
  const { rows } = await sql`SELECT id, nombre, url_perfil, ultimo_post_texto, ultimo_post_url, comentario_post, texto_mensaje FROM prospectos WHERE url_perfil LIKE '%ayalacarlos%'`;
  console.log('Result:', rows);
}

test().catch(console.error);
