import test from 'node:test';
import assert from 'node:assert/strict';

import type { Card, GameState, Rank } from '../src/engine/types.ts';
import {
  RegleViolee, apply, assignRoles, cartesImposees, createGame, legalPlays, viewFor,
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

test('une série ne fait qu’un tour de table', () => {
  let state = partie({
    a: ['7♠', 'D♥'], b: ['9♠', '3♦'], c: ['6♠', '3♣'], d: ['V♠', '4♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('7♠').id] });
  state = apply(state, { type: 'poser', player: 'b', cards: [carte('9♠').id] });
  state = apply(state, { type: 'passer', player: 'c' });
  state = apply(state, { type: 'poser', player: 'd', cards: [carte('V♠').id] });

  // Chacun a parlé une fois : la série s'arrête là.
  assert.equal(state.requirement, null, 'le tour bouclé, la série est close');
  assert.equal(state.order[state.turn], 'd', 'le plus fort ouvre la suivante');
  // Les cartes gagnantes restent visibles jusqu'à ce que d rouvre.
  assert.deepEqual(ids(state.pile[state.pile.length - 1].cards), [carte('V♠').id]);

  // a avait une dame en main, mais il a déjà joué : il ne remonte pas.
  assert.throws(
    () => apply(state, { type: 'poser', player: 'a', cards: [carte('D♥').id] }),
    RegleViolee,
  );
});

test('le 2 coupe net : la série s’arrête sans finir le tour', () => {
  let state = partie({
    a: ['2♠', '3♥'], b: ['A♠', '3♦'], c: ['A♥', '3♣'], d: ['A♦', '4♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('2♠').id] });

  // b, c et d n'ont même pas eu à dire qu'ils passaient.
  assert.equal(state.requirement, null, 'la série est coupée');
  assert.equal(state.order[state.turn], 'a', 'celui qui coupe rouvre');
  assert.ok(state.players.every((p) => !p.aAgi), 'personne n’a été forcé de parler');
  assert.deepEqual(ids(state.pile[state.pile.length - 1].cards), [carte('2♠').id]);

  // Et a rouvre bel et bien, avec ce qu'il veut.
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('3♥').id] });
  assert.deepEqual(state.requirement, { rank: 3, count: 1 });
});

test('une doublette de 2 coupe aussi', () => {
  let state = partie({
    a: ['2♠', '2♥', '3♥'], b: ['A♠', 'A♦'], c: ['A♥', '3♣'], d: ['R♦', '4♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: ['2♠', '2♥'].map((l) => carte(l).id) });

  assert.equal(state.requirement, null);
  assert.equal(state.order[state.turn], 'a');
});

test('couper avec son dernier 2 laisse la main au voisin', () => {
  let state = partie({
    a: ['2♠'], b: ['A♠', '3♦'], c: ['A♥', '3♣'], d: ['A♦', '4♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('2♠').id] });

  assert.deepEqual(state.finishOrder, ['a']);
  assert.equal(state.order[state.turn], 'b', 'a n’a plus de cartes : son voisin ouvre');
  assert.equal(state.requirement, null);
});

test('celui qui a passé ne rejoue pas non plus dans la série', () => {
  let state = partie({
    a: ['4♠', '3♥'], b: ['5♠', 'A♦'], c: ['6♠', '3♣'], d: ['R♠', 'A♥'],
  });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('4♠').id] });
  state = apply(state, { type: 'passer', player: 'b' });

  assert.equal(state.order[state.turn], 'c', 'la parole va au suivant');
  assert.equal(legalPlays(state, 'b').length, 0);
  assert.throws(
    () => apply(state, { type: 'poser', player: 'b', cards: [carte('A♦').id] }),
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

  assert.equal(state.requirement, null, 'la série est close');
  assert.equal(state.order[state.turn], 'b', 'b avait le dernier mot');
  assert.deepEqual(ids(state.pile[state.pile.length - 1].cards), [carte('R♠').id]);
  assert.ok(
    state.players.every((p) => !p.passed && !p.aAgi),
    'tout le monde reprend la parole pour la série suivante',
  );
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

  // Le 2 coupe : ni b ni c ni d n'ont eu à passer, et b ouvre déjà.
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
  state = apply(state, { type: 'poser', player: 'b', cards: ['4♠', '4♥'].map((l) => carte(l).id) });
  state = apply(state, { type: 'poser', player: 'c', cards: ['5♠', '5♥'].map((l) => carte(l).id) });
  assert.equal(state.players.find((p) => p.id === 'a')!.role, 'larbin');
});

/* ---------------------------------------------------------- les échanges */

/** Une manche 2 prête à démarrer, avec des rôles connus. */
function mancheSuivante(seed: number, n = 4, coupe = 26): GameState {
  const state = nouvelle(n, seed);
  state.finishOrder = state.order.slice();
  for (const p of state.players) p.hand = [];
  assignRoles(state);
  state.phase = 'fin-de-manche';
  // Le tas de la manche écoulée : ici on le fabrique de toutes pièces.
  state.paquet = makeDeck();

  const aCouper = apply(state, { type: 'manche-suivante' });
  assert.equal(aCouper.phase, 'coupe', 'la manche attend que le Boss coupe');
  const boss = aCouper.players.find((x) => x.role === 'boss')!;
  return apply(aCouper, { type: 'couper', player: boss.id, position: coupe });
}

test('le tribut désigne les cartes les plus basses', () => {
  const main = (labels: string[]) => labels.map(carte);

  // Deux hauteurs distinctes : rien à décider.
  const net = cartesImposees(main(['3♠', '5♥', '9♣', 'R♦']), 2, 'rendre');
  assert.deepEqual(ids(net.forcees).sort(), ['3♠', '5♥']);
  assert.equal(net.aChoisir, 0);
  assert.deepEqual(net.candidats, []);

  // La paire de 3 occupe exactement les deux places : toujours rien à décider.
  const pile = cartesImposees(main(['3♠', '3♥', '9♣', 'R♦']), 2, 'rendre');
  assert.deepEqual(ids(pile.forcees).sort(), ['3♠', '3♥'].sort());
  assert.equal(pile.aChoisir, 0);

  // Un 3 puis trois 4 : le 3 part d'office, reste à choisir la couleur du 4.
  const frontiere = cartesImposees(main(['3♠', '4♥', '4♦', '4♣', 'R♦']), 2, 'rendre');
  assert.deepEqual(ids(frontiere.forcees), ['3♠']);
  assert.equal(frontiere.aChoisir, 1);
  assert.deepEqual(ids(frontiere.candidats).sort(), ['4♥', '4♦', '4♣'].sort());

  // Trois 3 pour deux places : deux couleurs à choisir parmi trois.
  const trois = cartesImposees(main(['3♠', '3♥', '3♦', '9♣']), 2, 'rendre');
  assert.deepEqual(trois.forcees, []);
  assert.equal(trois.aChoisir, 2);
  assert.equal(trois.candidats.length, 3);
});

test('en donnant, ce sont les cartes les plus hautes', () => {
  const main = (labels: string[]) => labels.map(carte);

  // Un 2 et un As : rien à décider.
  const net = cartesImposees(main(['2♠', 'A♥', '9♣', '3♦']), 2, 'donner');
  assert.deepEqual(ids(net.forcees).sort(), ['15♠', '14♥'].sort());
  assert.equal(net.aChoisir, 0);

  // Un 2 puis trois As : le 2 part d'office, la couleur de l'As se choisit.
  const frontiere = cartesImposees(main(['2♠', 'A♥', 'A♦', 'A♣', '3♦']), 2, 'donner');
  assert.deepEqual(ids(frontiere.forcees), ['15♠']);
  assert.equal(frontiere.aChoisir, 1);
  assert.deepEqual(ids(frontiere.candidats).sort(), ['14♥', '14♦', '14♣'].sort());
});

test('on ne mélange plus : le paquet garde l’ordre où les cartes sont tombées', () => {
  let state = nouvelle(4, 31);
  state = jouerUneManche(state);

  // Tout ce qui a été joué, plus la main du dernier : le tas, sans un mélange.
  const attendu = [...ids(state.passees), ...ids(state.players.find((p) => p.hand.length > 0)!.hand)];
  assert.equal(state.paquet.length, 52);
  assert.deepEqual(ids(state.paquet), attendu, 'le tas est ramassé tel quel');
});

test('le Boss coupe, montre une carte et la garde', () => {
  const aCouper = (() => {
    const state = nouvelle(4, 12);
    state.finishOrder = state.order.slice();
    for (const p of state.players) p.hand = [];
    assignRoles(state);
    state.phase = 'fin-de-manche';
    state.paquet = makeDeck();
    return apply(state, { type: 'manche-suivante' });
  })();

  assert.equal(aCouper.phase, 'coupe');
  assert.equal(aCouper.order[aCouper.turn], 'a', 'c’est au Boss de couper');
  assert.equal(viewFor(aCouper, 'a').coupe?.taille, 52);
  assert.equal(viewFor(aCouper, 'b').coupe, null, 'les autres ne coupent pas');

  // Seul le Boss coupe, et seulement à une place qui existe.
  assert.throws(() => apply(aCouper, { type: 'couper', player: 'b', position: 20 }), RegleViolee);
  assert.throws(() => apply(aCouper, { type: 'couper', player: 'a', position: 0 }), RegleViolee);
  assert.throws(() => apply(aCouper, { type: 'couper', player: 'a', position: 52 }), RegleViolee);

  const apres = apply(aCouper, { type: 'couper', player: 'a', position: 20 });
  const montree = apres.carteMontree!;
  assert.equal(montree.id, aCouper.paquet[20].id, 'la carte montrée est celle de la coupe');

  const boss = apres.players.find((p) => p.id === 'a')!;
  assert.ok(ids(boss.hand).includes(montree.id), 'le Boss garde la carte qu’il a montrée');
  assert.match(apres.log.join('\n'), /coupe et montre/);

  // Chacun retombe sur ses treize cartes malgré la carte prise d'avance.
  assert.deepEqual(apres.players.map((p) => p.hand.length).sort(), [13, 13, 13, 13]);
  assert.equal(apres.paquet.length, 0, 'le paquet est distribué');
  assert.equal(apres.phase, 'jeu');
  assert.equal(apres.order[apres.turn], 'a', 'et le Boss ouvre');
});

test('couper à deux endroits différents ne donne pas les mêmes mains', () => {
  const mains = (position: number) => {
    const state = mancheSuivante(44, 4, position);
    return state.players.map((p) => ids(p.hand).join(','));
  };
  assert.notDeepEqual(mains(10), mains(35), 'la coupe change la donne');
});

test('la dame de cœur ouvre la première manche', () => {
  for (const seed of [1, 2, 3, 17, 99]) {
    const state = nouvelle(4, seed);
    const ouvreur = state.players.find((p) => p.id === state.order[state.turn])!;
    assert.ok(
      ouvreur.hand.some((c) => c.id === carte('D♥').id),
      `graine ${seed} : l'ouvreur devrait avoir la dame de cœur`,
    );
    assert.match(state.log.join('\n'), /dame de cœur/);
  }
});

test('l’échange se solde tout seul, puis le Boss ouvre', () => {
  const state = mancheSuivante(5);
  assert.equal(state.phase, 'jeu');
  assert.equal(state.order[state.turn], 'a', 'le Boss ouvre la manche');
  assert.deepEqual(state.players.map((p) => p.hand.length).sort(), [13, 13, 13, 13]);
  assert.equal(state.mouvements.filter((m) => m.sens === 'donner').length, 2);
  assert.equal(state.mouvements.filter((m) => m.sens === 'rendre').length, 2);
});

test('on ne voit que ses propres échanges', () => {
  const state = mancheSuivante(5);
  // a est le Boss (avec d), b le Sous-Boss (avec c) : ils ne partagent rien.
  const duBoss = viewFor(state, 'a').mesEchanges;
  assert.equal(duBoss.length, 2, 'le don reçu et le tribut rendu');
  assert.ok(duBoss.every((m) => m.de === 'a' || m.vers === 'a'));

  const duSousBoss = viewFor(state, 'b').mesEchanges;
  assert.ok(
    duSousBoss.every((m) => m.de === 'b' || m.vers === 'b'),
    'le Sous-Boss ne doit pas voir passer les cartes du Boss',
  );
  const croisement = duBoss.filter((m) => duSousBoss.some((n) => n.cartes[0]?.id === m.cartes[0]?.id));
  assert.equal(croisement.length, 0, 'aucune carte commune entre les deux vues');

  // Et le journal, lui, ne dit rien des cartes.
  assert.ok(
    !state.log.some((l) => / donne | rend /.test(l)),
    'le journal partagé ne doit pas détailler les échanges',
  );
});

test('les neutres n’échangent rien', () => {
  const state = mancheSuivante(9, 6);
  const neutres = state.players.filter((p) => p.role === 'neutre');
  assert.equal(neutres.length, 2);

  for (const n of neutres) {
    assert.ok(
      !state.mouvements.some((m) => m.de === n.id || m.vers === n.id),
      `${n.name} ne devrait rien échanger`,
    );
    assert.equal(viewFor(state, n.id).mesEchanges.length, 0);
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

/* --------------------------------------------------------- les points */

test('une manche rapporte le nombre de joueurs laissés derrière soi', () => {
  let state = partie({ a: ['3♠'], b: ['4♠'], c: ['5♠'], d: ['R♠', 'A♥'] });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('3♠').id] });
  state = apply(state, { type: 'poser', player: 'b', cards: [carte('4♠').id] });
  state = apply(state, { type: 'poser', player: 'c', cards: [carte('5♠').id] });

  const points = (id: string) => state.players.find((p) => p.id === id)!.points;
  assert.deepEqual([points('a'), points('b'), points('c'), points('d')], [3, 2, 1, 0]);
  assert.deepEqual(state.classement, ['a', 'b', 'c', 'd']);
});

test('finir sur un 2 coûte aussi des points', () => {
  let state = partie({ a: ['2♠'], b: ['4♠'], c: ['5♠'], d: ['R♠', 'A♥'] });
  state = apply(state, { type: 'poser', player: 'a', cards: [carte('2♠').id] });
  state = apply(state, { type: 'poser', player: 'b', cards: [carte('4♠').id] });
  state = apply(state, { type: 'poser', player: 'c', cards: [carte('5♠').id] });

  // Sorti premier, mais relégué dernier : il repart les mains vides.
  const points = (id: string) => state.players.find((p) => p.id === id)!.points;
  assert.equal(points('a'), 0);
  assert.equal(points('b'), 3);
});

test('la partie s’arrête quand l’objectif est atteint', () => {
  const state = nouvelle(4, 21);
  assert.equal(state.objectif, 15, '5 points par adversaire');

  // On amène un joueur au seuil, puis on lui fait gagner une manche.
  state.players.find((p) => p.id === 'a')!.points = 13;
  state.classement = [];
  for (const p of state.players) p.hand = [];
  state.players.find((p) => p.id === 'a')!.hand = [carte('3♠')];
  state.players.find((p) => p.id === 'b')!.hand = [carte('4♠')];
  state.players.find((p) => p.id === 'c')!.hand = [carte('5♠')];
  state.players.find((p) => p.id === 'd')!.hand = [carte('R♠'), carte('A♥')];
  state.finishOrder = [];
  state.phase = 'jeu';
  state.turn = 0;
  state.requirement = null;

  let suite = apply(state, { type: 'poser', player: 'a', cards: [carte('3♠').id] });
  suite = apply(suite, { type: 'poser', player: 'b', cards: [carte('4♠').id] });
  suite = apply(suite, { type: 'poser', player: 'c', cards: [carte('5♠').id] });

  assert.equal(suite.phase, 'fin-de-partie');
  assert.equal(suite.players.find((p) => p.id === 'a')!.points, 16);
  assert.throws(() => apply(suite, { type: 'manche-suivante' }), RegleViolee);

  const neuve = apply(suite, { type: 'nouvelle-partie' });
  assert.equal(neuve.round, 1);
  assert.ok(neuve.players.every((p) => p.points === 0 && p.role === null));
  assert.equal(neuve.players.reduce((n, p) => n + p.hand.length, 0), 52);
});

test('chacun sait ce qui est déjà passé sur le tapis', () => {
  let state = partie({ a: ['7♠', '3♥'], b: ['8♠', '3♦'], c: ['9♠', '3♣'], d: ['R♠', 'A♥'] });
  const reste = (v: Array<[number, number]>, rang: number) => new Map(v).get(rang);
  const avant = viewFor(state, 'd').restantes;
  assert.equal(reste(avant, 7), 4, 'aucun 7 vu, et je n’en ai pas');
  assert.equal(reste(avant, 13), 3, 'je tiens un roi sur les quatre');

  state = apply(state, { type: 'poser', player: 'a', cards: [carte('7♠').id] });
  state = apply(state, { type: 'poser', player: 'b', cards: [carte('8♠').id] });

  const apres = viewFor(state, 'd').restantes;
  assert.equal(reste(apres, 7), 3, 'un 7 est tombé');
  assert.equal(reste(apres, 8), 3);
  assert.equal(state.passees.length, 2);
});

/* ------------------------------------------------- parties complètes (bots) */

/** Fait jouer les bots jusqu'à la fin de la manche. Renvoie l'état final. */
function jouerUneManche(state: GameState): GameState {
  let s = state;
  for (let coup = 0; coup < 2000; coup++) {
    if (s.phase === 'fin-de-manche') return s;
    const acteur = s.order[s.turn];
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
      // Les 52 cartes sont soit en main, soit dans le paquet qui attend la coupe.
      const avant = [...state.players.flatMap((p) => ids(p.hand)), ...ids(state.paquet)];
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
      const acteur = s.phase === 'echange' ? joueursEnAttente(s)[0] : s.order[s.turn];
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
    const acteur = s.phase === 'echange' ? joueursEnAttente(s)[0] : s.order[s.turn];
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
