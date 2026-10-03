/**
 * Le jeu en deux langues.
 *
 * Le français à la racine du site, l'anglais sous /en/ : deux adresses, pour
 * que les moteurs de recherche indexent chacune dans sa langue. Le même script
 * sert les deux ; il lit la langue dans l'adresse.
 *
 * Chaque texte s'écrit avec ses deux versions côte à côte — tr('Passer',
 * 'Pass') — plutôt que par une clé renvoyant à un dictionnaire : on relit et on
 * corrige les deux d'un seul regard, et aucun texte ne peut manquer dans l'une.
 */

import { SUR_PORTAIL, langueDuNavigateur } from './portail.ts';

export type Langue = 'fr' | 'en';

/** La langue d'une adresse : l'anglais sous /en, le français partout ailleurs. */
export const langueDe = (chemin: string): Langue => (/^\/en(\/|$)/.test(chemin) ? 'en' : 'fr');

export const LANGUE: Langue = typeof location === 'undefined' ? 'fr'
  // Chez un portail, ?lang=fr ou ?lang=en force la langue : c'est ce qui permet de relire les deux.
  : SUR_PORTAIL ? langueDuNavigateur(new URLSearchParams(location.search).get('lang') ?? navigator.language)
    : langueDe(location.pathname);

export const enAnglais = LANGUE === 'en';

/** Le texte dans la langue de la page. */
export const tr = (fr: string, en: string): string => (enAnglais ? en : fr);

/** Le préfixe des adresses du site dans cette langue : '' ou '/en'. */
export const PREFIXE = enAnglais && !SUR_PORTAIL ? '/en' : '';

/** « 1 partie », « 3 parties » — et leurs équivalents anglais. */
export const pluriel = (n: number, fr: [string, string], en: [string, string]): string =>
  `${n} ${(enAnglais ? en : fr)[n > 1 || (enAnglais && n === 0) ? 1 : 0]}`;

/** « 1er », « 2e » — « 1st », « 2nd ». */
export function rang(n: number): string {
  if (!enAnglais) return n === 1 ? '1er' : `${n}e`;
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}
