

async function test() {
  const { buscarUltimosPosts } = await import('../src/lib/apify');
  
  const urls = [
    'https://www.linkedin.com/in/williamhgates',
    'https://www.linkedin.com/in/satyanadella',
    'https://www.linkedin.com/in/sundarpichai'
  ];
  console.log('Fetching posts for:', urls);
  
  const res = await buscarUltimosPosts(urls);
  console.log('Result:', res);
}

test().catch(console.error);
