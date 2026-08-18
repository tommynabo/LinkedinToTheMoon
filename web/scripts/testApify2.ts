import { buscarUltimosPosts } from '../src/lib/apify';

async function test() {
  const urls = [
    'https://co.linkedin.com/in/juan-carlos-bernal-su%C3%A1rez-3737291b',
    'https://cl.linkedin.com/in/camilasanchezbe',
    'https://pe.linkedin.com/in/joelfrancia'
  ];
  console.log('Fetching posts for:', urls);
  const res = await buscarUltimosPosts(urls);
  console.log('Result:', res);
}

test().catch(console.error);
