import test from 'node:test';
import assert from 'node:assert/strict';

import type { Card } from '../src/engine/types.ts';
import {
  SUCCES, debloquer, memoireVide, relire, succesDeMain, succesDeManche, succesDePartie,
  type FinDePartie,
} from '../src/web/succes.ts';

const carte = (rank: number, suit: Card['suit']): Card => ({ id: `${rank}${suit}`, rank: rank as Card['rank'], suit });
const fin = (autres: Partial<FinDePartie> = {}): FinDePartie =>
  ({ gagne: false, enLigne: false, manches: 3, parties: 1, serie: 0, ...autres });

test('de Larbin à Boss : il faut que le Boss suive immédiatement le Larbin', () => {
  const m = memoireVide();
  assert.deepEqual(succesDeManche(m, 'p', 1, 'larbin', false), []);
  assert.ok(succesDeManche(m, 'p', 2, 'boss', false).includes('larbin-boss'));
  const autre = memoireVide();
  succesDeManche(autre, 'p', 1, 'larbin', false);
  succesDeManche(autre, 'p', 2, 'neutre', false);
  assert.ok(!succesDeManche(autre, 'p', 3, 'boss', false).includes('larbin-boss'));
});

test('Boss d’entrée, puis trois fois de suite', () => {
  const m = memoireVide();
  assert.deepEqual(succesDeManche(m, 'p', 1, 'boss', false), ['boss-direct']);
  assert.deepEqual(succesDeManche(m, 'p', 2, 'boss', false), []);
  assert.deepEqual(succesDeManche(m, 'p', 3, 'boss', false), ['trois-boss']);
});

test('une manche n’est comptée qu’une fois, même si l’écran de fin revient', () => {
  const m = memoireVide();
  succesDeManche(m, 'p', 1, 'larbin', false);
  assert.ok(succesDeManche(m, 'p', 2, 'boss', false).includes('larbin-boss'));
  assert.deepEqual(succesDeManche(m, 'p', 2, 'boss', false), []);
});

test('une nouvelle partie repart de zéro', () => {
  const m = memoireVide();
  succesDeManche(m, 'ancienne', 1, 'larbin', false);
  assert.ok(!succesDeManche(m, 'nouvelle', 2, 'boss', false).includes('larbin-boss'));
});

test('finir sur un 2 se fête aussi', () => {
  assert.deepEqual(succesDeManche(memoireVide(), 'p', 1, 'larbin', true), ['fini-sur-deux']);
});

test('gagner sans jamais avoir été Larbin — à condition d’avoir tout joué', () => {
  const m = memoireVide();
  for (const [manche, role] of [[1, 'boss'], [2, 'neutre'], [3, 'boss']] as const) {
    succesDeManche(m, 'p', manche, role, false);
  }
  const ids = succesDePartie(m, 'p', fin({ gagne: true, manches: 3 }));
  assert.ok(ids.includes('premiere-victoire'));
  assert.ok(ids.includes('jamais-larbin'));

  // Arrivé à la deuxième manche : on ne sait rien de la première.
  const tard = memoireVide();
  succesDeManche(tard, 'q', 2, 'boss', false);
  succesDeManche(tard, 'q', 3, 'boss', false);
  assert.ok(!succesDePartie(tard, 'q', fin({ gagne: true, manches: 3 })).includes('jamais-larbin'));
});

test('la remontada : commencer Larbin et gagner quand même', () => {
  const m = memoireVide();
  succesDeManche(m, 'p', 1, 'larbin', false);
  succesDeManche(m, 'p', 2, 'boss', false);
  assert.ok(succesDePartie(m, 'p', fin({ gagne: true, manches: 2 })).includes('remontada'));
});

test('la fin de partie n’est comptée qu’une fois', () => {
  const m = memoireVide();
  assert.ok(succesDePartie(m, 'p', fin({ gagne: true })).includes('premiere-victoire'));
  assert.deepEqual(succesDePartie(m, 'p', fin({ gagne: true })), []);
});

test('séries, parties en ligne, et fidélité', () => {
  const ids = succesDePartie(memoireVide(), 'p', fin({ serie: 3, enLigne: true, parties: 50 }));
  for (const id of ['serie-trois', 'en-ligne', 'dix-parties', 'cinquante-parties'] as const) {
    assert.ok(ids.includes(id), id);
  }
});

test('le carré de 2, regardé une seule fois par donne', () => {
  const m = memoireVide();
  const main = [carte(15, '♠'), carte(15, '♥'), carte(15, '♦'), carte(15, '♣'), carte(9, '♠')];
  assert.deepEqual(succesDeMain(m, 'p', 1, main), ['quatre-deux']);
  assert.deepEqual(succesDeMain(m, 'p', 1, main), []);
  assert.deepEqual(succesDeMain(m, 'p', 2, main.slice(1)), []);
});

test('un succès obtenu garde sa première date', () => {
  const m = memoireVide();
  assert.deepEqual(debloquer(m, ['boss-direct', 'boss-direct'], '2026-09-01'), ['boss-direct']);
  assert.deepEqual(debloquer(m, ['boss-direct'], '2026-09-02'), []);
  assert.equal(m.obtenus['boss-direct'], '2026-09-01');
});

test('la mémoire relue du disque ne garde que ce qui a du sens', () => {
  const m = relire({
    obtenus: { 'boss-direct': '2026-09-01', inconnu: '2026-09-01', 'larbin-boss': 42 },
    partie: 'p',
    roles: { 1: 'larbin', 2: 'empereur', zero: 'boss' },
    mainVue: 7,
  });
  assert.deepEqual(m.obtenus, { 'boss-direct': '2026-09-01' });
  assert.deepEqual(m.roles, { 1: 'larbin' });
  assert.equal(m.mainVue, '');
  assert.deepEqual(relire('n’importe quoi'), memoireVide());
});

test('la liste des succès : des identifiants uniques, un nom et une consigne chacun', () => {
  assert.equal(new Set(SUCCES.map((s) => s.id)).size, SUCCES.length);
  for (const s of SUCCES) assert.ok(s.icone && s.nom && s.comment, s.id);
});
