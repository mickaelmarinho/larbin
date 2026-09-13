import test from 'node:test';
import assert from 'node:assert/strict';

import { THEMES } from '../src/web/themes.ts';
import { AMBIANCES } from '../src/web/musique.ts';

test('chaque tapis a sa musique', () => {
  for (const theme of THEMES) assert.ok(AMBIANCES[theme.cle], `pas d’ambiance pour ${theme.cle}`);
});

test('des ambiances calmes, dans une tessiture raisonnable', () => {
  for (const [cle, a] of Object.entries(AMBIANCES)) {
    assert.ok(a.tempo >= 50 && a.tempo <= 90, `${cle} : tempo ${a.tempo}`);
    assert.ok(a.egrene > 0 && a.egrene < 0.6, `${cle} : trop de notes égrenées`);
    assert.ok(a.accords.length >= 3, `${cle} : trop peu d’accords pour ne pas lasser`);
    for (const { basse, notes } of a.accords) {
      assert.ok(basse >= 33 && basse <= 48, `${cle} : basse ${basse}`);
      assert.ok(notes.length >= 3, `${cle} : accord trop maigre`);
      // Égrenées une octave plus haut, les notes ne doivent pas devenir criardes.
      for (const n of notes) assert.ok(n >= 48 && n + 12 <= 86, `${cle} : note ${n}`);
    }
  }
});
