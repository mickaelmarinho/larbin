/**
 * Le journal du moteur, en anglais.
 *
 * Le moteur raconte la partie en français, à la troisième personne (« Hugo pose
 * D♥. ») : il est partagé avec le serveur, et on n'y touche pas. Ses phrases
 * suivent une douzaine de modèles fixes ; on les traduit à l'affichage, en
 * conjuguant quand le joueur, c'est vous (« You play Q♥. »).
 */
import type { Role } from '../engine/types.ts';

export const ROLES_EN: Record<Role, string> = {
  'boss': 'Boss', 'sous-boss': 'Deputy', 'neutre': 'Neutral', 'sur-larbin': 'Underling', 'larbin': 'Lackey',
};

/** V, D, R — Valet, Dame, Roi — deviennent J, Q, K ; l'As et les chiffres ne changent pas. */
export const cartesEnAnglais = (texte: string): string =>
  texte.replace(/(^|[\s(])(V|D|R)(?=[♠♥♦♣])/g, (_, avant: string, l: string) => avant + ({ V: 'J', D: 'Q', R: 'K' })[l as 'V']);

const ordinal = (n: number): string => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
};

type Traduction = (sujet: string, vous: boolean, ...reste: string[]) => string;

/** Chaque modèle du moteur : le motif français, et sa version anglaise. */
const MODELES: Array<[RegExp, Traduction]> = [
  [/^--- Manche (\d+) ---$/, (n) => `--- Round ${n} ---`],
  [/^(.+) ouvre la première manche \(dame de cœur\)\.$/,
    (s, v) => `${s} open${v ? '' : 's'} the first round (queen of hearts).`],
  [/^(.+) coupe et montre (\S+) : il la garde\.$/,
    (s, v, c) => `${s} cut${v ? '' : 's'} the deck and show${v ? '' : 's'} ${c}, then keep${v ? '' : 's'} it.`],
  [/^(.+) et (.+) ont fait leur échange\.$/, (s, _v, autre) => `${s} and ${autre} swapped cards.`],
  [/^(.+) pose (.+)\.$/, (s, v, c) => `${s} play${v ? '' : 's'} ${c}.`],
  [/^(.+) termine sur un 2 : Larbin d'office !$/, (s, v) => `${s} finish${v ? '' : 'es'} on a 2: Lackey by default!`],
  [/^(.+) a fini \((\d+)(?:er|e)\)\.$/, (s, v, n) => `${s} ${v ? 'are' : 'is'} out (${ordinal(Number(n))}).`],
  [/^Le 2 coupe : la série s'arrête là\.$/, () => 'The 2 cuts: the trick ends here.'],
  [/^(.+) passe\.$/, (s, v) => `${s} pass${v ? '' : 'es'}.`],
  [/^Série terminée\.$/, () => 'Trick over.'],
  [/^(.+) ouvre une nouvelle série\.$/, (s, v) => `${s} open${v ? '' : 's'} a new trick.`],
  [/^(.+) : (boss|sous-boss|neutre|sur-larbin|larbin), \+(\d+) \((\d+) pts\)\.$/,
    (s, _v, role, gain, total) => `${s}: ${ROLES_EN[role as Role]}, +${gain} (${total} pts).`],
  [/^(.+) remporte la partie avec (\d+) points\.$/, (s, v, n) => `${s} win${v ? '' : 's'} the game with ${n} points.`],
];

/**
 * Une ligne du moteur, en anglais. « moi » est le nom du joueur à qui l'on
 * parle : là où il est le sujet, la phrase passe à « You ». Une ligne inconnue
 * est rendue telle quelle — mieux vaut du français qu'un vide.
 */
export function ligneEnAnglais(ligne: string, moi: string): string {
  for (const [motif, traduire] of MODELES) {
    const m = ligne.match(motif);
    if (!m) continue;
    const [, sujet = '', ...reste] = m;
    // La première manche et les séries n'ont pas de sujet : le motif ne capture pas de nom.
    const aUnSujet = !motif.source.startsWith('^---') && !motif.source.startsWith('^Le 2') && !motif.source.startsWith('^Série');
    if (!aUnSujet) return traduire(sujet, false, ...reste);
    const vous = sujet === moi;
    let phrase = traduire(vous ? 'You' : sujet, vous, ...reste.map((r) => (r === moi ? 'you' : r)));
    // « Lila and You swapped » se dit « You and Lila swapped ».
    phrase = phrase.replace(/^(.+) and you swapped cards\.$/, 'You and $1 swapped cards.');
    return cartesEnAnglais(phrase);
  }
  return cartesEnAnglais(ligne);
}
