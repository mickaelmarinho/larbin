import type { Action, Card, Rank } from './types.ts';
import type { PlayerView } from './game.ts';
import { DEUX } from './cards.ts';

/**
 * Le banc d'essai du bot : copie conforme de bot.ts, à modifier librement.
 *
 * On y tente une idée, puis on la soumet à l'arène :
 *
 *   node scripts/arene.mjs                  # trois séries contre le bot en place
 *   node scripts/arene.mjs 2000 --series=4  # plus long, plus sûr
 *   node scripts/arene.mjs --calibrage      # le témoin contre lui-même : doit être indécis
 *
 * Si le verdict est « indécis », l'idée ne vaut rien même si elle paraît
 * bonne. Si elle gagne, on recopie ce fichier sur bot.ts et on repart d'ici.
 * Et on regarde aussi la ligne « fins sur un 2 » : un défaut partagé par les
 * deux camps ne se voit jamais dans le taux de victoire.
 */
export function botAction(view: PlayerView): Action | null {
  if (view.coupe) {
    const milieu = Math.floor(view.coupe.taille / 2);
    const ecart = Math.floor(view.coupe.taille / 6);
    const position = milieu + Math.floor(Math.random() * (2 * ecart + 1)) - ecart;
    return {
      type: 'couper',
      player: view.me.id,
      position: Math.min(Math.max(position, 1), view.coupe.taille - 1),
    };
  }

  if (view.phase !== 'jeu' || view.turnPlayer !== view.me.id) return null;
  if (view.legal.length === 0) return { type: 'passer', player: view.me.id };

  const choix = pick(view);
  return choix
    ? { type: 'poser', player: view.me.id, cards: choix.map((c) => c.id) }
    : { type: 'passer', player: view.me.id };
}

/** Chance, grossièrement estimée, que ce coup tienne jusqu'à la fin de la série. */
function survie(view: PlayerView, rank: Rank, count: number): number {
  const parlants = view.others.filter((o) => o.count > 0 && !o.aAgi && !o.passed);
  if (parlants.length === 0) return 1;

  let occasions = 0;
  for (const [hauteur, reste] of view.restantes) {
    if (hauteur > rank && reste >= count) occasions += Math.floor(reste / count);
  }
  if (occasions === 0) return 1;

  const cartesEnJeu = view.me.hand.length
    + view.others.reduce((total, o) => total + o.count, 0);

  let tient = 1;
  for (const o of parlants) {
    const chezLui = Math.min(1, o.count / Math.max(1, cartesEnJeu));
    tient *= Math.max(0, 1 - Math.min(1, occasions * chezLui ** count));
  }
  return tient;
}

/** Combien de prises de parole cette main réclame-t-elle encore ? */
function tours(hand: Card[]): number {
  return new Set(hand.map((c) => c.rank)).size;
}

function pick(view: PlayerView): Card[] | null {
  const handSize = view.me.hand.length;
  const menace = view.others.some((o) => o.count > 0 && o.count <= 2);

  const serieAcquise = view.requirement !== null
    && view.others.every((o) => o.count === 0 || o.aAgi);

  const sorties = view.legal.filter((play) => play.length === handSize);
  const propre = sorties.find((play) => play[0].rank !== DEUX);
  if (propre) return propre;

  // Par identifiant, jamais par référence : la vue clone la main du joueur.
  const reste = (play: Card[]) => {
    const posees = new Set(play.map((c) => c.id));
    return view.me.hand.filter((c) => !posees.has(c.id));
  };

  const condamne = (play: Card[]) => {
    const apres = reste(play);
    if (apres.length === 0) return play[0].rank === DEUX;
    return apres.every((c) => c.rank === DEUX);
  };
  const candidats = view.legal.filter((play) => !condamne(play));
  if (candidats.length === 0) return view.canPass ? null : view.legal[0];

  if (serieAcquise) return candidats[0];

  const toursActuels = tours(view.me.hand);
  const ouverture = view.requirement === null;

  let best: Card[] | null = null;
  let bestScore = -Infinity;
  let bestSurvie = 0;

  for (const play of candidats) {
    const rank = play[0].rank;
    const apres = reste(play);
    let score = 100 - rank * 4;
    score += (play.length - 1) * 3;
    if (casseUnGroupe(view.me.hand, play)) score -= 12;
    if (play.length === handSize) score += 40;
    if (menace) score += rank;

    if (rank === DEUX && handSize > 6) score -= 20;
    const deuxGardes = apres.filter((c) => c.rank === DEUX).length;
    if (deuxGardes > 0) score -= (70 * deuxGardes) / (apres.length - deuxGardes + 1);

    const p = survie(view, rank, play.length);
    score += p * 26;

    score += (toursActuels - tours(apres)) * 7;

    if (ouverture && play.length >= 2) score += play.length * 4;

    if (score > bestScore) {
      bestScore = score;
      best = play;
      bestSurvie = p;
    }
  }

  if (!view.canPass || !best) return best;

  if (bestSurvie > 0.75 && best[0].rank !== DEUX) return best;

  const requirement = view.requirement?.rank ?? 3;
  const tropCher = best[0].rank >= 14 && handSize > 3 && requirement <= 11 && !menace;
  return tropCher ? null : best;
}

/** Poser ce coup amputerait-il un groupe plus grand (paire, brelan, carré) ? */
function casseUnGroupe(hand: Card[], play: Card[]): boolean {
  const rank = play[0].rank;
  return hand.filter((c) => c.rank === rank).length > play.length;
}
