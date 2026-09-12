import test from 'node:test';
import assert from 'node:assert/strict';

import type { Card, GameState, Rank } from '../src/engine/types.ts';
import { apply, createGame, viewFor } from '../src/engine/game.ts';
import { sortHand } from '../src/engine/cards.ts';
import type { EtatSalon, Siege } from '../src/reseau/protocole.ts';
import { RIEN, quoiEntendre, type Instant } from '../src/web/bruitages.ts';

const RANG: Record<string, Rank> = {
  3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, V: 11, D: 12, R: 13, A: 14, 2: 15,
};

function carte(label: string): Card {
  const suit = label.slice(-1) as Card['suit'];
  const rank = RANG[label.slice(0, -1)];
  return { id: `${rank}${suit}`, rank, suit };
}

/** Une manche dont on impose les mains ; c'est à `a` d'ouvrir. */
function partie(mains: Record<string, string[]>): GameState {
  const etat = createGame(Object.keys(mains).map((id) => ({ id, name: id })), 7);
  for (const p of etat.players) {
    p.hand = sortHand(mains[p.id].map(carte));
    p.aAgi = false;
    p.passed = false;
    p.finishedAt = null;
    p.finishedOnTwo = false;
    p.role = null;
  }
  Object.assign(etat, { phase: 'jeu', pile: [], requirement: null, lastPlayer: null, turn: 0, log: [] });
  return etat;
}

const vu = (etat: GameState, id = 'a'): Instant => ({ vue: viewFor(etat, id), salon: null });
const poser = (etat: GameState, player: string, label: string) =>
  apply(etat, { type: 'poser', player, cards: [carte(label).id] });
const passer = (etat: GameState, player: string) => apply(etat, { type: 'passer', player });

const MAINS = {
  a: ['8♠', '3♥', '9♦'],
  b: ['4♥', '5♦', '6♣'],
  c: ['4♠', '6♥', '7♣'],
  d: ['5♠', '7♥', '3♣'],
};

test('au premier regard, rien ne sonne', () => {
  assert.deepEqual(quoiEntendre(RIEN, vu(partie(MAINS)), 'a', true), []);
});

test('une carte posée fait son bruit', () => {
  const avant = partie(MAINS);
  const apres = poser(avant, 'a', '8♠');
  assert.deepEqual(quoiEntendre(vu(avant), vu(apres), 'a', false), ['carte']);
});

test('un 2 ne sonne pas comme une autre carte', () => {
  const avant = partie({ ...MAINS, a: ['2♠', '3♥', '9♦'] });
  const apres = poser(avant, 'a', '2♠');
  assert.deepEqual(quoiEntendre(vu(avant), vu(apres), 'a', false), ['deux']);
});

test('une passe s’entend, même celle qui ferme la série', () => {
  let etat = passer(passer(poser(partie(MAINS), 'a', '8♠'), 'b'), 'c');
  const avant = etat;
  etat = passer(etat, 'd');
  // La série est close : plus aucun drapeau « a passé » ne subsiste.
  assert.equal(viewFor(etat, 'a').others.some((o) => o.passed), false);
  assert.ok(quoiEntendre(vu(avant), vu(etat), 'a', false).includes('passe'));
});

test('« à vous » ne sonne qu’en ligne, et au moment où le tour arrive', () => {
  const avant = passer(passer(poser(partie(MAINS), 'a', '8♠'), 'b'), 'c');
  const apres = passer(avant, 'd');
  assert.ok(quoiEntendre(vu(avant), vu(apres), 'a', true).includes('a-vous'));
  assert.ok(!quoiEntendre(vu(avant), vu(apres), 'a', false).includes('a-vous'));
  // Toujours mon tour : on ne carillonne pas deux fois.
  assert.ok(!quoiEntendre(vu(apres), vu(apres), 'a', true).includes('a-vous'));
});

test('une nouvelle partie n’est pas un coup joué', () => {
  const une = poser(partie(MAINS), 'a', '8♠');
  const autre = partie(MAINS);
  assert.deepEqual(quoiEntendre(vu(une), vu(autre), 'a', true), []);
});

/* ---------------------------------------------------------------- salon */

const siege = (id: string, estBot = false, connecte = true): Siege =>
  ({ id, nom: id, estBot, connecte, hote: false, pret: false });

const salon = (sieges: Siege[], code = 'ABCD'): Instant => ({
  vue: null,
  salon: { code, sieges, publique: true } as EtatSalon,
});

test('une clochette quand quelqu’un s’assoit, une autre quand il s’en va', () => {
  const seule = salon([siege('moi')]);
  const deux = salon([siege('moi'), siege('bruno')]);
  assert.deepEqual(quoiEntendre(seule, deux, 'moi', true), ['arrivee']);
  assert.deepEqual(quoiEntendre(deux, seule, 'moi', true), ['depart']);
  assert.deepEqual(quoiEntendre(deux, salon([siege('moi'), siege('bruno', false, false)]), 'moi', true), ['depart']);
});

test('reprendre la place d’un bot compte comme une arrivée ; les bots, eux, sont muets', () => {
  const avecBot = salon([siege('moi'), siege('bot1', true)]);
  assert.deepEqual(quoiEntendre(salon([siege('moi')]), avecBot, 'moi', true), []);
  assert.deepEqual(quoiEntendre(avecBot, salon([siege('moi'), siege('bot1')]), 'moi', true), ['arrivee']);
});

test('ma propre arrivée, ou un autre salon, ne font pas de bruit', () => {
  assert.deepEqual(quoiEntendre(salon([]), salon([siege('moi')]), 'moi', true), []);
  assert.deepEqual(quoiEntendre(salon([siege('moi')], 'ABCD'), salon([siege('moi'), siege('x')], 'EFGH'), 'moi', true), []);
});
