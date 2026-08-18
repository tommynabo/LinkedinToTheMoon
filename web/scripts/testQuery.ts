import { sql } from '@vercel/postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function query() {
  const { rows } = await sql`
    SELECT id, nombre, estado, comentario_post, fecha_extraccion, created_at 
    FROM prospectos 
    WHERE comentario_post IS NOT NULL OR comentario_post != '' OR estado ILIKE '%comentado%' OR estado ILIKE '%contactado%'
    ORDER BY created_at ASC 
    LIMIT 5;
  `;
  console.log("Prospectos con comentario_post o estado comentado:");
  console.table(rows);
}
query().catch(console.error);
