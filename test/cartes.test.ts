import test from 'node:test';
import assert from 'node:assert/strict';

import { RANKS } from '../src/engine/cards.ts';
import { POINTS, dessinDeCarte } from '../src/web/cartes.ts';

test('une carte à points porte autant de points que sa hauteur', () => {
  for (const rang of [3, 4, 5, 6, 7, 8, 9, 10] as const) {
    assert.equal(POINTS[rang]?.length, rang, `le ${rang}`);
    assert.equal(dessinDeCarte(rang, '♠').split('♠').length - 1, rang, `le ${rang} dessiné`);
  }
});

test('chaque hauteur a son dessin : points, figure, as, et la couronne pour le 2', () => {
  for (const rang of RANKS) assert.ok(dessinDeCarte(rang, '♥').length > 0, `la hauteur ${rang}`);
  const figures = [11, 12, 13].map((r) => dessinDeCarte(r as 11 | 12 | 13, '♦'));
  assert.ok(figures.every((f) => f.includes('class="figure"')));
  assert.equal(new Set(figures).size, 3, 'Valet, Dame et Roi ne se ressemblent pas');
  assert.match(dessinDeCarte(15, '♣'), /couronne/);
  assert.doesNotMatch(dessinDeCarte(14, '♣'), /couronne/);
});
