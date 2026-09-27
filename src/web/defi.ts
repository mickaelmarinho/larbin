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
import type { Action, GameState, Role } from '../engine/types.ts';
import { apply, createGame, viewFor } from '../engine/game.ts';
import { botAction } from '../engine/bot.ts';
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

/* ------------------------------------------------------------ le rejeu */

const MOI = 'moi';
/** Trois manches tiennent en bien moins de coups que ça. */
const COUPS_MAX = 600;

/**
 * Un coup du joueur tel qu'il arrive du navigateur, remis en forme — ou null.
 * On ne garde que ce qu'il faut, et c'est toujours « moi » qui joue.
 */
function coupPropre(brut: unknown): Action | null {
  if (!brut || typeof brut !== 'object') return null;
  const c = brut as Record<string, unknown>;
  switch (c.type) {
    case 'poser':
      return Array.isArray(c.cards) && c.cards.length > 0 && c.cards.length <= 13
        && c.cards.every((id) => typeof id === 'string' && id.length <= 4)
        ? { type: 'poser', player: MOI, cards: c.cards as string[] } : null;
    case 'passer':
      return { type: 'passer', player: MOI };
    case 'couper':
      return Number.isInteger(c.position) ? { type: 'couper', player: MOI, position: c.position as number } : null;
    case 'manche-suivante':
      return { type: 'manche-suivante' };
    default:
      return null;
  }
}

/**
 * Rejoue le défi d'un jour à partir des seuls coups du joueur : les bots
 * rejouent les leurs, à l'identique, et le moteur refuse tout coup impossible.
 * C'est ainsi que le serveur connaît le vrai score, quel que soit ce que
 * prétend le navigateur. Renvoie null si les coups ne mènent pas, exactement,
 * au bout des trois manches.
 */
export function rejouerLeDefi(jour: string, coups: unknown): { points: number; roles: Role[] } | null {
  if (!Array.isArray(coups) || coups.length > COUPS_MAX) return null;
  let e = partieDuDefi(jour);
  let suivant = 0;
  const roles: Role[] = [];
  for (let garde = 0; garde < 20 * COUPS_MAX; garde++) {
    if (e.phase === 'fin-de-manche') {
      const moi = e.players.find((p) => p.id === MOI)!;
      roles.push(moi.role!);
      if (e.round === DEFI_MANCHES) return suivant === coups.length ? { points: moi.points, roles } : null;
    }
    let coup: Action | null;
    if (e.phase === 'fin-de-manche' || e.order[e.turn] === MOI) {
      coup = coupPropre(coups[suivant]);
      suivant += 1;
    } else {
      coup = botAction(viewFor(e, e.order[e.turn]), hasardDuDefi(e));
    }
    if (!coup) return null;
    try {
      e = apply(e, coup);
    } catch {
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------ le bilan */

export interface BilanDuDefi {
  jour: string;
  /** Le rôle obtenu à chaque manche, dans l'ordre. */
  roles: Role[];
  points: number;
  fini: boolean;
  /** Le score a été reçu par le serveur ; place et total du jour à ce moment-là. */
  envoye?: boolean;
  place?: number;
  total?: number;
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

/** Le message qu'on envoie à ses proches : le score, les rôles, la série, et de quoi les piquer au jeu. */
export const texteDuDefi = (b: BilanDuDefi, serie = 0): string =>
  `Le Larbin — défi du ${jourCourt(b.jour)} : ${b.points}/${DEFI_MAXIMUM}\n${emojisDuDefi(b)}\n`
  + (serie >= 2 ? `🔥 ${serie} jours de suite\n` : '')
  + 'Même donne pour tout le monde. Tu fais mieux ?';

/* ------------------------------------------------------------ les séries */

/*
 * Ce qui fait revenir le lendemain : la série de jours sans manquer un défi.
 * On garde, pour chaque jour joué, les points obtenus — rien d'autre.
 */

/** Les points de chaque défi achevé, par jour (AAAA-MM-JJ). */
export type Historique = Record<string, number>;

/** Le jour d'avant (AAAA-MM-JJ), sans fuseau : on compte en dates, pas en heures. */
export function veille(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j - 1)).toISOString().slice(0, 10);
}

export interface StatsDuDefi {
  joues: number;
  /** Les jours consécutifs jusqu'à aujourd'hui — ou jusqu'à hier, tant qu'on peut encore la prolonger. */
  serie: number;
  record: number;
  /** Moyenne des points, arrondie au dixième. */
  moyenne: number;
  /** Le défi d'aujourd'hui est-il déjà fait ? */
  faitAujourdhui: boolean;
}

export function statsDuDefi(h: Historique, aujourdhui: string): StatsDuDefi {
  const jours = Object.keys(h).sort();
  const faitAujourdhui = aujourdhui in h;

  // La série court tant qu'aujourd'hui ou hier a été joué.
  let serie = 0;
  let curseur = faitAujourdhui ? aujourdhui : veille(aujourdhui);
  while (curseur in h) {
    serie += 1;
    curseur = veille(curseur);
  }

  let record = 0;
  let enCours = 0;
  let precedent = '';
  for (const jour of jours) {
    enCours = precedent && veille(jour) === precedent ? enCours + 1 : 1;
    record = Math.max(record, enCours);
    precedent = jour;
  }

  const total = jours.reduce((s, j) => s + h[j], 0);
  return {
    joues: jours.length,
    serie,
    record,
    moyenne: jours.length ? Math.round((total / jours.length) * 10) / 10 : 0,
    faitAujourdhui,
  };
}

const CLE_HISTORIQUE = 'larbin.defi.historique';

export function lireHistorique(): Historique {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_HISTORIQUE) ?? '{}') as Record<string, unknown>;
    const h: Historique = {};
    for (const [jour, points] of Object.entries(brut ?? {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(jour) && Number.isInteger(points)) h[jour] = points as number;
    }
    return h;
  } catch {
    return {};
  }
}

/** Ajoute un défi achevé à l'historique ; rejouer le même jour ne change rien. */
export function noterDansLHistorique(b: BilanDuDefi): Historique {
  const h = lireHistorique();
  if (!b.fini || b.jour in h) return h;
  h[b.jour] = b.points;
  try {
    localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(h));
  } catch { /* la série repartira de zéro, tant pis */ }
  return h;
}

/* ------------------------------------------------------------ le disque */

const CLE_BILAN = 'larbin.defi.bilan';
const CLE_COUPS = 'larbin.defi.coups';

/** Les coups joués dans le défi du jour : ce que le serveur rejouera. */
export function lireCoups(): Action[] {
  try {
    const c = JSON.parse(localStorage.getItem(CLE_COUPS) ?? '[]');
    return Array.isArray(c) ? c : [];
  } catch {
    return [];
  }
}

export function garderCoups(coups: Action[]): void {
  try {
    localStorage.setItem(CLE_COUPS, JSON.stringify(coups));
  } catch { /* sans eux, le score ne sera pas classé */ }
}

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
