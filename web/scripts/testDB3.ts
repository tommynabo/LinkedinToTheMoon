import { sql } from '@vercel/postgres';

async function test() {
  const { rows } = await sql`
    SELECT id, nombre, url_perfil
    FROM prospectos 
    WHERE fecha_extraccion = CURRENT_DATE AND ultimo_post_url IS NULL
    LIMIT 3
  `;
  console.log('No posts:', rows);
}

test().catch(console.error);
