import test from 'node:test';
import assert from 'node:assert/strict';

import type { Card, GameState, Rank } from '../src/engine/types.ts';
import {
  RegleViolee, apply, assignRoles, createGame, legalPlays, viewFor,
} from '../src/engine/game.ts';
import { botAction } from '../src/engine/bot.ts';
import { makeDeck, sortHand } from '../src/engine/cards.ts';

/* ------------------------------------------------------------- outillage */

const RANK_DE: Record<string, Rank> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  V: 11, D: 12, R: 13, A: 14, '2': 15,
};

/** "D♠" -> la dame de pique. */
function carte(label: string): Card {
  const suit = label.slice(-1) as Card['suit'];
  const rank = RANK_DE[label.slice(0, -1)];
  assert.ok(rank, `Étiquette de carte inconnue : ${label}`);
  return { id: rank + suit, rank, suit };
}

const ids = (cards: Card[]) => cards.map((c) => c.id);

/** Une partie dont on impose les mains, pour tester un cas précis. */
function partie(mains: Record<string, string[]>, turn = 0): GameState {
  const noms = Object.keys(mains);
  const state = createGame(noms.map((id) => ({ id, name: id })), 42);
  for (const p of state.players) {
    p.hand = sortHand(mains[p.id].map(carte));
    p.passed = false;
    p.finishedAt = null;
    p.finishedOnTwo = false;
    p.role = null;
  }
  state.phase = 'jeu';
  state.turn = turn;
  state.pile = [];
  state.requirement = null;
  state.lastPlayer = null;
  state.finishOrder = [];
  state.pendingReturns = [];
  return state;
}

const QUATRE = ['a', 'b', 'c', 'd'];
const nouvelle = (n = 4, seed = 7) =>
  createGame(QUATRE.slice(0, n).concat(['e', 'f'].slice(0, Math.max(0, n - 4)))
    .map((id) => ({ id, name: id.toUpperCase(), isBot: true })), seed);

/* ------------------------------------------------------------- le paquet */

test('le paquet compte 52 cartes distinctes, 4 par hauteur', () => {
  const deck = makeDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(ids(deck)).size, 52);
  for (const rank of new Set(deck.map((c) => c.rank))) {
    assert.equal(deck.filter((c) => c.rank === rank).length, 4);
  }
});

test('le 2 est la carte la plus forte, devant l’As', () => {
  assert.ok(carte('2♠').rank > carte('A♠').rank);
  assert.ok(carte('A♠').rank > carte('R♠').rank);
  assert.ok(carte('3♠').rank < carte('4♠').rank);
});

test('tout le paquet est distribué, à une carte près entre joueurs', () => {
  for (const n of [4, 5, 6]) {
    const state = nouvelle(n, 3);
    const tailles = state.players.map((p) => p.hand.length);
    assert.equal(tailles.reduce((a, b) => a + b, 0), 52, `${n} joueurs`);
    assert.ok(Math.max(...tailles) - Math.min(...tailles) <= 1, `${n} joueurs`);
    assert.equal(new Set(state.players.flatMap((p) => ids(p.hand))).size, 52);
  }
});

test('le nombre de joueurs est borné à 4-6', () => {
  assert.throws(() => createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]), RegleViolee);
  assert.throws(
    () => createGame('abcdefg'.split('').map((id) => ({ id, name: id }))),
    RegleViolee,
  );
});

/* ------------------------------------------------------------- une série */

test('il faut poser le même nombre de cartes, strictement plus fort', () => {
  const state = partie({
    a: ['7♠', '7♥', '5♣'], b: ['8♠', '8♥', '9♣'], c: ['R♠', '4♥'], d: ['A♠', '3♥'],
  });

  const apresA = apply(state, { type: 'poser', player: 'a', cards: ['7♠', '7♥'].map((l) => carte(l).id) });
  assert.deepEqual(apresA.requirement, { rank: 7, count: 2 });

  // Une seule carte ne suit pas une doublette.
  assert.throws(
    () => apply(apresA, { type: 'poser', player: 'b', cards: [carte('9♣').id] }),
    RegleViolee,
  );
  // Une doublette plus faible non plus.
  const faible = partie({ a: ['6♠', '6♥'], b: ['5♠', '5♥'], c: ['R♠'], d: ['A♠'] });
  const pose = apply(faible, { type: 'poser', player: 'a', cards: ['6♠', '6♥'].map((l) => carte(l).id) });
  assert.throws(
    () => apply(pose, { type: 'poser', player: 'b', cards: ['5♠', '5♥'].map((l) => carte(l).id) }),
    RegleViolee,
  );
  // Une doublette plus forte, oui.
  const monte = apply(apresA, { type: 'poser', player: 'b', cards: ['8♠', '8♥'].map((l) => carte(l).id) });
  assert.deepEqual(monte.requirement, { rank: 8, count: 2 });
});

test('les cartes posées ensemble sont de même hauteur', () => {
  const state = partie({ a: ['7♠', '8♥'], b: ['9♠'], c: ['R♠'], d: ['A♠'] });
  assert.throws(
    () => apply(state, { type: 'poser', player: 'a', cards: ['7♠', '8♥'].map((l) => carte(l).id) }),
    RegleViolee,
  );
});

test('on ne joue pas hors de son tour', () => {
  const state = partie({ a: ['7♠'], b: ['9♠'], c: ['R♠'], d: ['A♠'] });
  assert.throws(
    () => apply(state, { type: 'poser', player: 'b', cards: [carte('9♠').id] }),
    RegleViolee,
  );
});

test('on ne passe pas quand on ouvre une série', () => {
  const state = partie({ a: ['7♠'], b: ['9♠'], c: ['R♠'], d: ['A♠'] });
  assert.equal(viewFor(state, 'a').canPass, false);
  assert.throws(() => apply(state, { type: 'passer', player: 'a' }), RegleViolee);
});

test('un joueur qui a passé ne revient plus dans la série en cours', () => {
  let state = partie({
    a: ['4♠', '3♥'], b: ['5♠', '3♦'], c: ['6♠', '3♣'], d: ['R♠', 'A♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('4♠').id] });
  state = apply(state, { type: 'passer', player: 'b' });      // b se met hors jeu
  state = apply(state, { type: 'poser', player: 'c', cards: [carte('6♠').id] });
  state = apply(state, { type: 'poser', player: 'd', cards: [carte('R♠').id] });

  // Le tour revient à a (b est passé), pas à b.
  assert.equal(state.order[state.turn], 'a');
  assert.equal(legalPlays(state, 'b').length, 0);
  assert.throws(
    () => apply(state, { type: 'poser', player: 'b', cards: [carte('3♦').id] }),
    RegleViolee,
  );
});

test('le dernier joueur à avoir posé ouvre la série suivante', () => {
  let state = partie({
    a: ['4♠', '3♥'], b: ['R♠', '3♦'], c: ['6♠', '3♣'], d: ['5♠', '4♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('4♠').id] });
  state = apply(state, { type: 'poser', player: 'b', cards: [carte('R♠').id] });
  state = apply(state, { type: 'passer', player: 'c' });
  state = apply(state, { type: 'passer', player: 'd' });
  state = apply(state, { type: 'passer', player: 'a' });

  assert.equal(state.requirement, null, 'la série est close');
  assert.equal(state.pile.length, 0);
  assert.equal(state.order[state.turn], 'b', 'b avait le dernier mot');
  assert.ok(state.players.every((p) => !p.passed), 'tout le monde revient en jeu');
});

test('si le maître de la série a fini ses cartes, son voisin ouvre la suivante', () => {
  let state = partie({
    a: ['4♠'], b: ['R♠', '3♦'], c: ['6♠', '3♣'], d: ['5♠', '4♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('4♠').id] }); // a sort
  assert.deepEqual(state.finishOrder, ['a']);
  state = apply(state, { type: 'passer', player: 'b' });
  state = apply(state, { type: 'passer', player: 'c' });
  state = apply(state, { type: 'passer', player: 'd' });

  assert.equal(state.order[state.turn], 'b', 'le voisin de gauche de a reprend la main');
});

test('la série se termine dès que tous les autres ont passé', () => {
  let state = partie({
    a: ['4♠', '3♥'], b: ['5♠', '3♦'], c: ['6♠', '3♣'], d: ['R♠', '4♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('4♠').id] });
  state = apply(state, { type: 'passer', player: 'b' });
  state = apply(state, { type: 'passer', player: 'c' });
  state = apply(state, { type: 'passer', player: 'd' });
  assert.equal(state.order[state.turn], 'a');
  assert.equal(state.requirement, null);
});

/* --------------------------------------------------------- fin de manche */

test('les rôles suivent l’ordre de sortie (4 joueurs)', () => {
  let state = partie({
    a: ['3♠'], b: ['4♠'], c: ['5♠'], d: ['R♠', 'A♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('3♠').id] });
  state = apply(state, { type: 'poser', player: 'b', cards: [carte('4♠').id] });
  state = apply(state, { type: 'poser', player: 'c', cards: [carte('5♠').id] });

  assert.equal(state.phase, 'fin-de-manche');
  assert.deepEqual(state.finishOrder, ['a', 'b', 'c', 'd']);
  assert.equal(state.players.find((p) => p.id === 'a')!.role, 'boss');
  assert.equal(state.players.find((p) => p.id === 'b')!.role, 'sous-boss');
  assert.equal(state.players.find((p) => p.id === 'c')!.role, 'sur-larbin');
  assert.equal(state.players.find((p) => p.id === 'd')!.role, 'larbin');
});

test('à 5 et 6 joueurs, les places du milieu sont neutres', () => {
  for (const n of [5, 6]) {
    const state = nouvelle(n, 11);
    state.finishOrder = state.order.slice();
    for (const p of state.players) p.hand = [];
    assignRoles(state);
    const roles = state.order.map((id) => state.players.find((p) => p.id === id)!.role);
    assert.equal(roles[0], 'boss');
    assert.equal(roles[1], 'sous-boss');
    assert.equal(roles[n - 2], 'sur-larbin');
    assert.equal(roles[n - 1], 'larbin');
    assert.equal(roles.filter((r) => r === 'neutre').length, n - 4, `${n} joueurs`);
  }
});

test('finir en posant un 2 rend Larbin, même en sortant premier', () => {
  let state = partie({
    a: ['2♠'], b: ['4♠'], c: ['5♠'], d: ['R♠', 'A♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('2♠').id] });
  assert.equal(state.players.find((p) => p.id === 'a')!.finishedOnTwo, true);

  // Personne ne bat un 2 : la série s'arrête et b ouvre la suivante.
  state = apply(state, { type: 'passer', player: 'b' });
  state = apply(state, { type: 'passer', player: 'c' });
  state = apply(state, { type: 'passer', player: 'd' });
  assert.equal(state.order[state.turn], 'b');

  state = apply(state, { type: 'poser', player: 'b', cards: [carte('4♠').id] });
  state = apply(state, { type: 'poser', player: 'c', cards: [carte('5♠').id] });

  const role = (id: string) => state.players.find((p) => p.id === id)!.role;
  assert.equal(role('a'), 'larbin', 'sorti premier mais sur un 2');
  assert.equal(role('b'), 'boss');
  assert.equal(role('c'), 'sous-boss');
  assert.equal(role('d'), 'sur-larbin');
});

test('finir sur une doublette de 2 compte aussi', () => {
  let state = partie({
    a: ['2♠', '2♥'], b: ['4♠', '4♥'], c: ['5♠', '5♥'], d: ['R♠', 'A♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: ['2♠', '2♥'].map((l) => carte(l).id) });
  state = apply(state, { type: 'passer', player: 'b' });
  state = apply(state, { type: 'passer', player: 'c' });
  state = apply(state, { type: 'passer', player: 'd' });
  state = apply(state, { type: 'poser', player: 'b', cards: ['4♠', '4♥'].map((l) => carte(l).id) });
  state = apply(state, { type: 'poser', player: 'c', cards: ['5♠', '5♥'].map((l) => carte(l).id) });
  assert.equal(state.players.find((p) => p.id === 'a')!.role, 'larbin');
});

/* ---------------------------------------------------------- les échanges */

test('début de manche : dons imposés, cartes rendues au choix, le Boss commence', () => {
  let state = nouvelle(4, 5);
  // On force une fin de manche connue.
  state.finishOrder = ['a', 'b', 'c', 'd'];
  for (const p of state.players) p.hand = [];
  assignRoles(state);
  state.phase = 'fin-de-manche';

  state = apply(state, { type: 'manche-suivante' });
  assert.equal(state.phase, 'echange');

  const boss = state.players.find((p) => p.id === 'a')!;
  const larbin = state.players.find((p) => p.id === 'd')!;
  const sousBoss = state.players.find((p) => p.id === 'b')!;
  const surLarbin = state.players.find((p) => p.id === 'c')!;

  assert.equal(boss.hand.length, 15, 'le Boss a reçu 2 cartes');
  assert.equal(larbin.hand.length, 11, 'le Larbin en a lâché 2');
  assert.equal(sousBoss.hand.length, 14);
  assert.equal(surLarbin.hand.length, 12);

  const donsAuBoss = state.pendingReturns.find((r) => r.from === 'a')!;
  assert.equal(donsAuBoss.received.length, 2);
  // Les cartes données sont bien les 2 meilleures du Larbin.
  const meilleures = sortHand([...larbin.hand, ...donsAuBoss.received]).slice(0, 2);
  assert.deepEqual(ids(donsAuBoss.received).sort(), ids(meilleures).sort());

  // Le Boss rend ce qu'il veut, même en cassant une paire.
  const rendues = ids(sortHand(boss.hand).slice(-2));
  state = apply(state, { type: 'rendre', player: 'a', cards: rendues });
  assert.equal(state.phase, 'echange', 'le Sous-Boss doit encore rendre');
  state = apply(state, { type: 'rendre', player: 'b', cards: ids(sortHand(sousBoss.hand).slice(-1)) });

  assert.equal(state.phase, 'jeu');
  assert.equal(state.order[state.turn], 'a', 'le Boss ouvre la manche');
  assert.deepEqual(state.players.map((p) => p.hand.length).sort(), [13, 13, 13, 13]);
});

test('les neutres n’échangent rien', () => {
  let state = nouvelle(6, 9);
  state.finishOrder = ['a', 'b', 'c', 'd', 'e', 'f'];
  for (const p of state.players) p.hand = [];
  assignRoles(state);
  state.phase = 'fin-de-manche';
  state = apply(state, { type: 'manche-suivante' });

  const neutres = state.players.filter((p) => p.role === 'neutre');
  assert.equal(neutres.length, 2);
  for (const n of neutres) {
    assert.ok(!state.pendingReturns.some((r) => r.from === n.id || r.to === n.id));
  }
});

test('un joueur arrivé en cours de partie devient Larbin', () => {
  const state = nouvelle(4, 13);
  state.finishOrder = ['a', 'b', 'c', 'd'];
  for (const p of state.players) p.hand = [];
  state.players.find((p) => p.id === 'a')!.joinedLate = true;
  assignRoles(state);

  const role = (id: string) => state.players.find((p) => p.id === id)!.role;
  assert.equal(role('a'), 'larbin', 'sorti premier, mais il vient d’arriver');
  assert.equal(role('d'), 'boss', 'l’ancien Larbin hérite de sa place');
});

/* ------------------------------------------------- parties complètes (bots) */

/** Fait jouer les bots jusqu'à la fin de la manche. Renvoie l'état final. */
function jouerUneManche(state: GameState): GameState {
  let s = state;
  for (let coup = 0; coup < 2000; coup++) {
    if (s.phase === 'fin-de-manche') return s;
    const acteur = s.phase === 'echange'
      ? s.pendingReturns[0].from
      : s.order[s.turn];
    const action = botAction(viewFor(s, acteur));
    assert.ok(action, `le bot ${acteur} n'a rien à jouer (phase ${s.phase})`);
    s = apply(s, action);
  }
  throw new Error('La manche ne se termine pas.');
}

test('200 parties de bots : aucune règle violée, aucune carte perdue', () => {
  for (let seed = 0; seed < 200; seed++) {
    const n = 4 + (seed % 3);
    let state = nouvelle(n, seed * 7919 + 1);

    for (let manche = 0; manche < 3; manche++) {
      const avant = state.players.flatMap((p) => ids(p.hand));
      assert.equal(avant.length, 52, `manche ${manche}, graine ${seed}`);
      assert.equal(new Set(avant).size, 52, 'des cartes en double');

      state = jouerUneManche(state);

      assert.equal(state.finishOrder.length, n, 'tout le monde doit être classé');
      assert.equal(new Set(state.finishOrder).size, n);
      const roles = state.players.map((p) => p.role);
      for (const attendu of ['boss', 'sous-boss', 'sur-larbin', 'larbin']) {
        assert.equal(roles.filter((r) => r === attendu).length, 1, `un seul ${attendu}`);
      }
      // La manche s'arrête quand il ne reste qu'un joueur : le Larbin garde ses cartes.
      assert.equal(state.players.filter((p) => p.hand.length > 0).length, 1);

      state = apply(state, { type: 'manche-suivante' });
    }
  }
});

test('un bot ne propose jamais un coup illégal', () => {
  for (let seed = 0; seed < 40; seed++) {
    let s = nouvelle(4 + (seed % 3), seed * 31 + 5);
    for (let coup = 0; coup < 600 && s.phase !== 'fin-de-manche'; coup++) {
      const acteur = s.phase === 'echange' ? s.pendingReturns[0].from : s.order[s.turn];
      const action = botAction(viewFor(s, acteur))!;
      if (action.type === 'poser') {
        const legal = legalPlays(s, acteur).map((play) => ids(play).sort().join(','));
        assert.ok(
          legal.includes(action.cards.slice().sort().join(',')),
          `coup hors des possibilités légales (graine ${seed})`,
        );
      }
      if (action.type === 'passer') {
        assert.ok(viewFor(s, acteur).canPass, `passe interdite (graine ${seed})`);
      }
      s = apply(s, action);
    }
  }
});

test('une main ne grossit jamais pendant le jeu', () => {
  let s = nouvelle(5, 2024);
  let tailles = s.players.map((p) => p.hand.length);
  for (let coup = 0; coup < 600 && s.phase !== 'fin-de-manche'; coup++) {
    const acteur = s.phase === 'echange' ? s.pendingReturns[0].from : s.order[s.turn];
    s = apply(s, botAction(viewFor(s, acteur))!);
    const suivantes = s.players.map((p) => p.hand.length);
    suivantes.forEach((t, i) => assert.ok(t <= tailles[i], 'une main a grossi'));
    tailles = suivantes;
  }
});

test('la vue d’un joueur ne révèle pas les mains adverses', () => {
  const state = nouvelle(4, 77);
  const vue = viewFor(state, 'a');
  assert.equal(vue.me.hand.length, 13);
  assert.deepEqual(vue.others.map((o) => o.count), [13, 13, 13]);
  assert.ok(!JSON.stringify(vue.others).includes('suit'), 'aucune carte adverse ne fuite');
});
