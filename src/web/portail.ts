/**
 * Le jeu logé chez un portail de jeux (CrazyGames et ses pareils).
 *
 * Un portail affiche le jeu dans son propre cadre, à sa propre adresse, et pose
 * ses conditions : pas de compte maison, pas de lien qui ramène les joueurs
 * ailleurs, l'anglais par défaut. La page du portail (voir scripts/build.mjs)
 * se signale par une variable posée avant le script ; tout le reste du code se
 * règle dessus.
 */
export const SUR_PORTAIL: boolean = typeof window !== 'undefined'
  && (window as { LARBIN_PORTAIL?: boolean }).LARBIN_PORTAIL === true;

/**
 * Chez un portail, l'adresse ne dit rien de la langue : on suit le navigateur,
 * et l'anglais sert tous ceux qui ne lisent pas le français.
 */
export const langueDuNavigateur = (langue: string | undefined): 'fr' | 'en' =>
  (/^fr\b/i.test(langue ?? '') ? 'fr' : 'en');
