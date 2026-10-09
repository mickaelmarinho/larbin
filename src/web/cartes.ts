/**
 * Le dessin d'une carte, sous son index.
 *
 * L'index — la hauteur et la couleur, en haut à gauche — suffit à jouer : c'est
 * lui qu'on lit dans un éventail serré. Le reste de la carte est là pour
 * qu'elle ressemble à une carte : les points disposés comme sur un vrai jeu,
 * une figure pour le Valet, la Dame et le Roi, un as qui prend ses aises, et
 * pour le 2 — la plus forte carte de ce jeu-ci — la couronne de l'emblème.
 *
 * Tout est tracé en SVG ou posé en caractères : aucune image à charger, et le
 * dessin reste net à toutes les tailles.
 */
import type { Rank, Suit } from '../engine/types.ts';

/** Où tombent les points d'une carte : [colonne, hauteur], en pourcentage du cadre. */
type Point = [x: number, y: number];

const G = 16;
const C = 50;
const D = 84;
const paires = (...ys: number[]): Point[] => ys.flatMap((y) => [[G, y], [D, y]] as Point[]);

export const POINTS: Partial<Record<Rank, Point[]>> = {
  3: [[C, 0], [C, 50], [C, 100]],
  4: paires(0, 100),
  5: [...paires(0, 100), [C, 50]],
  6: paires(0, 50, 100),
  7: [...paires(0, 50, 100), [C, 25]],
  8: [...paires(0, 50, 100), [C, 25], [C, 75]],
  9: [...paires(0, 33.3, 66.7, 100), [C, 50]],
  10: [...paires(0, 33.3, 66.7, 100), [C, 16.7], [C, 83.3]],
};

/** Ce que portent les trois figures : c'est leur coiffe qui les distingue. */
const COIFFES: Record<11 | 12 | 13, string> = {
  // Le Valet : un béret, et sa plume.
  11: '<path class="or" d="M10 18c0-8 8-10 20-5l-1 5z"/>'
    + '<path d="M26.5 12.5C32 7 34.5 4.5 36 2c-2 4.5-3.5 8-7.5 12z"/>',
  // La Dame : un diadème et ses trois perles.
  12: '<path class="or" d="M10.5 17.5c0-9 19-9 19 0z"/>'
    + '<circle class="or" cx="13.5" cy="9.5" r="1.7"/><circle class="or" cx="20" cy="7" r="1.9"/>'
    + '<circle class="or" cx="26.5" cy="9.5" r="1.7"/>',
  // Le Roi : la couronne à trois pointes.
  13: '<path class="or" d="M10.5 17.5V7.5l4.7 4L20 4l4.8 7.5 4.7-4v10z"/>',
};

function figure(rang: 11 | 12 | 13, couleur: Suit): string {
  return '<span class="figure"><svg viewBox="0 0 40 60" aria-hidden="true">'
    + '<rect class="cadre" x="1.5" y="1.5" width="37" height="57" rx="4"/>'
    + '<circle cx="20" cy="26" r="7.2"/>'
    + '<path d="M5.5 55c0-12 5.5-17 14.5-17s14.5 5 14.5 17z"/>'
    + '<path class="or" d="M13.5 39.5l6.5 5 6.5-5-1.5-2h-10z"/>'
    + COIFFES[rang]
    + `<text class="blason" x="20" y="54" text-anchor="middle">${couleur}</text>`
    + '</svg></span>';
}

/** La couronne de l'emblème du jeu, posée sur le 2. */
const COURONNE = '<svg class="couronne" viewBox="0 0 28 16" aria-hidden="true">'
  + '<path d="M0 16V5l7.5 6L14 1l6.5 10L28 5v11z"/></svg>';

/** Le dessin d'une carte, à glisser sous son index. */
export function dessinDeCarte(rang: Rank, couleur: Suit): string {
  const points = POINTS[rang];
  if (points) {
    return `<span class="points">${points.map(([x, y]) =>
      `<i${y > 50 ? ' class="bas"' : ''} style="left:${x}%;top:${y}%">${couleur}</i>`).join('')}</span>`;
  }
  if (rang === 11 || rang === 12 || rang === 13) return figure(rang, couleur);
  if (rang === 15) return `<span class="centre deux">${COURONNE}${couleur}</span>`;
  return `<span class="centre as">${couleur}</span>`;
}
