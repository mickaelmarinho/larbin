/**
 * Ce que l'accueil dit de la vie du site : qui est là en ce moment, et qui
 * mène le classement. Des décisions sans navigateur ni serveur, pour pouvoir
 * les éprouver telles quelles.
 */
import type { LigneClassement } from './compte.ts';
import type { Activite } from './table.ts';

export interface SigneDeVie {
  texte: string;
  /** Un complément, que les plus petits écrans peuvent taire. */
  detail: string;
  /** Du monde est là : le point bat. Sinon, ce n'est qu'une invitation. */
  vivant: boolean;
}

/**
 * Rien quand le serveur se tait : mieux vaut ne rien dire que promettre. Et
 * jamais « 0 joueur » — un site désert n'attire personne, alors qu'une table à
 * ouvrir, si.
 */
export function signeDeVie(a: Activite | null): SigneDeVie | null {
  if (!a) return null;
  if (a.joueurs <= 0) return { texte: 'Lancez la première table', detail: '', vivant: false };
  const s = a.publiques > 1 ? 's' : '';
  const detail = a.publiques > 0 ? `${a.publiques} table${s} ouverte${s}` : '';
  return { texte: `${a.joueurs} en ligne`, detail, vivant: true };
}

/** Le bouton du jeu en ligne invite à rejoindre ceux qui attendent déjà. */
export function texteDuBoutonPublic(a: Activite | null): string {
  if (a && a.enAttente > 1) return `Rejoindre ${a.enAttente} visiteurs qui attendent`;
  if (a && a.enAttente === 1) return 'Rejoindre un visiteur qui attend';
  return 'Jouer avec d\'autres visiteurs';
}

/**
 * Les premiers du classement, pour l'accueil. Ceux qui n'ont encore rien gagné
 * n'y montent pas : un podium de zéros ne donne envie à personne.
 */
export function podium(lignes: LigneClassement[] | null, taille = 3): LigneClassement[] {
  return (lignes ?? [])
    .filter((l) => l.victoires > 0)
    .sort((a, b) => b.victoires - a.victoires || a.parties - b.parties)
    .slice(0, taille);
}
