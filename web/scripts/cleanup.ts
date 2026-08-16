import { sql } from '@vercel/postgres';

async function main() {
  console.log('Connecting to Neon to create schema and clean up today...');

  // 1. Create the new historico_urls table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS historico_urls (
      id SERIAL PRIMARY KEY,
      url_perfil TEXT NOT NULL UNIQUE,
      fecha_agregado TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  console.log('Table historico_urls created/verified.');

  // 2. Fetch all prospects generated today
  const { rows } = await sql`SELECT id, url_perfil FROM prospectos WHERE fecha_extraccion = CURRENT_DATE`;
  console.log(`Found ${rows.length} prospects generated today.`);

  // 3. Move them to historico_urls and delete them from prospectos
  for (const row of rows) {
    await sql`
      INSERT INTO historico_urls (url_perfil)
      VALUES (${row.url_perfil})
      ON CONFLICT (url_perfil) DO NOTHING
    `;
    await sql`DELETE FROM prospectos WHERE id = ${row.id}`;
  }

  console.log('Successfully cleaned up today. Now generating a new search...');

  // 4. Run the engine to generate new ones
  // We can just call the Next.js API endpoint or the function directly
  const { buscarProspectosDeHoy } = await import('../src/lib/engines/prospecting');
  const result = await buscarProspectosDeHoy();
  
  console.log('New search result:', result);
}

main().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
