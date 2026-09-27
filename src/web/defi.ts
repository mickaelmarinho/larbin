/**
 * Le défi du jour.
 *
 * Chaque jour, une même partie pour tout le monde : la même donne, les mêmes
 * bots, le même hasard. Trois manches, un seul essai, et un score qu'on
 * compare — sans avoir besoin que les autres soient connectés en même temps.
 * C'est ce qui donne une raison de revenir demain, et de partager aujourd'hui.
 *
 * Pour que la partie soit vraiment la même, rien ne doit dépendre du hasard du
 * navigateur : la donne suit une graine tirée de la date, et la seule décision
 * aléatoire des bots — où couper le paquet — suit l'état de la partie. Deux
 * joueurs qui jouent les mêmes coups voient donc exactement la même chose.
 */
import type { GameState, Role } from '../engine/types.ts';
import { createGame } from '../engine/game.ts';
import { nextRandom } from '../engine/rng.ts';
import { jourDeParis } from './jour.ts';
import { TABLEE_SOLO } from './solo.ts';

export const DEFI_MANCHES = 3;
/** À quatre, le Boss prend 3 points par manche. */
export const DEFI_MAXIMUM = 3 * DEFI_MANCHES;

/** Une graine par jour (FNV-1a) : la même pour tous, une autre demain. */
export function graineDuJour(jour: string): number {
  let h = 0x811c9dc5;
  for (const c of `larbin-defi:${jour}`) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Le hasard des bots, tiré de l'état de la partie : le même à chaque fois qu'on y repasse. */
export function hasardDuDefi(etat: GameState): () => number {
  let s = (etat.rng ^ Math.imul(etat.round, 0x9e3779b1)) >>> 0;
  return () => {
    const r = nextRandom(s);
    s = r.seed;
    return r.value;
  };
}

export const partieDuDefi = (jour: string): GameState => createGame(TABLEE_SOLO, graineDuJour(jour));

/* ------------------------------------------------------------ le bilan */

export interface BilanDuDefi {
  jour: string;
  /** Le rôle obtenu à chaque manche, dans l'ordre. */
  roles: Role[];
  points: number;
  fini: boolean;
}

export const bilanVierge = (jour: string): BilanDuDefi => ({ jour, roles: [], points: 0, fini: false });

/** Note une manche terminée. Revoir le même écran de fin ne la compte pas deux fois. */
export function noterLaManche(b: BilanDuDefi, manche: number, role: Role, points: number): BilanDuDefi {
  if (b.fini || manche < 1 || manche > DEFI_MANCHES || b.roles[manche - 1]) return b;
  const roles = [...b.roles];
  roles[manche - 1] = role;
  return { ...b, roles, points, fini: manche === DEFI_MANCHES };
}

const EMOJI: Record<Role, string> = {
  'boss': '👑', 'sous-boss': '🥈', 'neutre': '😐', 'sur-larbin': '😬', 'larbin': '🧹',
};

export const emojisDuDefi = (b: BilanDuDefi): string => b.roles.map((r) => EMOJI[r]).join(' ');

/** « 27/09 » : le jour du défi, comme on l'écrit. */
export const jourCourt = (jour: string): string => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;

/** Le message qu'on envoie à ses proches : le score, les rôles, et de quoi les piquer au jeu. */
export const texteDuDefi = (b: BilanDuDefi): string =>
  `Le Larbin — défi du ${jourCourt(b.jour)} : ${b.points}/${DEFI_MAXIMUM}\n${emojisDuDefi(b)}\n`
  + 'Même donne pour tout le monde. Tu fais mieux ?';

/* ------------------------------------------------------------ le disque */

const CLE_BILAN = 'larbin.defi.bilan';

export function lireBilan(): BilanDuDefi | null {
  try {
    const b = JSON.parse(localStorage.getItem(CLE_BILAN) ?? 'null') as BilanDuDefi | null;
    return b && typeof b.jour === 'string' && Array.isArray(b.roles) && typeof b.points === 'number' ? b : null;
  } catch {
    return null;
  }
}

export function garderBilan(b: BilanDuDefi): void {
  try {
    localStorage.setItem(CLE_BILAN, JSON.stringify(b));
  } catch { /* le défi se jouera quand même */ }
}

/** Le bilan du défi d'aujourd'hui : vierge si l'on n'y a pas encore touché. */
export function bilanDuJour(jour = jourDeParis()): BilanDuDefi {
  const b = lireBilan();
  return b && b.jour === jour ? b : bilanVierge(jour);
}
