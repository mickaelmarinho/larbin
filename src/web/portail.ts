/**
 * Le jeu logé chez un portail de jeux.
 *
 * Un portail affiche le jeu dans son propre cadre, à sa propre adresse : la
 * page n'y a plus d'adresse à nous, et sa langue ne se lit plus dans le chemin.
 * La page du portail (voir scripts/page-portail.mjs) dit chez qui elle est par
 * une variable posée avant le script ; tout le reste du code se règle dessus.
 *
 * Tous n'ont pas les mêmes exigences. CrazyGames relit les jeux et interdit les
 * comptes maison et les liens qui ramènent ses joueurs ailleurs ; itch.io
 * héberge sans rien demander, et le jeu y garde ses comptes et ses liens.
 */
export type Portail = 'crazygames' | 'itch';

const declare = typeof window === 'undefined' ? undefined : (window as { LARBIN_PORTAIL?: string }).LARBIN_PORTAIL;

/** Chez quel portail tourne la page, ou null sur notre site et dans le fichier seul. */
export const PORTAIL: Portail | null = declare === 'crazygames' || declare === 'itch' ? declare : null;

/** Dans le cadre d'un portail, quel qu'il soit. */
export const SUR_PORTAIL: boolean = PORTAIL !== null;

/** Chez CrazyGames, et sous ses règles : ni compte, ni lien vers le site, ni gros mot. */
export const CHEZ_CRAZYGAMES: boolean = PORTAIL === 'crazygames';

/**
 * Chez un portail, l'adresse ne dit rien de la langue : on suit le navigateur,
 * et l'anglais sert tous ceux qui ne lisent pas le français.
 */
export const langueDuNavigateur = (langue: string | undefined): 'fr' | 'en' =>
  (/^fr\b/i.test(langue ?? '') ? 'fr' : 'en');
