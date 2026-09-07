import type { Action, Card } from './types.ts';
import type { PlayerView } from './game.ts';
import { DEUX } from './cards.ts';

/**
 * Adversaire artificiel. Pas de calcul d'arbre : quelques réflexes de joueur
 * correct, assez pour que les parties en solo soient plaisantes.
 *
 * Ses principes :
 *  - se débarrasser d'abord des petites cartes, garder les grosses pour reprendre ;
 *  - ne pas casser une paire ou un brelan pour un point de rien ;
 *  - garder les 2 pour la fin... mais surtout ne pas finir dessus (Larbin d'office) ;
 *  - accélérer quand un adversaire est sur le point de sortir.
 */
export function botAction(view: PlayerView): Action | null {
  if (view.phase === 'echange' && view.tribut) {
    // Le tribut est imposé : il ne reste qu'à trancher la couleur.
    const { forcees, candidats, aChoisir } = view.tribut;
    const rendues = [...forcees, ...candidats.slice(0, aChoisir)];
    return { type: 'rendre', player: view.me.id, cards: rendues.map((c) => c.id) };
  }

  if (view.phase !== 'jeu' || view.turnPlayer !== view.me.id) return null;
  if (view.legal.length === 0) return { type: 'passer', player: view.me.id };

  const choice = pick(view);
  return choice
    ? { type: 'poser', player: view.me.id, cards: choice.map((c) => c.id) }
    : { type: 'passer', player: view.me.id };
}

function pick(view: PlayerView): Card[] | null {
  const handSize = view.me.hand.length;
  const menace = view.others.some((o) => o.count > 0 && o.count <= 2);

  // Un coup qui vide la main : on le prend, sauf s'il se termine sur un 2.
  const sorties = view.legal.filter((play) => play.length === handSize);
  const propre = sorties.find((play) => play[0].rank !== DEUX);
  if (propre) return propre;

  // Avant-dernier tour : éviter de rester seul avec un 2 en main.
  const restantApres = (play: Card[]) => handSize - play.length;
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
    if (restantApres(play) === 0) score += 40;
    if (menace) score += rank;                     // urgence : monter plus volontiers
    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }

  if (!view.canPass) return best;                  // en ouverture, il faut poser

  // Suivre coûte trop cher pour l'enjeu : on garde ses forces.
  const rank = best ? best[0].rank : DEUX;
  const requirement = view.requirement?.rank ?? 3;
  const tropCher = rank >= 14 && handSize > 3 && requirement <= 11 && !menace;
  return tropCher ? null : best;
}

/** Poser ce coup amputerait-il un groupe plus grand (paire, brelan, carré) ? */
function casseUnGroupe(hand: Card[], play: Card[]): boolean {
  const rank = play[0].rank;
  return hand.filter((c) => c.rank === rank).length > play.length;
}
