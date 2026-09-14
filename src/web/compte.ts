/**
 * Le compte, vu du navigateur.
 *
 * Tout continue de marcher sans lui : les succès, le parcours et l'avatar
 * restent dans le navigateur, qui en garde la copie de travail. Le compte en
 * garde une autre, et les deux se réunissent à chaque synchronisation — si bien
 * qu'on retrouve tout sur un autre appareil, et qu'une coupure de réseau ne
 * fait rien perdre.
 */
import { avatarChoisi, choisirAvatar } from './avatars.ts';
import { parcours, relire as relireParcours, remplacerParcours } from './parcours.ts';
import { garderSession, sessionOuverte } from './session.ts';
import { adopterSucces, listeSucces, succesLocaux } from './succes.ts';
import { hoteDuJeu } from './table.ts';

export interface Compte {
  pseudo: string;
  avatar: string | null;
  creeLe: string;
}

export interface LigneClassement {
  pseudo: string;
  avatar: string | null;
  victoires: number;
  parties: number;
}

interface Reponse {
  ok: boolean;
  statut: number;
  // La forme de chaque réponse est vérifiée là où on la lit.
  corps: any;   // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function appeler(chemin: string, corps?: unknown): Promise<Reponse> {
  const session = sessionOuverte();
  try {
    const hote = await hoteDuJeu();
    const base = hote === location.host ? '' : `https://${hote}`;
    const entetes: Record<string, string> = {};
    if (corps !== undefined) entetes['Content-Type'] = 'application/json';
    if (session) entetes.Authorization = `Bearer ${session.jeton}`;
    const reponse = await fetch(`${base}${chemin}`, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: entetes,
      body: corps === undefined ? undefined : JSON.stringify(corps),
      cache: 'no-store',
    });
    const texte = await reponse.text();
    return { ok: reponse.ok, statut: reponse.status, corps: texte ? JSON.parse(texte) : null };
  } catch {
    return { ok: false, statut: 0, corps: null };
  }
}

const messageDErreur = (r: Reponse): string =>
  typeof r.corps?.erreur === 'string' ? r.corps.erreur
    : r.statut === 0 ? 'Le serveur ne répond pas. Réessayez dans un instant.'
    : 'Une erreur est survenue.';

/** Ce que le compte rapporte : ses succès et son parcours rejoignent ceux du navigateur. */
function adopter(donnees: unknown): void {
  const d = donnees as { succes?: unknown; parcours?: unknown } | null;
  adopterSucces(listeSucces(d?.succes));
  if (d?.parcours) remplacerParcours({ ...relireParcours(d.parcours), dernier: parcours().dernier });
}

export async function creerCompte(pseudo: string): Promise<{ code: string } | { erreur: string }> {
  const r = await appeler('/compte/creer', { pseudo });
  if (!r.ok) return { erreur: messageDErreur(r) };
  garderSession({ jeton: r.corps.jeton, pseudo: r.corps.compte.pseudo });
  // Ce que le joueur a déjà gagné en invité rejoint son nouveau compte.
  await synchroniser();
  return { code: r.corps.code };
}

export async function seConnecter(pseudo: string, code: string): Promise<{ erreur: string } | null> {
  const r = await appeler('/compte/connexion', { pseudo, code });
  if (!r.ok) return { erreur: messageDErreur(r) };
  garderSession({ jeton: r.corps.jeton, pseudo: r.corps.compte.pseudo });
  adopter(r.corps.donnees);
  // Sur un nouvel appareil, c'est l'avatar du compte qui compte — une fois ses
  // succès adoptés, pour qu'il y soit permis.
  if (r.corps.compte.avatar) choisirAvatar(r.corps.compte.avatar);
  await synchroniser();
  return null;
}

/** Envoie ce que le navigateur sait, et reprend ce que le compte sait de plus. */
export async function synchroniser(): Promise<void> {
  if (!sessionOuverte()) return;
  const r = await appeler('/compte/synchro', { parcours: parcours(), succes: succesLocaux(), avatar: avatarChoisi() });
  if (r.statut === 401) {
    garderSession(null);
    return;
  }
  if (r.ok) adopter(r.corps.donnees);
}

let enAttente: ReturnType<typeof setTimeout> | undefined;

/** Une synchronisation un peu plus tard : plusieurs changements rapprochés n'en font qu'une. */
export function synchroniserBientot(): void {
  if (!sessionOuverte()) return;
  clearTimeout(enAttente);
  enAttente = setTimeout(() => void synchroniser(), 2000);
}

/** Le compte connecté, à jour ; null si la session a expiré ; « indisponible » si le serveur se tait. */
export async function monCompte(): Promise<{ compte: Compte; verifies: number } | null | 'indisponible'> {
  if (!sessionOuverte()) return null;
  const r = await appeler('/compte');
  if (r.statut === 401) {
    garderSession(null);
    return null;
  }
  if (!r.ok) return 'indisponible';
  adopter(r.corps.donnees);
  const verifies = listeSucces(r.corps.donnees?.succes).filter((s) => s.verifie).length;
  return { compte: r.corps.compte as Compte, verifies };
}

export async function nouveauCodeSecret(): Promise<string | null> {
  const r = await appeler('/compte/nouveau-code', {});
  return r.ok && typeof r.corps?.code === 'string' ? r.corps.code : null;
}

export async function seDeconnecter(): Promise<void> {
  await appeler('/compte/deconnexion', {});
  garderSession(null);
}

export async function supprimerMonCompte(): Promise<boolean> {
  const r = await appeler('/compte/supprimer', {});
  if (r.ok) garderSession(null);
  return r.ok;
}

export async function classementPublic(): Promise<LigneClassement[] | null> {
  const r = await appeler('/classement');
  return r.ok && Array.isArray(r.corps) ? r.corps as LigneClassement[] : null;
}
