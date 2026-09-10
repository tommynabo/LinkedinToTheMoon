import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esProfesionalOnline } from '../src/lib/online';
import { esProspectoValido, esFilaProspectoValida } from '../src/lib/validation';
import { buscarProspectosConApify } from '../src/lib/apify';

const accepted = ['SaaS founder', 'Online business consultant', 'Consultora online',
  'Freelance remote developer', 'Founder of digital products', 'Coach online'];
for (const cargo of accepted) {
  test(`accepts explicit online professional: ${cargo}`, () => {
    assert.equal(esProfesionalOnline(cargo, ''), true);
  });
}
const rejected: [string, string][] = [
  ['CEO', ''], ['Business consultant', 'I work with clients in USA and Spain'],
  ['Copywriter', 'Interested in digital marketing'], ['Student', 'SaaS and online business'],
  ['Restaurant owner', 'Online business and digital products'],
  ['SaaS founder', 'We also provide in-person workshops'],
  ['Consultor online', 'Trabajo presencial e híbrido'],
  ['Consultant', 'Not an online business'], ['Founder', 'We are not remote'],
];
for (const [cargo, bio] of rejected) {
  test(`rejects ambiguous, physical or negated activity: ${cargo} ${bio}`, () => {
    assert.equal(esProfesionalOnline(cargo, bio), false);
  });
}
test('accepts exclusively online evidence in the biography', () => {
  assert.equal(esProfesionalOnline('Consultora independiente', 'Servicios 100% online'), true);
});
test('same country and online gate for imported candidates and persisted queue rows', () => {
  for (const ubicacion of ['Spain', 'UK', 'USA', 'Canada', 'India', 'Nigeria', '']) {
    for (const cargo of ['CEO', 'SaaS founder']) {
      const expected = ['Spain', 'UK', 'USA', 'Canada'].includes(ubicacion) && cargo === 'SaaS founder';
      assert.equal(esProspectoValido({ nombre: 'Ana', url: 'https://linkedin.com/in/ana', cargo,
        bio: '', empresa: '', ubicacion, ultimoPostTema: 'online business founder',
        ultimoPostFecha: null, seguidores: null }), expected);
      assert.equal(esFilaProspectoValida({ nombre: 'Ana', url_perfil: 'https://linkedin.com/in/ana',
        cargo, dato_personalizado: '', ubicacion }), expected);
    }
  }
});
test('post discovery enriches professional facts as well as the country before qualification', async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  process.env.APIFY_API_TOKEN = 'test';
  process.env.APIFY_ACTOR_ID = 'harvestapi/linkedin-post-search';
  delete process.env.APIFY_PROFILE_ACTOR_ID;
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('linkedin-profile-scraper')
    ? [{ linkedinUrl: 'https://linkedin.com/in/ana', fullName: 'Ana', headline: 'SaaS founder',
        about: 'We build software', location: 'Spain' }]
    : [{ author: { linkedinUrl: 'https://linkedin.com/in/ana', fullName: 'Ana', headline: 'CEO' },
        text: 'An online business post '.repeat(5) }]));
  try {
    const candidates = await buscarProspectosConApify();
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].cargo, 'SaaS founder');
    assert.equal(candidates[0].bio, 'We build software');
    assert.equal(esProspectoValido(candidates[0]), true);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
});
