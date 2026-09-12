/**
 * Ce qui mérite un son, d'un instant à l'autre de la table.
 *
 * Aucune dépendance au navigateur : on compare deux photographies — la vue et
 * l'état du salon — et l'on dit ce qui s'est passé entre les deux. C'est ce qui
 * permet de l'éprouver sans haut-parleur, et de garder les sons eux-mêmes
 * (sons.ts) bêtes et interchangeables.
 */
import type { PlayerView } from '../engine/game.ts';
import type { EtatSalon } from '../reseau/protocole.ts';

export type Son = 'carte' | 'deux' | 'passe' | 'a-vous' | 'arrivee' | 'depart' | 'fin-de-manche'
  | 'reaction';

export interface Instant {
  vue: PlayerView | null;
  salon: EtatSalon | null;
}

export const RIEN: Instant = { vue: null, salon: null };

const DEUX = 15;

/** Les humains présents, sauf moi : les bots vont et viennent sans bruit. */
function presents(salon: EtatSalon, moi: string): Set<string> {
  return new Set(salon.sieges.filter((s) => !s.estBot && s.connecte && s.id !== moi).map((s) => s.id));
}

/**
 * Les lignes du journal apparues depuis la vue précédente. La vue n'en garde
 * que les dernières : on cherche où l'ancienne fenêtre recouvre la nouvelle.
 */
function nouvellesLignes(avant: string[], apres: string[]): string[] {
  for (let k = Math.min(avant.length, apres.length); k > 0; k--) {
    const fin = avant.slice(avant.length - k);
    if (fin.every((ligne, i) => ligne === apres[i])) return apres.slice(k);
  }
  return apres;
}

const signature = (vue: PlayerView) =>
  vue.pile.map((coup) => `${coup.player}:${coup.cards.map((c) => c.id).join(',')}`).join('|');

export function quoiEntendre(avant: Instant, apres: Instant, moi: string, enLigne: boolean): Son[] {
  const sons = new Set<Son>();

  // Qui arrive, qui s'en va. Un inconnu qui reprend la place d'un bot compte
  // comme une arrivée : c'est bien quelqu'un qui vient de s'asseoir.
  if (avant.salon && apres.salon && avant.salon.code === apres.salon.code) {
    const etaient = presents(avant.salon, moi);
    const sont = presents(apres.salon, moi);
    if ([...sont].some((id) => !etaient.has(id))) sons.add('arrivee');
    if ([...etaient].some((id) => !sont.has(id))) sons.add('depart');
  }

  const a = avant.vue;
  const b = apres.vue;
  // Une autre partie, une autre manche : tout a changé d'un coup, et rien de
  // tout cela n'est un coup joué. On se tait.
  if (!a || !b || a.partie !== b.partie || a.round !== b.round) return [...sons];

  if (a.phase === 'jeu' && (b.phase === 'fin-de-manche' || b.phase === 'fin-de-partie')) {
    sons.add('fin-de-manche');
  }

  // La pile reste affichée après la fin d'une série : si elle a changé et
  // n'est pas vide, quelqu'un vient de poser.
  if (b.pile.length > 0 && signature(a) !== signature(b)) {
    const dernier = b.pile[b.pile.length - 1];
    sons.add(dernier.cards[0]?.rank === DEUX ? 'deux' : 'carte');
  }

  // Les drapeaux « a passé » sont remis à zéro quand la série se ferme : la
  // passe qui la ferme n'y laisserait aucune trace. Le journal, si.
  if (nouvellesLignes(a.log, b.log).some((ligne) => ligne.endsWith(' passe.'))) sons.add('passe');

  // En ligne seulement : en solo les bots répondent en une seconde, et un
  // carillon à chaque tour deviendrait vite une rengaine.
  if (enLigne && b.phase === 'jeu' && b.turnPlayer === moi && a.turnPlayer !== moi && b.legal.length > 0) {
    sons.add('a-vous');
  }

  return [...sons];
}
