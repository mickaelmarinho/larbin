/**
 * Les avatars : une émoticône à côté de son nom.
 *
 * Douze sont libres. Huit se gagnent avec les succès — la couronne se mérite en
 * passant de Larbin à Boss, le clown en finissant sur un 2 — ce qui donne aux
 * succès une récompense qu'on voit, et qu'on montre aux autres en ligne.
 *
 * Le choix reste dans le navigateur, comme les succès. Le serveur, lui, ne
 * connaît que la liste complète (protocole.ts) : il ne peut pas savoir quels
 * succès un joueur a obtenus, et un tricheur ne gagnerait qu'une émoticône.
 */
import { AVATARS } from '../reseau/protocole.ts';
import { type IdSucces, succesObtenus } from './succes.ts';

export const AVATARS_LIBRES = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦁', '🐯', '🐨', '🐧', '🦄', '🎩', '😎'];

export const AVATARS_A_GAGNER: Array<{ avatar: string; succes: IdSucces }> = [
  { avatar: '👑', succes: 'larbin-boss' },
  { avatar: '⚡', succes: 'boss-direct' },
  { avatar: '🛡️', succes: 'jamais-larbin' },
  { avatar: '🃏', succes: 'quatre-deux' },
  { avatar: '🔥', succes: 'serie-trois' },
  { avatar: '🤡', succes: 'fini-sur-deux' },
  { avatar: '🎓', succes: 'didacticiel' },
  { avatar: '🏛️', succes: 'cinquante-parties' },
];

export const AVATAR_PAR_DEFAUT = '🦊';

/** Les adversaires du solo et du didacticiel ont chacun le leur. */
export const BOTS_SOLO: Record<string, string> = { gina: '🦩', hugo: '🐻', lila: '🦋' };

const CLE = 'larbin.avatar';

/** Un avatar est permis s'il est libre, ou si l'on a obtenu le succès qui le débloque. */
export function avatarPermis(avatar: string, obtenus: Partial<Record<IdSucces, string>>): boolean {
  if (!(AVATARS as readonly string[]).includes(avatar)) return false;
  if (AVATARS_LIBRES.includes(avatar)) return true;
  const gain = AVATARS_A_GAGNER.find((a) => a.avatar === avatar);
  return Boolean(gain && obtenus[gain.succes]);
}

/** L'avatar qu'un succès débloque, s'il en débloque un. */
export const avatarDebloquePar = (id: IdSucces): string | undefined =>
  AVATARS_A_GAGNER.find((a) => a.succes === id)?.avatar;

export function avatarChoisi(): string {
  try {
    const choisi = localStorage.getItem(CLE);
    return choisi && avatarPermis(choisi, succesObtenus()) ? choisi : AVATAR_PAR_DEFAUT;
  } catch {
    return AVATAR_PAR_DEFAUT;
  }
}

/** Retient l'avatar s'il est permis ; renvoie faux sinon. */
export function choisirAvatar(avatar: string): boolean {
  if (!avatarPermis(avatar, succesObtenus())) return false;
  try {
    localStorage.setItem(CLE, avatar);
  } catch { /* il ne tiendra que le temps de la visite */ }
  return true;
}
