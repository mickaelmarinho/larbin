import test from 'node:test';
import assert from 'node:assert/strict';

import { apply, viewFor } from '../src/engine/game.ts';
import { botAction } from '../src/engine/bot.ts';
import type { GameState, Role } from '../src/engine/types.ts';
import {
  DEFI_MANCHES, DEFI_MAXIMUM, bilanVierge, emojisDuDefi, graineDuJour, hasardDuDefi, noterLaManche, partieDuDefi,
  texteDuDefi,
} from '../src/web/defi.ts';

/** Joue le défi de bout en bout, chacun jouant comme le bot — « moi » compris. */
function jouerLeDefi(jour: string): { roles: Role[]; points: number; donne: string } {
  let e: GameState = partieDuDefi(jour);
  const donne = viewFor(e, 'moi').me.hand.map((c) => c.id).join(',');
  const roles: Role[] = [];
  for (let garde = 0; garde < 5000; garde++) {
    if (e.phase === 'fin-de-manche') {
      roles.push(e.players.find((p) => p.id === 'moi')!.role!);
      if (e.round === DEFI_MANCHES) break;
      e = apply(e, { type: 'manche-suivante' });
      continue;
    }
    const acteur = e.order[e.turn];
    const coup = botAction(viewFor(e, acteur), hasardDuDefi(e));
    assert.ok(coup, `personne ne joue (phase ${e.phase})`);
    e = apply(e, coup);
  }
  assert.equal(roles.length, DEFI_MANCHES, 'le défi va jusqu’à sa dernière manche');
  return { roles, points: e.players.find((p) => p.id === 'moi')!.points, donne };
}

test('le défi du jour se rejoue à l’identique : même donne, même hasard, même issue', () => {
  const a = jouerLeDefi('2026-09-27');
  const b = jouerLeDefi('2026-09-27');
  assert.deepEqual(a, b);
  assert.ok(a.points >= 0 && a.points <= DEFI_MAXIMUM);
});

test('chaque jour a sa donne', () => {
  assert.notEqual(graineDuJour('2026-09-27'), graineDuJour('2026-09-28'));
  assert.notEqual(jouerLeDefi('2026-09-27').donne, jouerLeDefi('2026-09-28').donne);
});

test('le bilan : chaque manche une fois, et le défi se clôt à la troisième', () => {
  let b = bilanVierge('2026-09-27');
  b = noterLaManche(b, 1, 'boss', 3);
  assert.equal(noterLaManche(b, 1, 'larbin', 3), b, 'revoir l’écran de fin ne recompte rien');
  b = noterLaManche(b, 2, 'sous-boss', 5);
  assert.equal(b.fini, false);
  b = noterLaManche(b, 3, 'larbin', 5);
  assert.equal(b.fini, true);
  assert.equal(noterLaManche(b, 3, 'boss', 8), b, 'un défi fini ne bouge plus');
  assert.equal(emojisDuDefi(b), '👑 🥈 🧹');
  assert.match(texteDuDefi(b), /^Le Larbin — défi du 27\/09 : 5\/9\n👑 🥈 🧹\n/);
});
