import { config } from 'dotenv';
config();

import { ejecutarRutinaDiaria } from './src/lib/engines/daily';
import { ensureSchema, sql } from './src/lib/db';

async function main() {
  try {
    await ensureSchema();
    console.log('Iniciando ejecución manual del motor diario...');
    const result = await ejecutarRutinaDiaria("http://localhost:3000");
    console.log('Resultado del motor:', result);

    const { rows } = await sql`SELECT id, nombre, ultimo_post_texto FROM prospectos WHERE estado = 'Pendiente'`;
    console.log('Total leads guardados en DB:', rows.length);
    console.log('Leads con post:', rows.filter(r => r.ultimo_post_texto).length);
    console.log('Leads sin post:', rows.filter(r => !r.ultimo_post_texto).length);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
