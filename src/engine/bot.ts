import type { Action, Card, Rank } from './types.ts';
import type { PlayerView } from './game.ts';
import { DEUX } from './cards.ts';

/**
 * Adversaire artificiel. Pas de calcul d'arbre : les réflexes d'un joueur
 * correct, assez pour que les parties en solo soient plaisantes.
 *
 * Ses principes, tous dictés par les règles maison :
 *
 *  - se débarrasser d'abord des petites cartes, garder les grosses pour reprendre ;
 *  - ne pas casser une paire ou un brelan pour un point de rien ;
 *  - **ne jamais garder ses 2 pour la fin.** C'est le réflexe du Président, et
 *    un poison ici, où finir sur un 2 rend Larbin d'office. Un 2 coupe et rend
 *    la main aussitôt : le jouer ne coûte pas le tempo. Chaque 2 gardé est une
 *    dette d'autant plus lourde que la main fond, et un coup qui ne laisserait
 *    que des 2 est écarté tant qu'il existe autre chose — passer compris ;
 *  - compter ce qui est tombé, et estimer ses chances de tenir la série : une
 *    série ne faisant qu'un tour, la tenir revient à ouvrir la suivante ;
 *  - compter les prises de parole qui lui restent ;
 *  - ouvrir gros quand c'est gratuit ;
 *  - accélérer quand un adversaire est sur le point de sortir.
 *
 * Tout changement passe par `node scripts/arene.mjs`, qui oppose ce bot à
 * `bot-candidat.ts` et compte aussi les fins sur un 2.
 *
 * Un avertissement tiré de l'histoire de ce fichier : la vue clone la main du
 * joueur, si bien que les cartes des coups légaux ne sont pas les mêmes objets
 * que celles de la main. On les compare par identifiant, jamais par référence.
 * Longtemps ce bot les a comparées par référence : « la main après ce coup »
 * était toujours la main entière, son garde-fou contre les fins sur un 2 ne
 * s'est jamais déclenché, et il finissait sur un 2 dans plus de la moitié des
 * manches. Un joueur l'a remarqué ; l'arène, qui comparait deux bots atteints
 * du même défaut, ne le pouvait pas. Corrigé, le bot remporte 75,8 % ± 1,1 des
 * parties décisives face à l'ancien, sur trois séries de 2 000 parties.
 */
export function botAction(view: PlayerView): Action | null {
  // Couper, c'est un geste sans information : on tranche quelque part au milieu.
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

/**
 * Chance, grossièrement estimée, que ce coup tienne jusqu'à la fin de la série.
 *
 * On regarde qui doit encore parler, combien de cartes chacun tient, et
 * combien de hauteurs supérieures restent en circulation. Ce n'est pas un
 * calcul exact — il faudrait connaître les mains — mais un ordre de grandeur
 * suffit pour départager deux coups.
 */
function survie(view: PlayerView, rank: Rank, count: number): number {
  const parlants = view.others.filter((o) => o.count > 0 && !o.aAgi && !o.passed);
  if (parlants.length === 0) return 1;

  // Combien de coups au-dessus dorment encore dans les mains adverses ?
  let occasions = 0;
  for (const [hauteur, reste] of view.restantes) {
    if (hauteur > rank && reste >= count) occasions += Math.floor(reste / count);
  }
  if (occasions === 0) return 1;

  // Ces cartes sont réparties entre les joueurs encore en jeu, moi compris.
  const cartesEnJeu = view.me.hand.length
    + view.others.reduce((total, o) => total + o.count, 0);

  let tient = 1;
  for (const o of parlants) {
    // Probabilité qu'une occasion donnée soit chez lui, puis qu'il en ait une.
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

  // Tous les autres ont déjà parlé : la série ne fait qu'un tour, donc poser
  // l'emporte à coup sûr.
  const serieAcquise = view.requirement !== null
    && view.others.every((o) => o.count === 0 || o.aAgi);

  // Un coup qui vide la main : on le prend, sauf s'il se termine sur un 2.
  const sorties = view.legal.filter((play) => play.length === handSize);
  const propre = sorties.find((play) => play[0].rank !== DEUX);
  if (propre) return propre;

  // Par identifiant, et non par référence : voir l'avertissement en tête du fichier.
  const reste = (play: Card[]) => {
    const posees = new Set(play.map((c) => c.id));
    return view.me.hand.filter((c) => !posees.has(c.id));
  };

  // Garder une sortie propre. Finir sur un 2, ou ne laisser que des 2 en main —
  // ce qui revient à devoir finir dessus —, condamne la manche. On écarte ces
  // coups tant qu'il existe autre chose à faire, passer compris.
  const condamne = (play: Card[]) => {
    const apres = reste(play);
    if (apres.length === 0) return play[0].rank === DEUX;
    return apres.every((c) => c.rank === DEUX);
  };
  const candidats = view.legal.filter((play) => !condamne(play));
  if (candidats.length === 0) return view.canPass ? null : view.legal[0];

  // Série déjà gagnée : le moins cher suffit — mais parmi les coups sûrs.
  if (serieAcquise) return candidats[0];

  const toursActuels = tours(view.me.hand);
  const ouverture = view.requirement === null;

  let best: Card[] | null = null;
  let bestScore = -Infinity;
  let bestSurvie = 0;

  for (const play of candidats) {
    const rank = play[0].rank;
    const apres = reste(play);
    let score = 100 - rank * 4;                    // jouer petit d'abord
    score += (play.length - 1) * 3;                // se délester par paquets
    if (casseUnGroupe(view.me.hand, play)) score -= 12;
    if (play.length === handSize) score += 40;
    if (menace) score += rank;                     // urgence : monter plus volontiers

    // Un 2 reprend la main à coup sûr : en début de manche, c'est un outil de
    // contrôle qu'on ne gaspille pas...
    if (rank === DEUX && handSize > 6) score -= 20;
    // ...mais chaque 2 gardé est une dette, d'autant plus lourde qu'il reste
    // peu d'autres cartes pour finir proprement.
    const deuxGardes = apres.filter((c) => c.rank === DEUX).length;
    if (deuxGardes > 0) score -= (70 * deuxGardes) / (apres.length - deuxGardes + 1);

    // Tenir la série, c'est ouvrir la suivante : le gain est proportionnel à
    // la chance d'y arriver.
    const p = survie(view, rank, play.length);
    score += p * 26;

    // Un tour de parole en moins vaut mieux qu'un tour de parole en plus.
    score += (toursActuels - tours(apres)) * 7;

    // À l'ouverture, sortir un groupe entier de petites cartes est presque
    // toujours excellent : peu de monde peut répondre à trois cartes.
    if (ouverture && play.length >= 2) score += play.length * 4;

    if (score > bestScore) {
      bestScore = score;
      best = play;
      bestSurvie = p;
    }
  }

  if (!view.canPass || !best) return best;         // en ouverture, il faut poser

  // Reprendre la main quand on a de bonnes chances de la garder.
  if (bestSurvie > 0.75 && best[0].rank !== DEUX) return best;

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
