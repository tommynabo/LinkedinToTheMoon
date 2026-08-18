import { sql } from '@vercel/postgres';

async function test() {
  const { rows } = await sql`
    SELECT id, nombre, url_perfil, ultimo_post_texto, ultimo_post_url, comentario_post, texto_mensaje 
    FROM prospectos 
    WHERE fecha_extraccion = CURRENT_DATE
  `;
  console.log(`Found ${rows.length} rows`);
  
  let withPostUrl = 0;
  let withPostText = 0;
  let withComment = 0;
  
  rows.forEach(r => {
    if (r.ultimo_post_url) withPostUrl++;
    if (r.ultimo_post_texto) withPostText++;
    if (r.comentario_post) withComment++;
  });
  
  console.log(`With URL: ${withPostUrl}, With Text: ${withPostText}, With Comment: ${withComment}`);
}

test().catch(console.error);
