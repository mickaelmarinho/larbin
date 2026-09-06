import type {
  Action, Card, GameState, PendingReturn, Player, Role,
} from './types.ts';
import { DEUX, cardLabel, groupByRank, makeDeck, rankLabel, sortHand } from './cards.ts';
import { nextRandom, shuffle } from './rng.ts';

export const MIN_JOUEURS = 4;
export const MAX_JOUEURS = 6;

export interface PlayerSeed {
  id: string;
  name: string;
  isBot?: boolean;
}

export class RegleViolee extends Error {}

function fail(message: string): never {
  throw new RegleViolee(message);
}

/* ---------------------------------------------------------------- lecture */

export function player(state: GameState, id: string): Player {
  const p = state.players.find((x) => x.id === id);
  if (!p) fail(`Joueur inconnu : ${id}`);
  return p;
}

export function currentPlayer(state: GameState): Player {
  return player(state, state.order[state.turn]);
}

/** Joueurs ayant encore des cartes et n'ayant pas passé : ils peuvent encore monter. */
function contenders(state: GameState, exclude: string | null): Player[] {
  return state.players.filter(
    (p) => p.hand.length > 0 && !p.passed && p.id !== exclude,
  );
}

/**
 * Tous les coups légaux d'un joueur, du plus faible au plus fort.
 * En ouverture, chaque hauteur donne autant de coups que de cartes disponibles
 * (un 7 seul, une doublette de 7, etc.).
 */
export function legalPlays(state: GameState, id: string): Card[][] {
  const p = player(state, id);
  if (state.phase !== 'jeu' || currentPlayer(state).id !== id || p.hand.length === 0) return [];

  const req = state.requirement;
  const plays: Card[][] = [];
  for (const [rank, cards] of groupByRank(p.hand)) {
    if (req) {
      if (rank <= req.rank || cards.length < req.count) continue;
      plays.push(cards.slice(0, req.count));
    } else {
      for (let n = 1; n <= cards.length; n++) plays.push(cards.slice(0, n));
    }
  }
  return plays.sort((a, b) => a[0].rank - b[0].rank || a.length - b.length);
}

export function peutPasser(state: GameState, id: string): boolean {
  // On ne passe pas quand on ouvre une série : il faut poser.
  return state.phase === 'jeu' && currentPlayer(state).id === id && state.requirement !== null;
}

/* ------------------------------------------------------------ distribution */

/** Distribue tout le paquet une carte à la fois, dans le sens des aiguilles d'une montre. */
function deal(state: GameState, firstSeat: number): void {
  const { items: deck, seed } = shuffle(makeDeck(), state.rng);
  state.rng = seed;
  for (const p of state.players) p.hand = [];
  deck.forEach((card, i) => {
    const seat = (firstSeat + i) % state.order.length;
    player(state, state.order[seat]).hand.push(card);
  });
  for (const p of state.players) p.hand = sortHand(p.hand);
}

/* ------------------------------------------------------------- création */

export function createGame(seeds: PlayerSeed[], seed = Date.now()): GameState {
  if (seeds.length < MIN_JOUEURS || seeds.length > MAX_JOUEURS) {
    fail(`Le Larbin se joue de ${MIN_JOUEURS} à ${MAX_JOUEURS} joueurs (reçu : ${seeds.length}).`);
  }
  if (new Set(seeds.map((s) => s.id)).size !== seeds.length) fail('Identifiants de joueurs en double.');

  const players: Player[] = seeds.map((s) => ({
    id: s.id,
    name: s.name,
    hand: [],
    role: null,
    passed: false,
    finishedAt: null,
    finishedOnTwo: false,
    joinedLate: false,
    isBot: s.isBot ?? false,
  }));

  const state: GameState = {
    players,
    order: seeds.map((s) => s.id),
    round: 0,
    phase: 'jeu',
    turn: 0,
    pile: [],
    requirement: null,
    lastPlayer: null,
    finishOrder: [],
    pendingReturns: [],
    rng: seed >>> 0,
    log: [],
  };

  startRound(state);
  return state;
}

/* --------------------------------------------------------- début de manche */

function startRound(state: GameState): void {
  state.round += 1;
  state.pile = [];
  state.requirement = null;
  state.lastPlayer = null;
  state.finishOrder = [];
  state.pendingReturns = [];
  for (const p of state.players) {
    p.passed = false;
    p.finishedAt = null;
    p.finishedOnTwo = false;
  }

  const boss = state.players.find((p) => p.role === 'boss');
  // Première manche : personne n'a de rôle, l'ouvreur est tiré au sort.
  const firstSeat = boss ? state.order.indexOf(boss.id) : randomSeat(state);
  deal(state, firstSeat);

  state.log.push(`--- Manche ${state.round} ---`);

  if (!boss) {
    state.phase = 'jeu';
    state.turn = firstSeat;
    state.log.push(`${player(state, state.order[firstSeat]).name} ouvre la première manche.`);
    return;
  }

  planExchanges(state);
  state.turn = state.order.indexOf(boss.id);
  state.phase = state.pendingReturns.length > 0 ? 'echange' : 'jeu';
}

function randomSeat(state: GameState): number {
  const r = nextRandom(state.rng);
  state.rng = r.seed;
  return Math.floor(r.value * state.order.length);
}

/**
 * Les dons du bas vers le haut sont imposés, donc appliqués tout de suite :
 * le Larbin lâche ses 2 meilleures cartes, le Sur-Larbin sa meilleure.
 * Le Boss et le Sous-Boss choisiront ensuite ce qu'ils rendent.
 */
function planExchanges(state: GameState): void {
  const byRole = (role: Role) => state.players.find((p) => p.role === role) ?? null;
  const dons: Array<[Role, Role, number]> = [
    ['larbin', 'boss', 2],
    ['sur-larbin', 'sous-boss', 1],
  ];

  for (const [fromRole, toRole, count] of dons) {
    const from = byRole(fromRole);
    const to = byRole(toRole);
    if (!from || !to) continue;

    const given = sortHand(from.hand).slice(0, count);
    from.hand = from.hand.filter((c) => !given.includes(c));
    to.hand = sortHand([...to.hand, ...given]);
    state.log.push(
      `${from.name} (${fromRole}) donne ${given.map(cardLabel).join(' ')} à ${to.name}.`,
    );
    state.pendingReturns.push({ from: to.id, to: from.id, count, received: given });
  }
}

/* -------------------------------------------------------------- actions */

export function apply(state: GameState, action: Action): GameState {
  const next: GameState = structuredClone(state);
  switch (action.type) {
    case 'poser': doPlay(next, action.player, action.cards); break;
    case 'passer': doPass(next, action.player); break;
    case 'rendre': doReturn(next, action.player, action.cards); break;
    case 'manche-suivante': doNextRound(next); break;
    default: fail('Action inconnue.');
  }
  return next;
}

function doReturn(state: GameState, id: string, cardIds: string[]): void {
  if (state.phase !== 'echange') fail("Ce n'est pas la phase d'échange.");
  const pending = state.pendingReturns.find((r) => r.from === id);
  if (!pending) fail(`${player(state, id).name} n'a rien à rendre.`);
  if (cardIds.length !== pending.count) {
    fail(`Il faut rendre exactement ${pending.count} carte(s).`);
  }
  if (new Set(cardIds).size !== cardIds.length) fail('Cartes en double.');

  const from = player(state, id);
  const cards = cardIds.map((cid) => {
    const card = from.hand.find((c) => c.id === cid);
    if (!card) fail(`${cid} n'est pas dans la main de ${from.name}.`);
    return card;
  });

  from.hand = from.hand.filter((c) => !cards.includes(c));
  const to = player(state, pending.to);
  to.hand = sortHand([...to.hand, ...cards]);
  state.log.push(`${from.name} rend ${cards.map(cardLabel).join(' ')} à ${to.name}.`);

  state.pendingReturns = state.pendingReturns.filter((r) => r !== pending);
  if (state.pendingReturns.length === 0) {
    state.phase = 'jeu';
    const boss = state.players.find((p) => p.role === 'boss');
    if (boss) state.turn = state.order.indexOf(boss.id);
    state.log.push(`${currentPlayer(state).name} ouvre la manche.`);
  }
}

function doPlay(state: GameState, id: string, cardIds: string[]): void {
  if (state.phase !== 'jeu') fail("Ce n'est pas le moment de poser.");
  if (currentPlayer(state).id !== id) fail(`Ce n'est pas le tour de ${player(state, id).name}.`);
  if (cardIds.length === 0) fail('Il faut poser au moins une carte.');
  if (new Set(cardIds).size !== cardIds.length) fail('Cartes en double.');

  const p = player(state, id);
  const cards = cardIds.map((cid) => {
    const card = p.hand.find((c) => c.id === cid);
    if (!card) fail(`${cid} n'est pas dans la main de ${p.name}.`);
    return card;
  });

  const rank = cards[0].rank;
  if (cards.some((c) => c.rank !== rank)) fail('Toutes les cartes posées doivent être de même hauteur.');

  const req = state.requirement;
  if (req) {
    if (cards.length !== req.count) {
      fail(`Il faut poser exactement ${req.count} carte(s), pas ${cards.length}.`);
    }
    if (rank <= req.rank) {
      fail(`${rankLabel(rank)} ne bat pas ${rankLabel(req.rank)} : il faut monter strictement.`);
    }
  }

  p.hand = p.hand.filter((c) => !cards.includes(c));
  state.pile.push({ player: id, cards });
  state.requirement = { rank, count: cards.length };
  state.lastPlayer = id;
  state.log.push(`${p.name} pose ${cards.map(cardLabel).join(' ')}.`);

  if (p.hand.length === 0) {
    p.finishedAt = state.finishOrder.length;
    p.finishedOnTwo = rank === DEUX;
    state.finishOrder.push(id);
    state.log.push(
      p.finishedOnTwo
        ? `${p.name} termine sur un 2 : Larbin d'office !`
        : `${p.name} a fini (${ordinal(state.finishOrder.length)}).`,
    );
  }

  if (state.players.filter((x) => x.hand.length > 0).length <= 1) {
    endRound(state);
    return;
  }
  advance(state);
}

function doPass(state: GameState, id: string): void {
  if (state.phase !== 'jeu') fail("Ce n'est pas le moment de passer.");
  if (currentPlayer(state).id !== id) fail(`Ce n'est pas le tour de ${player(state, id).name}.`);
  if (!state.requirement) fail('On ne passe pas quand on ouvre une série : il faut poser.');

  const p = player(state, id);
  p.passed = true;
  state.log.push(`${p.name} passe.`);
  advance(state);
}

/** Donne la main au prochain joueur encore dans la série, ou clôt la série. */
function advance(state: GameState): void {
  const still = contenders(state, state.lastPlayer);
  if (still.length === 0) {
    endSeries(state);
    return;
  }
  const size = state.order.length;
  for (let step = 1; step <= size; step++) {
    const seat = (state.turn + step) % size;
    if (still.some((p) => p.id === state.order[seat])) {
      state.turn = seat;
      return;
    }
  }
  endSeries(state);
}

/**
 * Plus personne ne peut ou ne veut monter : la série s'arrête.
 * Le dernier à avoir posé ouvre la suivante — ou, s'il a fini ses cartes,
 * le premier joueur encore en jeu à sa gauche.
 */
function endSeries(state: GameState): void {
  const winner = state.lastPlayer;
  state.log.push('Série terminée.');
  state.pile = [];
  state.requirement = null;
  state.lastPlayer = null;
  for (const p of state.players) p.passed = false;

  const size = state.order.length;
  const from = winner ? state.order.indexOf(winner) : state.turn;
  for (let step = 0; step < size; step++) {
    const seat = (from + step) % size;
    if (player(state, state.order[seat]).hand.length > 0) {
      state.turn = seat;
      state.log.push(`${currentPlayer(state).name} ouvre une nouvelle série.`);
      return;
    }
  }
}

/* ---------------------------------------------------------- fin de manche */

function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`;
}

/**
 * Attribution des rôles. Les joueurs ayant terminé sur un 2 sont relégués en
 * queue de classement en conservant leur ordre relatif : avec un seul fautif,
 * cela revient exactement à « il devient Larbin ».
 */
export function assignRoles(state: GameState): void {
  const last = state.players.find((p) => p.hand.length > 0);
  if (last && !state.finishOrder.includes(last.id)) {
    last.finishedAt = state.finishOrder.length;
    state.finishOrder.push(last.id);
  }

  const propres = state.finishOrder.filter((id) => !player(state, id).finishedOnTwo);
  const fautifs = state.finishOrder.filter((id) => player(state, id).finishedOnTwo);
  const classement = [...propres, ...fautifs];
  const n = classement.length;

  classement.forEach((id, i) => {
    let role: Role = 'neutre';
    if (i === 0) role = 'boss';
    else if (i === 1) role = 'sous-boss';
    else if (i === n - 1) role = 'larbin';
    else if (i === n - 2) role = 'sur-larbin';
    player(state, id).role = role;
  });

  // Un joueur arrivé en cours de partie est Larbin d'office : il échange sa
  // place avec le Larbin sortant.
  const tardif = state.players.find((p) => p.joinedLate);
  if (tardif && tardif.role !== 'larbin') {
    const larbin = state.players.find((p) => p.role === 'larbin');
    if (larbin) {
      larbin.role = tardif.role;
      tardif.role = 'larbin';
    }
  }
  for (const p of state.players) p.joinedLate = false;
}

function endRound(state: GameState): void {
  assignRoles(state);
  state.phase = 'fin-de-manche';
  state.pile = [];
  state.requirement = null;
  for (const p of state.players) p.passed = false;
  for (const id of state.finishOrder) {
    const p = player(state, id);
    state.log.push(`${p.name} : ${p.role}.`);
  }
}

function doNextRound(state: GameState): void {
  if (state.phase !== 'fin-de-manche') fail("La manche n'est pas terminée.");
  startRound(state);
}

/* ------------------------------------------------------ vue par joueur */

/** Ce qu'un joueur a le droit de voir : sa main, et seulement le nombre de cartes des autres. */
export interface PlayerView {
  me: Player;
  round: number;
  phase: GameState['phase'];
  turnPlayer: string;
  requirement: GameState['requirement'];
  pile: GameState['pile'];
  lastPlayer: string | null;
  pendingReturn: PendingReturn | null;
  others: Array<{
    id: string; name: string; count: number; role: Role | null;
    passed: boolean; finishedAt: number | null; isBot: boolean;
  }>;
  legal: Card[][];
  canPass: boolean;
  log: string[];
}

export function viewFor(state: GameState, id: string): PlayerView {
  const me = player(state, id);
  return {
    me: structuredClone(me),
    round: state.round,
    phase: state.phase,
    turnPlayer: state.order[state.turn],
    requirement: state.requirement,
    pile: structuredClone(state.pile),
    lastPlayer: state.lastPlayer,
    pendingReturn: state.pendingReturns.find((r) => r.from === id) ?? null,
    others: state.order
      .filter((oid) => oid !== id)
      .map((oid) => {
        const o = player(state, oid);
        return {
          id: o.id, name: o.name, count: o.hand.length, role: o.role,
          passed: o.passed, finishedAt: o.finishedAt, isBot: o.isBot,
        };
      }),
    legal: legalPlays(state, id),
    canPass: peutPasser(state, id),
    log: state.log.slice(-12),
  };
}
