import test from 'node:test';
import assert from 'node:assert/strict';

import { MUSIQUES, ORDRE_MUSIQUES, choixDepuisStockage } from '../src/web/musique.ts';

test('le choix enregistré se relit ; l’ancien interrupteur mène au casino', () => {
  assert.equal(choixDepuisStockage('active'), 'casino');
  assert.equal(choixDepuisStockage('cabaret'), 'cabaret');
  assert.equal(choixDepuisStockage('coupee'), null);
  assert.equal(choixDepuisStockage(null), null);
  // Un nom hérité d'Object ne doit pas passer pour un morceau.
  assert.equal(choixDepuisStockage('toString'), null);
});

test('le panneau propose chaque musique, une seule fois', () => {
  assert.deepEqual([...ORDRE_MUSIQUES].sort(), Object.keys(MUSIQUES).sort());
});

test('les nappes restent calmes, dans une tessiture raisonnable', () => {
  for (const [cle, { style }] of Object.entries(MUSIQUES)) {
    if (style.genre !== 'nappe') continue;
    assert.ok(style.tempo >= 50 && style.tempo <= 90, `${cle} : tempo ${style.tempo}`);
    assert.ok(style.egrene > 0 && style.egrene < 0.6, `${cle} : trop de notes égrenées`);
    assert.ok(style.accords.length >= 3, `${cle} : trop peu d’accords pour ne pas lasser`);
    for (const { basse, notes } of style.accords) {
      assert.ok(basse >= 33 && basse <= 48, `${cle} : basse ${basse}`);
      assert.ok(notes.length >= 3, `${cle} : accord trop maigre`);
      // Égrenées une octave plus haut, les notes ne doivent pas devenir criardes.
      for (const n of notes) assert.ok(n >= 48 && n + 12 <= 86, `${cle} : note ${n}`);
    }
  }
});

test('le casino swingue : une mesure par accord, une note de basse par temps', () => {
  const { style } = MUSIQUES.casino;
  assert.equal(style.genre, 'swing');
  if (style.genre !== 'swing') return;
  assert.ok(style.tempo >= 110 && style.tempo <= 160, `tempo ${style.tempo} : pas assez nerveux`);
  assert.ok(style.mesures.length >= 4);
  for (const { notes, marche } of style.mesures) {
    assert.equal(marche.length, 4, 'quatre pas de contrebasse par mesure');
    for (const n of marche) assert.ok(n >= 40 && n <= 60, `basse ${n}`);
    for (const n of notes) assert.ok(n >= 48 && n <= 74, `note ${n}`);
  }
  for (const n of style.gamme) assert.ok(n + 12 <= 86, `phrase trop aiguë : ${n}`);
});
