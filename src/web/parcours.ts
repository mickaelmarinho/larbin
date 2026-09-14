/**
 * Ce que le joueur laisse derrière lui.
 *
 * Une partie finie ne laissait rien : on fermait l'onglet et le compteur
 * repartait de zéro. Ce module garde la trace des parties et des rôles obtenus,
 * dans le navigateur du joueur et nulle part ailleurs — aucun compte, aucun
 * envoi. Ce qui est stocké tient dans quelques kilo-octets.
 */
import type { Role } from '../engine/types.ts';

export interface Partie {
  /** ISO, pour rester lisible et comparable sans dépendre du fuseau d'affichage. */
  date: string;
  mode: 'solo' | 'en-ligne';
  joueurs: number;
  /** 1 pour le vainqueur. */
  place: number;
  points: number;
  gagnant: string;
  manches: number;
}

export interface Parcours {
  parties: Partie[];
  roles: Record<Role, number>;
  /** Les manches terminées sur un 2 : la punition maison, et une fierté à l'envers. */
  deuxFatals: number;
  /**
   * Jusqu'où on a compté la partie en cours. Le jeu se sauvegarde : recharger
   * la page pendant l'écran de fin ramène le même panneau, et sans ce repère
   * la manche — ou la partie entière — serait comptée une fois de plus à chaque
   * rechargement. Il doit donc vivre sur le disque, comme la partie elle-même.
   */
  dernier: { partie: string; manche: number; close: boolean };
}

const CLE = 'larbin.parcours';
/** Au-delà, on perdrait plus de place qu'on ne gagnerait de souvenirs. */
const MAX_PARTIES = 50;

const ROLES: Role[] = ['boss', 'sous-boss', 'neutre', 'sur-larbin', 'larbin'];

function vide(): Parcours {
  return {
    parties: [],
    roles: { boss: 0, 'sous-boss': 0, neutre: 0, 'sur-larbin': 0, larbin: 0 },
    deuxFatals: 0,
    dernier: { partie: '', manche: 0, close: false },
  };
}

const entier = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/**
 * Le contenu vient du disque du joueur : il a pu être écrit par une version
 * plus ancienne, tronqué, ou bricolé à la main. On le relit pièce par pièce
 * plutôt que de faire confiance à sa forme.
 */
export function relire(brut: unknown): Parcours {
  const p = vide();
  if (!brut || typeof brut !== 'object') return p;
  const o = brut as Record<string, unknown>;

  if (Array.isArray(o.parties)) {
    for (const item of o.parties.slice(0, MAX_PARTIES)) {
      if (!item || typeof item !== 'object') continue;
      const p2 = item as Record<string, unknown>;
      if (typeof p2.date !== 'string') continue;
      p.parties.push({
        date: p2.date,
        mode: p2.mode === 'en-ligne' ? 'en-ligne' : 'solo',
        joueurs: entier(p2.joueurs) || 4,
        place: entier(p2.place) || 1,
        points: entier(p2.points),
        gagnant: typeof p2.gagnant === 'string' ? p2.gagnant : '?',
        manches: entier(p2.manches),
      });
    }
  }

  const roles = o.roles as Record<string, unknown> | undefined;
  if (roles && typeof roles === 'object') {
    for (const r of ROLES) p.roles[r] = entier(roles[r]);
  }
  p.deuxFatals = entier(o.deuxFatals);

  const d = o.dernier as Record<string, unknown> | undefined;
  if (d && typeof d === 'object' && typeof d.partie === 'string') {
    p.dernier = { partie: d.partie, manche: entier(d.manche), close: d.close === true };
  }
  return p;
}

export function parcours(): Parcours {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? relire(JSON.parse(brut)) : vide();
  } catch {
    // Stockage indisponible ou illisible : on repart d'une page blanche.
    return vide();
  }
}

function ecrire(p: Parcours): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(p));
  } catch {
    // Mode privé, quota plein : le jeu marche, on perd seulement la mémoire.
  }
}

/** Une nouvelle partie repart de zéro côté comptage — pas côté souvenirs. */
function repere(p: Parcours, partie: string): void {
  if (p.dernier.partie !== partie) p.dernier = { partie, manche: 0, close: false };
}

/**
 * Une manche de plus dans tel rôle. Rejouée deux fois — parce que la page a été
 * rechargée sur le panneau de fin — elle ne compte toujours qu'une fois.
 */
export function noterManche(partie: string, manche: number, role: Role, surUnDeux: boolean): void {
  const p = parcours();
  repere(p, partie);
  if (manche <= p.dernier.manche) return;

  p.dernier.manche = manche;
  p.roles[role] += 1;
  if (surUnDeux) p.deuxFatals += 1;
  ecrire(p);
}

export function noterPartie(partie: string, resultat: Partie): Parcours {
  const p = parcours();
  repere(p, partie);
  if (p.dernier.close) return p;

  p.dernier.close = true;
  p.parties.unshift(resultat);
  p.parties = p.parties.slice(0, MAX_PARTIES);
  ecrire(p);
  return p;
}

export interface Bilan {
  parties: number;
  victoires: number;
  /** En pourcentage entier, ou null tant qu'aucune partie n'est finie. */
  taux: number | null;
  /** Victoires consécutives, la dernière partie comprise. */
  serie: number;
  meilleureSerie: number;
  manches: number;
}

export function bilan(p: Parcours): Bilan {
  const victoires = p.parties.filter((x) => x.place === 1).length;

  // Les parties sont rangées de la plus récente à la plus ancienne : la série
  // en cours se lit donc depuis le début du tableau.
  let serie = 0;
  for (const partie of p.parties) {
    if (partie.place !== 1) break;
    serie += 1;
  }

  let meilleure = 0;
  let courante = 0;
  for (const partie of p.parties) {
    courante = partie.place === 1 ? courante + 1 : 0;
    meilleure = Math.max(meilleure, courante);
  }

  return {
    parties: p.parties.length,
    victoires,
    taux: p.parties.length ? Math.round((victoires / p.parties.length) * 100) : null,
    serie,
    meilleureSerie: meilleure,
    manches: ROLES.reduce((total, r) => total + p.roles[r], 0),
  };
}

/**
 * Deux parcours du même joueur — ce navigateur, et son compte — réunis. Une
 * partie vue des deux côtés ne compte qu'une fois. Pour les rôles, dont on ne
 * sait pas ce que les deux côtés ont en commun, on garde le plus grand compte
 * plutôt que de risquer de les doubler.
 */
export function fusionnerParcours(a: Parcours, b: Parcours): Parcours {
  const vues = new Set<string>();
  const p = vide();
  p.parties = [...a.parties, ...b.parties]
    .sort((x, y) => y.date.localeCompare(x.date))
    .filter((x) => {
      const cle = `${x.date}|${x.mode}|${x.place}|${x.points}`;
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    })
    .slice(0, MAX_PARTIES);
  for (const r of ROLES) p.roles[r] = Math.max(a.roles[r], b.roles[r]);
  p.deuxFatals = Math.max(a.deuxFatals, b.deuxFatals);
  p.dernier = a.dernier;
  return p;
}

/** Remplace le parcours de ce navigateur, après une synchronisation avec le compte. */
export function remplacerParcours(p: Parcours): void {
  ecrire(p);
}
