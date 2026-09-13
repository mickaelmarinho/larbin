/**
 * Les humeurs des bots : en solo, ils réagissent parfois à ce qui vient de se
 * passer, avec les mêmes émoticônes que les joueurs en ligne.
 *
 * Parfois seulement. Un bot qui commente chaque coup deviendrait vite pénible ;
 * on ne retient que les moments qui se voient à table — un 2 qui coupe, un
 * joueur qui sort, un Larbin d'office — et chacun n'a qu'une chance d'être
 * relevé. Rien pendant la fin de manche : le panneau cache la table.
 *
 * Aucune dépendance au navigateur : on compare deux vues, et le hasard est
 * injecté, pour que tout cela s'éprouve sans attendre qu'un dé tombe bien.
 */
import type { PlayerView } from '../engine/game.ts';
import type { Reaction } from '../reseau/protocole.ts';

export interface ReactionDeBot {
  de: string;
  reaction: Reaction;
}

const DEUX = 15;

/** La chance qu'a chaque moment d'être relevé. */
export const CHANCES = {
  moiFinisSurUnDeux: 0.8,
  botSortPremier: 0.8,
  moiSorsPremier: 0.6,
  moiCoupe: 0.35,
  botCoupe: 0.3,
  botSort: 0.25,
};

const signature = (vue: PlayerView) =>
  vue.pile.map((coup) => `${coup.player}:${coup.cards.map((c) => c.id).join(',')}`).join('|');

export function reactionDesBots(
  avant: PlayerView,
  apres: PlayerView,
  hasard: () => number = Math.random,
): ReactionDeBot | null {
  if (avant.partie !== apres.partie || avant.round !== apres.round || apres.phase !== 'jeu') return null;
  if (apres.pile.length === 0 || signature(avant) === signature(apres)) return null;

  const tente = (chance: number) => hasard() < chance;
  const bots = apres.others.filter((o) => o.isBot);
  // Qui réagit à ce que j'ai fait : de préférence un bot encore en jeu.
  const unBot = () => {
    const enJeu = bots.filter((o) => o.count > 0);
    const parmi = enJeu.length > 0 ? enJeu : bots;
    return parmi.length > 0 ? parmi[Math.floor(hasard() * parmi.length)].id : null;
  };
  const auHasard = (a: Reaction, b: Reaction) => (hasard() < 0.5 ? a : b);

  const dernier = apres.pile[apres.pile.length - 1];
  const auteur = dernier.player;
  const coupe = dernier.cards[0]?.rank === DEUX;

  // Je viens de sortir : c'est ce qui se remarque le plus.
  if (auteur === apres.me.id && avant.me.finishedAt === null && apres.me.finishedAt !== null) {
    if (apres.me.finishedOnTwo) {
      const de = tente(CHANCES.moiFinisSurUnDeux) ? unBot() : null;
      return de ? { de, reaction: '😂' } : null;
    }
    if (apres.me.finishedAt === 0) {
      const de = tente(CHANCES.moiSorsPremier) ? unBot() : null;
      return de ? { de, reaction: '👏' } : null;
    }
    return null;
  }

  // Un bot vient de sortir.
  const bot = bots.find((o) => o.id === auteur);
  const botAvant = avant.others.find((o) => o.id === auteur);
  if (bot && botAvant && botAvant.finishedAt === null && bot.finishedAt !== null) {
    if (bot.finishedOnTwo) return null;
    if (bot.finishedAt === 0) return tente(CHANCES.botSortPremier) ? { de: bot.id, reaction: '👑' } : null;
    return tente(CHANCES.botSort) ? { de: bot.id, reaction: '👍' } : null;
  }

  // Un 2 qui coupe la série.
  if (coupe && auteur === apres.me.id) {
    const de = tente(CHANCES.moiCoupe) ? unBot() : null;
    return de ? { de, reaction: auHasard('😱', '😤') } : null;
  }
  if (coupe && bot) return tente(CHANCES.botCoupe) ? { de: bot.id, reaction: '🔥' } : null;

  return null;
}
