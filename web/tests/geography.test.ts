import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paisPermitido, ubicacionPerfil } from '../src/lib/geography';
import { esProspectoValido } from '../src/lib/validation';
import { buscarProspectosConApify } from '../src/lib/apify';

const cases: [unknown, string | null][] = [
  ['Madrid, España', 'ES'], ['Barcelona, Spain', 'ES'], ['ES', 'ES'],
  ['London, United Kingdom', 'GB'], ['UK', 'GB'], ['Edinburgh, Scotland', 'GB'],
  ['New York, United States', 'US'], ['USA', 'US'], ['U.S.A.', 'US'],
  ['Estados Unidos', 'US'], ['Toronto, Canada', 'CA'], ['Canadá', 'CA'],
  ['CA', 'CA'], ['Lagos, Nigeria', null], ['Mumbai, India', null],
  ['London, Ontario, Canada', 'CA'], ['London, Ontario', null],
  ['London, Nigeria', null], ['Barcelona, Venezuela', null],
  ['US clients, India', null], ['Canada / India', null],
  ['San Francisco, CA', null], ['United States Minor Outlying Islands', null],
  ['', null], [null, null], [undefined, null], [{ country: 'US' }, null],
];
for (const [input, expected] of cases) {
  test(`country: ${JSON.stringify(input)}`, () => assert.equal(paisPermitido(input), expected));
}

test('location normalization uses explicit country, supports objects and rejects other countries', () => {
  assert.equal(ubicacionPerfil({ location: { countryCode: 'GB' } }), 'GB');
  assert.equal(ubicacionPerfil({ location: { parsed: { country: 'Spain' } } }), 'Spain');
  assert.equal(ubicacionPerfil({ location: { linkedinText: 'Toronto, Canada' } }), 'Toronto, Canada');
  assert.equal(paisPermitido(ubicacionPerfil({ countryCode: 'IN', location: 'London, UK' })), null);
  assert.equal(ubicacionPerfil({ headline: 'US consultant', location: {} }), '');
});

test('final validation cannot use profile name, URL locale, bio or post to bypass location', () => {
  const profile = { nombre: 'Ana', url: 'https://es.linkedin.com/in/ana', cargo: 'Business coach',
    empresa: '', bio: 'Working with USA and Spain', ultimoPostTema: 'UK', ultimoPostFecha: null, seguidores: null };
  for (const ubicacion of ['', 'Lagos, Nigeria', 'Mumbai, India']) {
    assert.equal(esProspectoValido({ ...profile, ubicacion }), false);
  }
  for (const ubicacion of ['Spain', 'UK', 'Canada', 'USA']) {
    assert.equal(esProspectoValido({ ...profile, ubicacion }), true);
  }
});

test('all supported discovery paths preserve author location and restrict profile search inputs', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const inputs: any[] = [];
  process.env.APIFY_API_TOKEN = 'test';
  delete process.env.APIFY_LOCATIONS;
  globalThis.fetch = async (url, init) => {
    inputs.push(JSON.parse(String(init?.body)));
    if (String(url).includes('linkedin-profile-scraper')) {
      return new Response(JSON.stringify([{
        linkedinUrl: 'https://www.linkedin.com/in/ana',
        location: { country: 'India' },
      }]));
    }
    return new Response(JSON.stringify([{
      fullName: 'Ana', linkedinUrl: 'https://www.linkedin.com/in/ana', headline: 'Business coach',
      location: { countryCode: 'ES' },
      author: { fullName: 'Ana', linkedinUrl: 'https://www.linkedin.com/in/ana', headline: 'Business coach', location: { country: 'Nigeria' } },
      text: 'A real business post '.repeat(10),
    }]));
  };
  try {
    for (const actor of ['harvestapi/linkedin-profile-search', 'memo23/linkedin-people-search']) {
      process.env.APIFY_ACTOR_ID = actor;
      inputs.length = 0;
      const profiles = await buscarProspectosConApify();
      assert.equal(profiles[0].ubicacion, 'ES');
      assert.ok(inputs.length > 0);
      assert.ok(inputs.every(i => i.location || i.locations?.length), 'no unrestricted profile searches');
    }
    process.env.APIFY_ACTOR_ID = 'harvestapi/linkedin-post-search';
    const posts = await buscarProspectosConApify();
    assert.equal(posts[0].ubicacion, 'India');
    assert.equal(esProspectoValido(posts[0]), false);
    assert.ok(inputs.some(i => i.queries?.length), 'post authors were not enriched');
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
