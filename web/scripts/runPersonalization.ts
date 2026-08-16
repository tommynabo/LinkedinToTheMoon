import { personalizarMensajesYAudios } from '../src/lib/engines/personalization';

async function main() {
  console.log('Running personalization engine...');
  const res = await personalizarMensajesYAudios();
  console.log('Result:', res);
}

main().catch(console.error);
