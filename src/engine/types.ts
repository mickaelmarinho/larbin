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
  /** A déjà pris la parole dans la série en cours : posé ou passé. */
  aAgi: boolean;
  /** A passé plutôt que de poser — pour l'affichage. */
  passed: boolean;
  /** Position dans l'ordre de sortie de la manche en cours (null tant qu'il a des cartes). */
  finishedAt: number | null;
  /** A terminé sa manche en posant un 2 : devient Larbin d'office. */
  finishedOnTwo: boolean;
  /** Un joueur arrivé en cours de partie : Larbin imposé à la manche suivante. */
  joinedLate: boolean;
  isBot: boolean;
  /** Points cumulés depuis le début de la partie. */
  points: number;
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

/** Dans quel sens un joueur se sépare de ses cartes. */
export type SensEchange = 'donner' | 'rendre';

/**
 * Un mouvement de cartes de l'échange de début de manche. C'est une affaire
 * privée entre deux joueurs : la table voit qu'un échange a eu lieu, pas ce
 * qui a changé de main.
 */
export interface Mouvement {
  de: string;
  vers: string;
  cartes: Card[];
  sens: SensEchange;
}

export type Phase = 'coupe' | 'jeu' | 'fin-de-manche' | 'fin-de-partie';

export interface GameState {
  /**
   * Identifie cette partie-ci. Le jeu se sauvegarde et se recharge : sans ce
   * repère, l'interface ne saurait pas si la manche qu'elle voit se terminer
   * est nouvelle ou si elle la revoit après un rechargement.
   */
  partie: string;
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
  /** Classement final de la manche : il tient compte de la pénalité du 2. */
  classement: string[];
  /** Les mouvements de l'échange en cours, filtrés par joueur au moment de la vue. */
  mouvements: Mouvement[];
  /** Toutes les cartes déjà posées dans la manche : chacun les a vues passer. */
  passees: Card[];
  /**
   * Le paquet tel qu'il attend d'être coupé : les cartes de la manche écoulée,
   * dans l'ordre où elles sont tombées. On ne mélange pas entre deux manches.
   */
  paquet: Card[];
  /** La carte que le Boss a retournée en coupant, et qu'il a gardée. */
  carteMontree: Card | null;
  /** Score à atteindre pour gagner la partie. */
  objectif: number;
  /** État interne du générateur pseudo-aléatoire (parties rejouables). */
  rng: number;
  log: string[];
}

export type Action =
  | { type: 'poser'; player: string; cards: string[] }
  | { type: 'passer'; player: string }
  | { type: 'couper'; player: string; position: number }
  | { type: 'manche-suivante' }
  | { type: 'nouvelle-partie' };
