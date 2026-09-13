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

test('deux morceaux ne se ressemblent jamais : ils diffèrent par leurs instruments', () => {
  // La nappe, la valse, et deux swings qui ne partagent ni batterie, ni piano,
  // ni façon de marcher. Des accords différents ne suffisaient pas : on
  // n'entendait que la même nappe.
  const empreinte = (cle: keyof typeof MUSIQUES) => {
    const s = MUSIQUES[cle].style;
    return s.genre === 'swing' ? `swing/${s.batterie}/${s.piano}/${s.basse}` : s.genre;
  };
  const empreintes = ORDRE_MUSIQUES.map(empreinte);
  assert.equal(new Set(empreintes).size, empreintes.length, empreintes.join(' · '));
  const { casino, salon } = MUSIQUES;
  if (casino.style.genre === 'swing' && salon.style.genre === 'swing') {
    assert.notEqual(casino.style.batterie, salon.style.batterie);
    assert.notEqual(casino.style.piano, salon.style.piano);
    assert.ok(casino.style.tempo - salon.style.tempo >= 30, 'le salon doit être nettement plus lent');
  }
});

test('la nappe reste calme, dans une tessiture raisonnable', () => {
  for (const [cle, { style }] of Object.entries(MUSIQUES)) {
    if (style.genre !== 'nappe') continue;
    assert.ok(style.tempo >= 40 && style.tempo <= 80, `${cle} : tempo ${style.tempo}`);
    assert.ok(style.egrene > 0 && style.egrene < 0.6, `${cle} : trop de clochettes`);
    assert.ok(style.accords.length >= 3, `${cle} : trop peu d’accords pour ne pas lasser`);
    for (const { basse, notes } of style.accords) {
      assert.ok(basse >= 33 && basse <= 48, `${cle} : basse ${basse}`);
      assert.ok(notes.length >= 3, `${cle} : accord trop maigre`);
      for (const n of notes) assert.ok(n >= 48 && n + 12 <= 86, `${cle} : note ${n}`);
    }
  }
});

test('les swings : une mesure par accord, quatre pas de contrebasse', () => {
  for (const [cle, { style }] of Object.entries(MUSIQUES)) {
    if (style.genre !== 'swing') continue;
    assert.ok(style.tempo >= 70 && style.tempo <= 160, `${cle} : tempo ${style.tempo}`);
    assert.ok(style.mesures.length >= 4, `${cle} : trop peu de mesures`);
    for (const { notes, marche } of style.mesures) {
      assert.equal(marche.length, 4, `${cle} : quatre pas de contrebasse par mesure`);
      for (const n of marche) assert.ok(n >= 40 && n <= 60, `${cle} : basse ${n}`);
      for (const n of notes) assert.ok(n >= 48 && n <= 74, `${cle} : note ${n}`);
    }
    for (const n of style.gamme) assert.ok(n + 12 <= 86, `${cle} : phrase trop aiguë (${n})`);
  }
  const { casino } = MUSIQUES;
  assert.ok(casino.style.tempo >= 110, 'le casino doit rester nerveux');
});

test('la valse : un accordéon qui tient dans le registre, une basse qui alterne', () => {
  const { style } = MUSIQUES.cabaret;
  assert.equal(style.genre, 'valse');
  if (style.genre !== 'valse') return;
  assert.ok(style.tempo >= 120 && style.tempo <= 190, `tempo ${style.tempo}`);
  for (const { notes, basses } of style.mesures) {
    assert.ok(basses.length >= 1);
    for (const n of basses) assert.ok(n >= 36 && n <= 55, `basse ${n}`);
    for (const n of notes) assert.ok(n >= 52 && n <= 72, `note ${n}`);
  }
  for (const n of style.gamme) assert.ok(n >= 60 && n <= 86, `mélodie ${n}`);
});
