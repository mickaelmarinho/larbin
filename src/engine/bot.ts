import type { Action, Card, Rank } from './types.ts';
import type { PlayerView } from './game.ts';
import { DEUX } from './cards.ts';

/**
 * Adversaire artificiel. Pas de calcul d'arbre : les réflexes d'un joueur
 * correct, assez pour que les parties en solo soient plaisantes.
 *
 * Ses principes :
 *  - se débarrasser d'abord des petites cartes, garder les grosses pour reprendre ;
 *  - ne pas casser une paire ou un brelan pour un point de rien ;
 *  - garder les 2 pour la fin... mais surtout ne pas finir dessus (Larbin d'office) ;
 *  - compter ce qui est déjà tombé, pour savoir quand une carte est imprenable ;
 *  - accélérer quand un adversaire est sur le point de sortir.
 */
export function botAction(view: PlayerView): Action | null {
  if (view.phase === 'echange' && view.echange) {
    // L'échange est imposé dans les deux sens : il ne reste qu'à trancher la couleur.
    const { forcees, candidats, aChoisir } = view.echange.choix;
    const cedees = [...forcees, ...candidats.slice(0, aChoisir)];
    return { type: 'echanger', player: view.me.id, cards: cedees.map((c) => c.id) };
  }

  if (view.phase !== 'jeu' || view.turnPlayer !== view.me.id) return null;
  if (view.legal.length === 0) return { type: 'passer', player: view.me.id };

  const choix = pick(view);
  return choix
    ? { type: 'poser', player: view.me.id, cards: choix.map((c) => c.id) }
    : { type: 'passer', player: view.me.id };
}

/**
 * Plus personne ne peut monter sur cette hauteur : la carte est imprenable.
 * On le sait en comptant ce qui est passé sur le tapis et ce qu'on a en main.
 */
function imprenable(view: PlayerView, rank: Rank, count: number): boolean {
  for (const [hauteur, reste] of view.restantes) {
    if (hauteur > rank && reste >= count) return false;
  }
  return true;
}

function pick(view: PlayerView): Card[] | null {
  const handSize = view.me.hand.length;
  const menace = view.others.some((o) => o.count > 0 && o.count <= 2);

  // Tous les autres ont déjà parlé : la série ne fait qu'un tour, donc poser
  // l'emporte à coup sûr — inutile de se priver.
  const serieAcquise = view.requirement !== null
    && view.others.every((o) => o.count === 0 || o.aAgi);

  // Un coup qui vide la main : on le prend, sauf s'il se termine sur un 2.
  const sorties = view.legal.filter((play) => play.length === handSize);
  const propre = sorties.find((play) => play[0].rank !== DEUX);
  if (propre) return propre;

  if (serieAcquise) return view.legal[0];          // le moins cher suffit

  const finirSurUnDeux = (play: Card[]) => {
    const reste = view.me.hand.filter((c) => !play.includes(c));
    return reste.length > 0 && reste.every((c) => c.rank === DEUX);
  };

  let best: Card[] | null = null;
  let bestScore = -Infinity;

  for (const play of view.legal) {
    const rank = play[0].rank;
    let score = 100 - rank * 4;                    // jouer petit d'abord
    score += (play.length - 1) * 3;                // se délester par paquets
    if (casseUnGroupe(view.me.hand, play)) score -= 12;
    if (rank === DEUX) score -= handSize > 2 ? 45 : 10;
    if (finirSurUnDeux(play)) score -= 60;
    if (play.length === handSize) score += 40;
    if (menace) score += rank;                     // urgence : monter plus volontiers
    // Une carte imprenable emporte la série : on garde donc la main.
    if (imprenable(view, rank, play.length)) score += 18;
    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }

  if (!view.canPass || !best) return best;         // en ouverture, il faut poser

  // Reprendre la main avec une carte imprenable vaut toujours le coup.
  if (imprenable(view, best[0].rank, best.length) && best[0].rank !== DEUX) return best;

  // Sinon, suivre coûte parfois trop cher pour l'enjeu : on garde ses forces.
  const requirement = view.requirement?.rank ?? 3;
  const tropCher = best[0].rank >= 14 && handSize > 3 && requirement <= 11 && !menace;
  return tropCher ? null : best;
}

/** Poser ce coup amputerait-il un groupe plus grand (paire, brelan, carré) ? */
function casseUnGroupe(hand: Card[], play: Card[]): boolean {
  const rank = play[0].rank;
  return hand.filter((c) => c.rank === rank).length > play.length;
}
