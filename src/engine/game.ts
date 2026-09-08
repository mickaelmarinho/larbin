import type {
  Action, Card, Echange, GameState, Mouvement, Player, Rank, Role, SensEchange,
} from './types.ts';
import {
  DAME_DE_COEUR, DEUX, RANKS, cardLabel, groupByRank, makeDeck, rankLabel, sortHand,
} from './cards.ts';
import { nextRandom, shuffle } from './rng.ts';

export const MIN_JOUEURS = 4;
export const MAX_JOUEURS = 6;

/**
 * Une manche rapporte autant de points qu'on a laissé de joueurs derrière soi :
 * le Boss en prend le maximum, le Larbin rien. L'objectif de la partie vaut donc
 * cinq manches gagnées de bout en bout — une bonne soirée, quel que soit le
 * nombre de joueurs.
 */
export const OBJECTIF_PAR_ADVERSAIRE = 5;

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

/**
 * Ceux qui n'ont pas encore pris la parole dans la série et ont de quoi le
 * faire. Une série ne fait qu'un tour de table : dès que la liste est vide,
 * elle est close.
 */
function restentAParler(state: GameState): Player[] {
  return state.players.filter((p) => p.hand.length > 0 && !p.aAgi);
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
    aAgi: false,
    passed: false,
    finishedAt: null,
    finishedOnTwo: false,
    joinedLate: false,
    isBot: s.isBot ?? false,
    points: 0,
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
    classement: [],
    echanges: [],
    mouvements: [],
    passees: [],
    objectif: OBJECTIF_PAR_ADVERSAIRE * (seeds.length - 1),
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
  state.classement = [];
  state.echanges = [];
  state.mouvements = [];
  state.passees = [];
  for (const p of state.players) {
    p.aAgi = false;
    p.passed = false;
    p.finishedAt = null;
    p.finishedOnTwo = false;
  }

  const boss = state.players.find((p) => p.role === 'boss');
  // Le donneur tourne : à la première manche il est tiré au sort.
  const firstSeat = boss ? state.order.indexOf(boss.id) : randomSeat(state);
  deal(state, firstSeat);

  state.log.push(`--- Manche ${state.round} ---`);

  if (!boss) {
    // Personne n'a encore de rôle : c'est la dame de cœur qui désigne l'ouvreur.
    const ouvreur = state.players.find((p) => p.hand.some((c) => c.id === DAME_DE_COEUR))!;
    state.phase = 'jeu';
    state.turn = state.order.indexOf(ouvreur.id);
    state.log.push(`${ouvreur.name} ouvre la première manche (dame de cœur).`);
    return;
  }

  planExchanges(state);
  state.turn = state.order.indexOf(boss.id);
  state.phase = state.echanges.length > 0 ? 'echange' : 'jeu';
}

function randomSeat(state: GameState): number {
  const r = nextRandom(state.rng);
  state.rng = r.seed;
  return Math.floor(r.value * state.order.length);
}

/**
 * Ce qu'un joueur est tenu de céder — ses plus hautes quand il donne, ses plus
 * basses quand il rend. La hauteur est imposée ; il ne reste que la couleur à
 * départager quand plusieurs cartes se disputent la dernière place.
 */
export interface Choix {
  /** Cartes que la règle désigne sans discussion. */
  forcees: Card[];
  /** Cartes de même hauteur entre lesquelles il reste à trancher. */
  candidats: Card[];
  /** Combien en prendre parmi les candidats (0 s'il n'y a rien à décider). */
  aChoisir: number;
}

export function cartesImposees(hand: Card[], count: number, sens: SensEchange): Choix {
  if (hand.length <= count) return { forcees: hand.slice(), candidats: [], aChoisir: 0 };

  const ordre = sens === 'donner'
    ? (a: Card, b: Card) => b.rank - a.rank
    : (a: Card, b: Card) => a.rank - b.rank;
  const designees = hand.slice().sort(ordre).slice(0, count);
  const frontiere = designees[designees.length - 1].rank;
  const placesEnJeu = designees.filter((c) => c.rank === frontiere).length;
  const candidats = hand.filter((c) => c.rank === frontiere);
  const forcees = designees.filter((c) => c.rank !== frontiere);

  // Autant de prétendants que de places : personne n'a de choix à faire.
  return candidats.length === placesEnJeu
    ? { forcees: [...forcees, ...candidats], candidats: [], aChoisir: 0 }
    : { forcees, candidats, aChoisir: placesEnJeu };
}

/** Les hauteurs qu'un joueur est tenu de céder, dans l'ordre où la règle les désigne. */
function rangsImposes(hand: Card[], count: number, sens: SensEchange): Rank[] {
  const choix = cartesImposees(hand, count, sens);
  const frontiere = choix.candidats[0]?.rank;
  return [
    ...choix.forcees.map((c) => c.rank),
    ...Array<Rank>(choix.aChoisir).fill(frontiere!),
  ].sort((a, b) => a - b);
}

/**
 * Le bas cède ses meilleures cartes au haut.
 *
 * Le détail va dans `mouvements`, que la vue filtre ensuite par joueur : ce qui
 * passe d'une main à l'autre ne regarde que les deux intéressés. Le journal,
 * lui, est commun à toute la table.
 */
function donner(state: GameState, echange: Echange, cards: Card[]): void {
  const bas = player(state, echange.bas);
  const haut = player(state, echange.haut);
  const ids = new Set(cards.map((c) => c.id));
  bas.hand = bas.hand.filter((c) => !ids.has(c.id));
  haut.hand = sortHand([...haut.hand, ...cards]);
  echange.donnees = cards;
  state.mouvements.push({ de: bas.id, vers: haut.id, cartes: cards, sens: 'donner' });
}

/** Le haut rend ses plus basses au bas : l'échange est soldé. */
function rendre(state: GameState, echange: Echange, cards: Card[]): void {
  const bas = player(state, echange.bas);
  const haut = player(state, echange.haut);
  const ids = new Set(cards.map((c) => c.id));
  haut.hand = haut.hand.filter((c) => !ids.has(c.id));
  bas.hand = sortHand([...bas.hand, ...cards]);
  state.mouvements.push({ de: haut.id, vers: bas.id, cartes: cards, sens: 'rendre' });
  state.log.push(`${bas.name} et ${haut.name} ont fait leur échange.`);
  state.echanges = state.echanges.filter((e) => e !== echange);
}

/**
 * Déroule les échanges aussi loin que la règle le permet sans arbitrage, et
 * s'arrête sur chaque décision qui revient à un joueur — c'est-à-dire une
 * couleur à départager, jamais une hauteur.
 */
function avancerEchanges(state: GameState): void {
  for (const echange of [...state.echanges]) {
    if (echange.donnees === null) {
      const don = cartesImposees(player(state, echange.bas).hand, echange.count, 'donner');
      if (don.aChoisir > 0) continue;              // le bas doit choisir sa couleur
      donner(state, echange, don.forcees);
    }
    const tribut = cartesImposees(player(state, echange.haut).hand, echange.count, 'rendre');
    if (tribut.aChoisir > 0) continue;             // le haut doit choisir la sienne
    rendre(state, echange, tribut.forcees);
  }
}

/**
 * Les deux sens de l'échange sont imposés : le Larbin lâche ses 2 meilleures
 * cartes, le Boss lui rend ses 2 plus basses ; de même entre Sur-Larbin et
 * Sous-Boss. Le don précède le tribut, car les plus basses du Boss se comptent
 * une fois qu'il a reçu.
 */
function planExchanges(state: GameState): void {
  const byRole = (role: Role) => state.players.find((p) => p.role === role) ?? null;
  const paires: Array<[Role, Role, number]> = [
    ['larbin', 'boss', 2],
    ['sur-larbin', 'sous-boss', 1],
  ];

  for (const [basRole, hautRole, count] of paires) {
    const bas = byRole(basRole);
    const haut = byRole(hautRole);
    if (!bas || !haut) continue;
    state.echanges.push({ bas: bas.id, haut: haut.id, count, donnees: null });
  }

  avancerEchanges(state);
}

/** Qui doit trancher une couleur, et dans quel sens. */
export function attenteDe(state: GameState, id: string): { echange: Echange; sens: SensEchange } | null {
  for (const echange of state.echanges) {
    if (echange.donnees === null && echange.bas === id) return { echange, sens: 'donner' };
    if (echange.donnees !== null && echange.haut === id) return { echange, sens: 'rendre' };
  }
  return null;
}

/** Tous les joueurs dont on attend une décision. */
export function joueursEnAttente(state: GameState): string[] {
  return state.echanges.map((e) => (e.donnees === null ? e.bas : e.haut));
}

/* -------------------------------------------------------------- actions */

export function apply(state: GameState, action: Action): GameState {
  const next: GameState = structuredClone(state);
  switch (action.type) {
    case 'poser': doPlay(next, action.player, action.cards); break;
    case 'passer': doPass(next, action.player); break;
    case 'echanger': doExchange(next, action.player, action.cards); break;
    case 'manche-suivante': doNextRound(next); break;
    case 'nouvelle-partie': doNewGame(next); break;
    default: fail('Action inconnue.');
  }
  return next;
}

function doExchange(state: GameState, id: string, cardIds: string[]): void {
  if (state.phase !== 'echange') fail("Ce n'est pas la phase d'échange.");
  const attente = attenteDe(state, id);
  if (!attente) fail(`${player(state, id).name} n'a rien à échanger.`);

  const { echange, sens } = attente;
  if (cardIds.length !== echange.count) {
    fail(`Il faut ${sens} exactement ${echange.count} carte(s).`);
  }
  if (new Set(cardIds).size !== cardIds.length) fail('Cartes en double.');

  const moi = player(state, id);
  const cards = cardIds.map((cid) => {
    const card = moi.hand.find((c) => c.id === cid);
    if (!card) fail(`${cid} n'est pas dans la main de ${moi.name}.`);
    return card;
  });

  // La hauteur est imposée dans les deux sens ; seule la couleur se choisit.
  const dus = rangsImposes(moi.hand, echange.count, sens);
  const proposes = cards.map((c) => c.rank).sort((a, b) => a - b);
  if (dus.join(',') !== proposes.join(',')) {
    const quoi = sens === 'donner' ? 'vos meilleures' : 'vos plus basses';
    fail(`L'échange est imposé : il faut ${sens} ${quoi} (${dus.map(rankLabel).join(' et ')}).`);
  }

  if (sens === 'donner') donner(state, echange, cards);
  else rendre(state, echange, cards);

  avancerEchanges(state);

  if (state.echanges.length === 0) {
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
  p.aAgi = true;
  if (!req) state.pile = [];        // on ouvre : le tapis se ramasse maintenant
  state.pile.push({ player: id, cards });
  state.passees.push(...cards);
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

  // Le 2 coupe net : personne ne peut monter, on n'attend pas que le tour finisse.
  if (rank === DEUX) {
    state.log.push('Le 2 coupe : la série s\'arrête là.');
    endSeries(state);
    return;
  }

  advance(state);
}

function doPass(state: GameState, id: string): void {
  if (state.phase !== 'jeu') fail("Ce n'est pas le moment de passer.");
  if (currentPlayer(state).id !== id) fail(`Ce n'est pas le tour de ${player(state, id).name}.`);
  if (!state.requirement) fail('On ne passe pas quand on ouvre une série : il faut poser.');

  const p = player(state, id);
  p.aAgi = true;
  p.passed = true;
  state.log.push(`${p.name} passe.`);
  advance(state);
}

/**
 * Passe la parole au voisin de gauche qui ne l'a pas encore prise. Le tour de
 * table bouclé, la série s'arrête — même si quelqu'un aurait pu monter encore.
 */
function advance(state: GameState): void {
  const restent = restentAParler(state);
  if (restent.length === 0) {
    endSeries(state);
    return;
  }
  const size = state.order.length;
  for (let step = 1; step <= size; step++) {
    const seat = (state.turn + step) % size;
    if (restent.some((p) => p.id === state.order[seat])) {
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
  // Les cartes gagnantes restent sur le tapis jusqu'à ce que quelqu'un rouvre :
  // à une vraie table, on ne ramasse pas avant que le suivant ait posé.
  state.requirement = null;
  state.lastPlayer = null;
  for (const p of state.players) {
    p.aAgi = false;
    p.passed = false;
  }

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
export function assignRoles(state: GameState): string[] {
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
  return classement;
}

/**
 * Une manche rapporte autant de points qu'on a laissé de joueurs derrière soi.
 * À quatre : 3 au Boss, 2 au Sous-Boss, 1 au Sur-Larbin, rien au Larbin.
 * On compte sur le classement, donc celui qui a fini sur un 2 est puni deux
 * fois : il devient Larbin et repart les mains vides.
 */
export function pointsDeLaManche(classement: string[]): Map<string, number> {
  const gains = new Map<string, number>();
  classement.forEach((id, i) => gains.set(id, classement.length - 1 - i));
  return gains;
}

function endRound(state: GameState): void {
  const classement = assignRoles(state);
  state.classement = classement;
  const gains = pointsDeLaManche(classement);
  for (const [id, gain] of gains) player(state, id).points += gain;

  state.pile = [];
  state.requirement = null;
  for (const p of state.players) {
    p.aAgi = false;
    p.passed = false;
  }
  for (const id of classement) {
    const p = player(state, id);
    state.log.push(`${p.name} : ${p.role}, +${gains.get(id)} (${p.points} pts).`);
  }

  // Départage : le plus de points, puis la meilleure place de la manche.
  const vainqueur = state.players
    .filter((p) => p.points >= state.objectif)
    .sort((a, b) => b.points - a.points || classement.indexOf(a.id) - classement.indexOf(b.id))[0];

  state.phase = vainqueur ? 'fin-de-partie' : 'fin-de-manche';
  if (vainqueur) state.log.push(`${vainqueur.name} remporte la partie avec ${vainqueur.points} points.`);
}

function doNextRound(state: GameState): void {
  if (state.phase !== 'fin-de-manche') fail("La manche n'est pas terminée.");
  startRound(state);
}

/** On repart de zéro : mêmes joueurs, mêmes places, scores et rôles effacés. */
function doNewGame(state: GameState): void {
  for (const p of state.players) {
    p.points = 0;
    p.role = null;
  }
  state.round = 0;
  state.log = [];
  startRound(state);
}

/* ------------------------------------------------------ vue par joueur */

/**
 * Ce qui peut encore sortir, hauteur par hauteur : les quatre cartes de chaque
 * hauteur, moins celles qu'on a vues passer et celles qu'on tient. Tout le monde
 * à la table dispose de cette information — il suffit de regarder le tapis.
 */
export function cartesRestantes(state: GameState, id: string): Array<[Rank, number]> {
  const compte = new Map<Rank, number>(RANKS.map((r) => [r, 4]));
  const retirer = (c: Card) => compte.set(c.rank, (compte.get(c.rank) ?? 0) - 1);
  state.passees.forEach(retirer);
  player(state, id).hand.forEach(retirer);
  // Un tableau, pas une Map : la vue doit pouvoir voyager en JSON jusqu'au client.
  return [...compte.entries()];
}

/** Ce qu'un joueur a le droit de voir : sa main, et seulement le nombre de cartes des autres. */
export interface PlayerView {
  me: Player;
  round: number;
  phase: GameState['phase'];
  turnPlayer: string;
  requirement: GameState['requirement'];
  pile: GameState['pile'];
  lastPlayer: string | null;
  /** L'échange en attente de ma décision : la couleur, et rien d'autre. */
  echange: {
    sens: SensEchange;
    /** L'autre joueur de l'échange. */
    avec: string;
    count: number;
    /** Ce que l'autre vient de me céder (vide quand c'est à moi de donner). */
    recues: Card[];
    choix: Choix;
  } | null;
  others: Array<{
    id: string; name: string; count: number; role: Role | null;
    passed: boolean; aAgi: boolean; finishedAt: number | null; isBot: boolean; points: number;
    finishedOnTwo: boolean;
    /** Faux quand le joueur a décroché. Le moteur l'ignore ; le serveur le renseigne. */
    connecte: boolean;
  }>;
  /** Classement de la manche écoulée, vide tant qu'elle n'est pas finie. */
  classement: string[];
  /** Mes échanges de ce début de manche — les miens seulement. */
  mesEchanges: Mouvement[];
  /** Score à atteindre pour remporter la partie. */
  objectif: number;
  /**
   * Pour chaque hauteur, combien de cartes je n'ai encore ni vues passer ni en
   * main : autrement dit ce que les autres peuvent encore détenir.
   */
  restantes: Array<[Rank, number]>;
  legal: Card[][];
  canPass: boolean;
  log: string[];
}

export function viewFor(state: GameState, id: string): PlayerView {
  const me = player(state, id);
  const attente = attenteDe(state, id);
  return {
    me: structuredClone(me),
    round: state.round,
    phase: state.phase,
    turnPlayer: state.order[state.turn],
    requirement: state.requirement,
    pile: structuredClone(state.pile),
    lastPlayer: state.lastPlayer,
    echange: attente ? {
      sens: attente.sens,
      avec: attente.sens === 'donner' ? attente.echange.haut : attente.echange.bas,
      count: attente.echange.count,
      recues: attente.echange.donnees ?? [],
      choix: cartesImposees(me.hand, attente.echange.count, attente.sens),
    } : null,
    others: state.order
      .filter((oid) => oid !== id)
      .map((oid) => {
        const o = player(state, oid);
        return {
          id: o.id, name: o.name, count: o.hand.length, role: o.role,
          passed: o.passed, aAgi: o.aAgi, finishedAt: o.finishedAt, isBot: o.isBot, points: o.points,
          finishedOnTwo: o.finishedOnTwo, connecte: true,
        };
      }),
    classement: state.classement.slice(),
    mesEchanges: state.mouvements.filter((m) => m.de === id || m.vers === id),
    objectif: state.objectif,
    restantes: cartesRestantes(state, id),
    legal: legalPlays(state, id),
    canPass: peutPasser(state, id),
    log: state.log.slice(-12),
  };
}
