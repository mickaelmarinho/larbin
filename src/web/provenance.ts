/**
 * D'où vient un visiteur, et en est-ce un ?
 *
 * Deux questions pour que les compteurs disent vrai. Les robots des moteurs de
 * recherche exécutent le jeu pour l'indexer : sans ce filtre, ils se comptaient
 * comme des visiteurs. Et savoir qu'une visite vient d'un moteur ou d'un lien
 * partagé dit lequel des deux fait venir du monde — sans jamais garder
 * l'adresse d'origine elle-même, seulement sa catégorie.
 */

export type Provenance = 'recherche' | 'partage' | 'autre';

const MOTEURS = /(^|\.)(google|bing|duckduckgo|qwant|ecosia|yahoo|yandex|search\.brave|startpage|lilo)\./i;

export function provenance(referent: string, params: URLSearchParams): Provenance {
  // Nos liens partagés portent une marque : ?defi, ?salon, ou ?via=partage.
  if (params.has('defi') || params.has('salon') || params.get('via') === 'partage') return 'partage';
  try {
    if (referent && MOTEURS.test(new URL(referent).hostname)) return 'recherche';
  } catch { /* un référent illisible ne dit rien */ }
  return 'autre';
}

const ROBOTS = /bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|whatsapp|preview|inspect/i;

/** Un robot, un navigateur piloté, ou un aperçu de lien : rien à compter. */
export const estUnRobot = (ua: string, pilote = false): boolean => pilote || ROBOTS.test(ua);
