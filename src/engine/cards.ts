import type { Card, Rank, Suit } from './types.ts';

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** Le 2 vaut 15 : c'est la carte la plus forte du Larbin. */
export const DEUX: Rank = 15;

const LABELS: Record<Rank, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'V', 12: 'D', 13: 'R', 14: 'A', 15: '2',
};

export function rankLabel(rank: Rank): string {
  return LABELS[rank];
}

export function cardLabel(card: Card): string {
  return LABELS[card.rank] + card.suit;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ id: rank + suit, rank, suit });
    }
  }
  return deck;
}

/** Tri décroissant (les plus fortes d'abord), couleur en départage pour un affichage stable. */
export function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => b.rank - a.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

/** Regroupe une main par hauteur, des plus faibles aux plus fortes. */
export function groupByRank(hand: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>();
  for (const card of hand) {
    const g = groups.get(card.rank);
    if (g) g.push(card);
    else groups.set(card.rank, [card]);
  }
  return new Map([...groups.entries()].sort((a, b) => a[0] - b[0]));
}

/** La dame de cœur : c'est elle qui désigne l'ouvreur de la première manche. */
export const DAME_DE_COEUR = '12♥';
