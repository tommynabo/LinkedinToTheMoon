import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTENT_PILLARS } from '../src/lib/config';
import { getContentTypeForDate, getTechnicalPillarForDate } from '../src/lib/content/editorial';
import { validateDraft } from '../src/lib/content/validation';

function madridNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00+02:00`);
}

test('uses four technical posts and three current-events posts each Madrid week', () => {
  const types = [
    '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
    '2026-09-18', '2026-09-19', '2026-09-20',
  ].map((date) => getContentTypeForDate(madridNoon(date)));

  assert.deepEqual(types, ['tecnico', 'actualidad', 'tecnico', 'actualidad', 'tecnico', 'actualidad', 'tecnico']);
});

test('rotates pillars only across technical publishing days', () => {
  const technicalPillars = ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-20', '2026-09-21']
    .map((date) => getTechnicalPillarForDate(madridNoon(date)).nombre);

  for (let index = 1; index < technicalPillars.length; index++) {
    const previousIndex = CONTENT_PILLARS.findIndex((pillar) => pillar.nombre === technicalPillars[index - 1]);
    assert.equal(technicalPillars[index], CONTENT_PILLARS[(previousIndex + 1) % CONTENT_PILLARS.length].nombre);
  }
});

test('rejects unverified numbers, unknown links and AI cliches', () => {
  const errors = validateDraft({
    hookA: 'Un dato incómodo sobre IA',
    hookB: 'La cifra que cambia el debate',
    hookC: 'No es una tendencia menor',
    desarrollo: Array.from({ length: 8 }, (_, index) => index === 0
      ? 'Esto puede transformar tu negocio por 20%.'
      : index === 1 ? 'https://no-verificada.example/recurso' : 'Una observación concreta.').join('\n\n'),
  }, { allowedSourceUrls: ['https://fuente.example/informe'], facts: [] });

  assert.equal(errors.some((error) => error.includes('cliché')), true);
  assert.equal(errors.some((error) => error.includes('URL no presente')), true);
  assert.equal(errors.some((error) => error.includes('cifra no aprobada')), true);
});