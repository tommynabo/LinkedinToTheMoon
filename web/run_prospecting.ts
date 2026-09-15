import { buscarProspectosDeHoy } from './src/lib/engines/prospecting';

async function main() {
  console.log('🚀 Iniciando búsqueda de prospectos...');
  const resultado = await buscarProspectosDeHoy(25);
  console.log('\n✅ Resultado:', JSON.stringify(resultado, null, 2));
  process.exit(0);
}
main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
