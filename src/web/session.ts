/**
 * La session du compte, gardée dans ce navigateur.
 *
 * Sans dépendance : la table en ligne et le panneau du compte la lisent tous
 * deux, et aucun des deux ne doit dépendre de l'autre.
 */
const CLE = 'larbin.session';

export interface Session {
  jeton: string;
  pseudo: string;
}

export function sessionOuverte(): Session | null {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Partial<Session> | null;
    return brut && typeof brut.jeton === 'string' && typeof brut.pseudo === 'string'
      ? { jeton: brut.jeton, pseudo: brut.pseudo }
      : null;
  } catch {
    return null;
  }
}

export function garderSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(CLE, JSON.stringify(session));
    else localStorage.removeItem(CLE);
  } catch { /* sans stockage, la session ne survit pas à la page */ }
}

export const jetonDeSession = (): string | undefined => sessionOuverte()?.jeton;
