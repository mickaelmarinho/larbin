/**
 * Les succès : des défis qu'on relève en jouant, et qu'on garde.
 *
 * Comme le parcours, tout reste dans le navigateur du joueur — aucun compte,
 * aucun envoi. On ne récompense que ce qui se voit à table et qui raconte une
 * histoire : passer de Larbin à Boss, gagner sans jamais avoir servi, recevoir
 * les quatre 2… et même finir sur un 2, parce qu'on en rit après coup.
 *
 * La décision est pure — une mémoire entre, des succès sortent — si bien
 * qu'elle s'éprouve sans navigateur. Chaque moment n'est compté qu'une fois :
 * recharger la page sur l'écran de fin ne débloque rien de plus.
 */
import type { Card, Role } from '../engine/types.ts';

export type IdSucces =
  | 'premiere-victoire' | 'larbin-boss' | 'boss-direct' | 'trois-boss' | 'jamais-larbin'
  | 'remontada' | 'quatre-deux' | 'fini-sur-deux' | 'serie-trois' | 'en-ligne'
  | 'didacticiel' | 'dix-parties' | 'cinquante-parties';

export interface Succes {
  id: IdSucces;
  icone: string;
  nom: string;
  comment: string;
}

export const SUCCES: Succes[] = [
  { id: 'premiere-victoire', icone: '🏆', nom: 'Première victoire', comment: 'Gagner une partie.' },
  { id: 'larbin-boss', icone: '👑', nom: 'De Larbin à Boss', comment: 'Être Boss juste après avoir été Larbin.' },
  { id: 'boss-direct', icone: '⚡', nom: 'D’entrée de jeu', comment: 'Être Boss dès la première manche.' },
  { id: 'trois-boss', icone: '🔱', nom: 'Règne sans partage', comment: 'Être Boss trois manches de suite.' },
  { id: 'jamais-larbin', icone: '🛡️', nom: 'Intouchable', comment: 'Gagner une partie sans jamais avoir été Larbin.' },
  { id: 'remontada', icone: '🧗', nom: 'Remontada', comment: 'Gagner une partie commencée en Larbin.' },
  { id: 'quatre-deux', icone: '🃏', nom: 'Carré de 2', comment: 'Recevoir les quatre 2 dans sa main.' },
  { id: 'fini-sur-deux', icone: '🤡', nom: 'Larbin d’office', comment: 'Finir une manche sur un 2. Ça arrive aux meilleurs.' },
  { id: 'serie-trois', icone: '🔥', nom: 'Série de trois', comment: 'Gagner trois parties d’affilée.' },
  { id: 'en-ligne', icone: '🌍', nom: 'Premier contact', comment: 'Terminer une partie en ligne.' },
  { id: 'didacticiel', icone: '🎓', nom: 'Bon élève', comment: 'Suivre le didacticiel jusqu’au bout.' },
  { id: 'dix-parties', icone: '🎲', nom: 'Habitué', comment: 'Terminer dix parties.' },
  { id: 'cinquante-parties', icone: '🏛️', nom: 'Pilier du tripot', comment: 'Terminer cinquante parties.' },
];

const DEUX = 15;
const ROLES: Role[] = ['boss', 'sous-boss', 'neutre', 'sur-larbin', 'larbin'];

/** Ce qu'on retient entre deux visites. */
export interface Memoire {
  /** Les succès obtenus, avec leur date (ISO). */
  obtenus: Partial<Record<IdSucces, string>>;
  /** La partie dont on suit les rôles, manche par manche. */
  partie: string;
  roles: Record<number, Role>;
  /** La dernière donne examinée (« partie:manche »), pour ne la regarder qu'une fois. */
  mainVue: string;
  /** La dernière partie dont on a compté la fin. */
  partieClose: string;
}

export function memoireVide(): Memoire {
  return { obtenus: {}, partie: '', roles: {}, mainVue: '', partieClose: '' };
}

/** Garde les succès pas encore obtenus, les date, et les renvoie. */
export function debloquer(m: Memoire, candidats: IdSucces[], date: string): IdSucces[] {
  const nouveaux = candidats.filter((id, i) => !m.obtenus[id] && candidats.indexOf(id) === i);
  for (const id of nouveaux) m.obtenus[id] = date;
  return nouveaux;
}

/** Ce qu'une manche terminée peut valoir. */
export function succesDeManche(m: Memoire, partie: string, manche: number, role: Role,
  surUnDeux: boolean): IdSucces[] {
  if (m.partie !== partie) {
    m.partie = partie;
    m.roles = {};
  }
  if (m.roles[manche] !== undefined) return [];   // déjà comptée
  m.roles[manche] = role;

  const candidats: IdSucces[] = [];
  if (role === 'boss') {
    if (manche === 1) candidats.push('boss-direct');
    if (m.roles[manche - 1] === 'larbin') candidats.push('larbin-boss');
    if (m.roles[manche - 1] === 'boss' && m.roles[manche - 2] === 'boss') candidats.push('trois-boss');
  }
  if (surUnDeux) candidats.push('fini-sur-deux');
  return candidats;
}

export interface FinDePartie {
  gagne: boolean;
  enLigne: boolean;
  manches: number;
  /** Parties terminées en tout, celle-ci comprise. */
  parties: number;
  /** Victoires d'affilée, celle-ci comprise. */
  serie: number;
}

/** Ce qu'une partie terminée peut valoir. */
export function succesDePartie(m: Memoire, partie: string, fin: FinDePartie): IdSucces[] {
  if (m.partieClose === partie) return [];   // déjà comptée
  m.partieClose = partie;

  const candidats: IdSucces[] = [];
  // Les rôles ne valent que si on les a tous vus : qui a rejoint en cours de
  // route n'a pas « jamais été Larbin » sur les manches qu'il n'a pas jouées.
  const roles = m.partie === partie ? m.roles : {};
  const toutesVues = Object.keys(roles).length === fin.manches;

  if (fin.gagne) {
    candidats.push('premiere-victoire');
    if (toutesVues && !Object.values(roles).includes('larbin')) candidats.push('jamais-larbin');
    if (roles[1] === 'larbin') candidats.push('remontada');
  }
  if (fin.serie >= 3) candidats.push('serie-trois');
  if (fin.enLigne) candidats.push('en-ligne');
  if (fin.parties >= 10) candidats.push('dix-parties');
  if (fin.parties >= 50) candidats.push('cinquante-parties');
  return candidats;
}

/** Ce qu'une donne peut valoir, regardée une seule fois par manche. */
export function succesDeMain(m: Memoire, partie: string, manche: number, main: Card[]): IdSucces[] {
  const cle = `${partie}:${manche}`;
  if (m.mainVue === cle) return [];
  m.mainVue = cle;
  return main.filter((c) => c.rank === DEUX).length === 4 ? ['quatre-deux'] : [];
}

/* ------------------------------------------------------------- le disque */

const CLE = 'larbin.succes';
const IDS = new Set(SUCCES.map((s) => s.id));

/** Le disque a pu être écrit par une autre version, ou bricolé : on relit pièce par pièce. */
export function relire(brut: unknown): Memoire {
  const m = memoireVide();
  if (!brut || typeof brut !== 'object') return m;
  const b = brut as Record<string, unknown>;
  if (b.obtenus && typeof b.obtenus === 'object') {
    for (const [id, date] of Object.entries(b.obtenus as Record<string, unknown>)) {
      if (IDS.has(id as IdSucces) && typeof date === 'string') m.obtenus[id as IdSucces] = date;
    }
  }
  if (typeof b.partie === 'string') m.partie = b.partie;
  if (b.roles && typeof b.roles === 'object') {
    for (const [manche, role] of Object.entries(b.roles as Record<string, unknown>)) {
      const n = Number(manche);
      if (Number.isInteger(n) && n > 0 && ROLES.includes(role as Role)) m.roles[n] = role as Role;
    }
  }
  if (typeof b.mainVue === 'string') m.mainVue = b.mainVue;
  if (typeof b.partieClose === 'string') m.partieClose = b.partieClose;
  return m;
}

function lire(): Memoire {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? relire(JSON.parse(brut)) : memoireVide();
  } catch {
    return memoireVide();
  }
}

/** Applique une décision à la mémoire du disque, et renvoie les succès à fêter. */
function noter(decider: (m: Memoire) => IdSucces[]): Succes[] {
  const m = lire();
  const nouveaux = debloquer(m, decider(m), new Date().toISOString());
  try {
    localStorage.setItem(CLE, JSON.stringify(m));
  } catch { /* stockage indisponible : on fêtera, sans retenir */ }
  return nouveaux.map((id) => SUCCES.find((s) => s.id === id)!);
}

export const succesObtenus = (): Partial<Record<IdSucces, string>> => lire().obtenus;

export const succesApresManche = (partie: string, manche: number, role: Role, surUnDeux: boolean) =>
  noter((m) => succesDeManche(m, partie, manche, role, surUnDeux));

export const succesApresPartie = (partie: string, fin: FinDePartie) =>
  noter((m) => succesDePartie(m, partie, fin));

export const succesApresDonne = (partie: string, manche: number, main: Card[]) =>
  noter((m) => succesDeMain(m, partie, manche, main));

export const succesDidacticiel = () => noter(() => ['didacticiel']);

/* -------------------------------------------------------------- les comptes */

/** Un succès tel que le garde un compte : daté, et vérifié quand le serveur l'a vu lui-même. */
export interface SuccesDate {
  id: IdSucces;
  date: string;
  verifie: boolean;
}

/** Relit une liste venue d'ailleurs, en ne gardant que des succès connus et datés. */
export function listeSucces(brut: unknown): SuccesDate[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const s = x as Record<string, unknown>;
    return IDS.has(s.id as IdSucces) && typeof s.date === 'string'
      ? [{ id: s.id as IdSucces, date: s.date, verifie: s.verifie === true }]
      : [];
  });
}

/** Réunit deux listes : la première date obtenue l'emporte, et un succès vérifié le reste. */
export function fusionnerSucces(a: SuccesDate[], b: SuccesDate[]): SuccesDate[] {
  const parId = new Map<IdSucces, SuccesDate>();
  for (const s of [...listeSucces(a), ...listeSucces(b)]) {
    const deja = parId.get(s.id);
    parId.set(s.id, deja
      ? { id: s.id, date: deja.date < s.date ? deja.date : s.date, verifie: deja.verifie || s.verifie }
      : s);
  }
  return [...parId.values()].sort((x, y) => x.date.localeCompare(y.date));
}

/** Les succès de ce navigateur, prêts à partir vers le compte. */
export const succesLocaux = (): SuccesDate[] =>
  Object.entries(lire().obtenus).map(([id, date]) => ({ id: id as IdSucces, date: date!, verifie: false }));

/** Ajoute à ce navigateur des succès venus du compte ou du serveur ; renvoie ceux qui y étaient nouveaux. */
export function adopterSucces(liste: Array<{ id: string; date: string }>): Succes[] {
  const m = lire();
  const nouveaux: Succes[] = [];
  for (const { id, date } of liste) {
    const succes = SUCCES.find((s) => s.id === id);
    if (!succes || typeof date !== 'string') continue;
    const deja = m.obtenus[succes.id];
    if (!deja) nouveaux.push(succes);
    if (!deja || date < deja) m.obtenus[succes.id] = date;
  }
  try {
    localStorage.setItem(CLE, JSON.stringify(m));
  } catch { /* stockage indisponible : on fêtera, sans retenir */ }
  return nouveaux;
}
