/** Types partagés du moteur de règles du Larbin. */

/** Couleurs : Pique, Coeur, Carreau, Trèfle. */
export type Suit = '♠' | '♥' | '♦' | '♣';

/**
 * Force d'une carte. 3 est la plus faible, 14 = As, 15 = le 2 (la plus forte).
 * On code le 2 en 15 pour que la comparaison soit une simple comparaison de nombres.
 */
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface Card {
  /** Identifiant unique et stable dans le jeu de 52 (ex. "15♠" pour le 2 de pique). */
  id: string;
  rank: Rank;
  suit: Suit;
}

export type Role = 'boss' | 'sous-boss' | 'neutre' | 'sur-larbin' | 'larbin';

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  /** Rôle hérité de la manche précédente (null à la première manche). */
  role: Role | null;
  /** A passé son tour dans la série en cours : ne peut plus y revenir. */
  passed: boolean;
  /** Position dans l'ordre de sortie de la manche en cours (null tant qu'il a des cartes). */
  finishedAt: number | null;
  /** A terminé sa manche en posant un 2 : devient Larbin d'office. */
  finishedOnTwo: boolean;
  /** Un joueur arrivé en cours de partie : Larbin imposé à la manche suivante. */
  joinedLate: boolean;
  isBot: boolean;
}

/** Cartes posées d'un coup par un joueur (1 à 4 cartes de même hauteur). */
export interface Play {
  player: string;
  cards: Card[];
}

/** Contrainte imposée par la série en cours. */
export interface Requirement {
  rank: Rank;
  count: number;
}

/** Un don imposé en début de manche, en attente de la carte rendue en échange. */
export interface PendingReturn {
  /** Celui qui doit choisir les cartes à rendre (Boss ou Sous-Boss). */
  from: string;
  /** Celui qui les recevra (Larbin ou Sur-Larbin). */
  to: string;
  count: number;
  /** Ce que `to` vient de donner d'office, pour l'affichage. */
  received: Card[];
}

export type Phase = 'echange' | 'jeu' | 'fin-de-manche';

export interface GameState {
  players: Player[];
  /** Ordre de placement, sens des aiguilles d'une montre. */
  order: string[];
  round: number;
  phase: Phase;
  /** Index dans `order` du joueur dont c'est le tour (phase "jeu"). */
  turn: number;
  /** Les coups de la série en cours, du plus ancien au plus récent. */
  pile: Play[];
  requirement: Requirement | null;
  /** Dernier joueur à avoir posé : il ouvrira la série suivante. */
  lastPlayer: string | null;
  /** Ordre de sortie de la manche en cours. */
  finishOrder: string[];
  pendingReturns: PendingReturn[];
  /** État interne du générateur pseudo-aléatoire (parties rejouables). */
  rng: number;
  log: string[];
}

export type Action =
  | { type: 'poser'; player: string; cards: string[] }
  | { type: 'passer'; player: string }
  | { type: 'rendre'; player: string; cards: string[] }
  | { type: 'manche-suivante' };
