import test from 'node:test';
import assert from 'node:assert/strict';

import type { Card, GameState, Rank } from '../src/engine/types.ts';
import { apply, createGame, viewFor } from '../src/engine/game.ts';
import { sortHand } from '../src/engine/cards.ts';
import { reactionDesBots } from '../src/web/humeurs.ts';

const RANG: Record<string, Rank> = {
  3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, V: 11, D: 12, R: 13, A: 14, 2: 15,
};

function carte(label: string): Card {
  const suit = label.slice(-1) as Card['suit'];
  const rank = RANG[label.slice(0, -1)];
  return { id: `${rank}${suit}`, rank, suit };
}

/** Moi (`a`) contre trois bots ; `tour` dit qui ouvre. */
function partie(mains: Record<string, string[]>, tour = 'a'): GameState {
  const ids = Object.keys(mains);
  const etat = createGame(ids.map((id) => ({ id, name: id, isBot: id !== 'a' })), 7);
  for (const p of etat.players) {
    p.hand = sortHand(mains[p.id].map(carte));
    p.aAgi = false;
    p.passed = false;
    p.finishedAt = null;
    p.finishedOnTwo = false;
    p.role = null;
  }
  Object.assign(etat, { phase: 'jeu', pile: [], requirement: null, lastPlayer: null, log: [] });
  etat.turn = etat.order.indexOf(tour);
  return etat;
}

const poser = (etat: GameState, player: string, label: string) =>
  apply(etat, { type: 'poser', player, cards: [carte(label).id] });

/** Réagit toujours, et choisit toujours le premier. */
const toujours = () => 0;
const jamais = () => 0.99;

const humeur = (avant: GameState, apres: GameState, hasard: () => number) =>
  reactionDesBots(viewFor(avant, 'a'), viewFor(apres, 'a'), hasard);

const MAINS = {
  a: ['2♠', '8♥', '9♦'],
  b: ['4♥', '5♦', '6♣'],
  c: ['4♠', '6♥', '7♣'],
  d: ['5♠', '7♥', '3♣'],
};

test('mon 2 qui coupe fait parfois grimacer un bot', () => {
  const avant = partie(MAINS);
  const apres = poser(avant, 'a', '2♠');
  assert.deepEqual(humeur(avant, apres, toujours), { de: 'b', reaction: '😱' });
  assert.equal(humeur(avant, apres, jamais), null);
});

test('un bot qui coupe au 2 se félicite', () => {
  const avant = partie({ ...MAINS, b: ['2♥', '5♦', '6♣'] }, 'b');
  const apres = poser(avant, 'b', '2♥');
  assert.deepEqual(humeur(avant, apres, toujours), { de: 'b', reaction: '🔥' });
});

test('un bot qui sort le premier se couronne', () => {
  const avant = partie({ ...MAINS, b: ['9♣'] }, 'b');
  const apres = poser(avant, 'b', '9♣');
  assert.deepEqual(humeur(avant, apres, toujours), { de: 'b', reaction: '👑' });
});

test('finir sur un 2 fait rire la table', () => {
  const avant = partie({ ...MAINS, a: ['2♠'] });
  const apres = poser(avant, 'a', '2♠');
  assert.equal(viewFor(apres, 'a').me.finishedOnTwo, true);
  // Le rire l'emporte sur la grimace du 2 qui coupe.
  assert.deepEqual(humeur(avant, apres, toujours), { de: 'b', reaction: '😂' });
});

test('sortir le premier, proprement, vaut des applaudissements', () => {
  const avant = partie({ ...MAINS, a: ['9♦'] });
  const apres = poser(avant, 'a', '9♦');
  assert.deepEqual(humeur(avant, apres, toujours), { de: 'b', reaction: '👏' });
});

test('un coup ordinaire, ou une autre partie, ne font réagir personne', () => {
  const avant = partie(MAINS);
  assert.equal(humeur(avant, poser(avant, 'a', '8♥'), toujours), null);
  assert.equal(humeur(poser(avant, 'a', '2♠'), partie(MAINS), toujours), null);
});
