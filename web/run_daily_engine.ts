import { config } from 'dotenv';
config();

import { ejecutarRutinaDiaria } from './src/lib/engines/daily';
import { ensureSchema } from './src/lib/db';

async function main() {
  try {
    await ensureSchema();
    console.log('Iniciando ejecución manual del motor diario...');
    
    const result = await ejecutarRutinaDiaria("http://localhost:3000");
    console.log('Resultado:', result);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
