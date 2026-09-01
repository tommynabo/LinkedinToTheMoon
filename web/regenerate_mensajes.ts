import { config } from 'dotenv';
config();

import { regenerarMensajesExistentes } from './src/lib/engines/personalization';

// Timeout global de 10 minutos para evitar cuelgues silenciosos
const TIMEOUT_MS = 10 * 60 * 1000;
const timeout = setTimeout(() => {
  console.error('❌ Timeout global alcanzado (10 min). Proceso terminado.');
  process.exit(2);
}, TIMEOUT_MS);

async function main() {
  try {
    console.log('🔄 Iniciando regeneración de mensajes (Pendiente + Comentado)...');
    console.log('⏳ Conectando a la base de datos...');
    const { regenerados } = await regenerarMensajesExistentes();
    clearTimeout(timeout);
    console.log(`✅ Regenerados: ${regenerados} mensajes con nuevo formato broetry.`);
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    console.error('❌ Error durante la regeneración:', error);
    process.exit(1);
  }
}

main();
