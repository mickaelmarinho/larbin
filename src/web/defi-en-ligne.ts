/**
 * Le défi du jour, côté serveur : envoyer ses coups, lire le classement.
 *
 * Le navigateur n'annonce jamais son score : il envoie les coups joués, et le
 * serveur rejoue la partie pour trouver le score lui-même. Sans réseau, ou
 * depuis le fichier seul, le défi se joue quand même — il n'est simplement pas
 * classé.
 */
import type { Role } from '../engine/types.ts';
import { emojisDuDefi, garderBilan, lireCoups, type BilanDuDefi } from './defi.ts';
import { jetonDeSession } from './session.ts';
import { hoteDuJeu } from './table.ts';

export interface LigneDuDefi {
  nom: string;
  points: number;
  roles: string;
  compte: boolean;
}

async function appeler(chemin: string, corps?: unknown): Promise<{ statut: number; corps: any } | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (location.protocol === 'file:') return null;
  try {
    const hote = await hoteDuJeu();
    const base = hote === location.host ? '' : `https://${hote}`;
    const jeton = jetonDeSession();
    const r = await fetch(`${base}${chemin}`, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: {
        ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      cache: 'no-store',
    });
    return { statut: r.status, corps: await r.json().catch(() => null) };
  } catch {
    return null;
  }
}

/**
 * Envoie le défi achevé, une seule fois. Renvoie le bilan à jour — avec la
 * place obtenue — ou tel quel si le serveur ne répond pas : on réessaiera à
 * la prochaine ouverture du score.
 */
export async function envoyerLeDefi(bilan: BilanDuDefi, nom: string): Promise<BilanDuDefi> {
  if (!bilan.fini || bilan.envoye) return bilan;
  const r = await appeler('/defi', { jour: bilan.jour, coups: lireCoups(), nom });
  if (!r) return bilan;
  // Refusé pour de bon (déjà envoyé, partie qui ne se rejoue pas) : on n'insiste pas.
  const aJour: BilanDuDefi = r.statut === 201
    ? { ...bilan, envoye: true, place: r.corps.place, total: r.corps.total }
    : r.statut === 409 || r.statut === 400 ? { ...bilan, envoye: true } : bilan;
  if (aJour !== bilan) garderBilan(aJour);
  return aJour;
}

export async function classementDuDefi(jour: string): Promise<{ total: number; lignes: LigneDuDefi[] } | null> {
  const r = await appeler(`/defi?jour=${jour}`);
  return r?.statut === 200 && Array.isArray(r.corps?.lignes) ? r.corps : null;
}

/** Les rôles d'une ligne du classement, en émojis. */
export const emojisDeLaLigne = (l: LigneDuDefi): string =>
  emojisDuDefi({ jour: '', roles: l.roles.split(',') as Role[], points: 0, fini: true });
