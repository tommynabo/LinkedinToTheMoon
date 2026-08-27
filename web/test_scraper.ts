import { config } from 'dotenv';
config();
import { buscarUltimosPosts } from './src/lib/apify';

async function main() {
  console.log('Probando scraper...');
  const res = await buscarUltimosPosts(['https://www.linkedin.com/in/lucasperanza']);
  console.log('Respuesta:', res);
  process.exit(0);
}
main();
