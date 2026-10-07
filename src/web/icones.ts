/**
 * Les pictogrammes de la table, dessinés au trait.
 *
 * Des émojis feraient l'affaire, mais chaque appareil les dessine à sa façon —
 * une cloche jaune ici, grise là — et la barre d'outils n'aurait d'unité nulle
 * part. Ceux-ci prennent la couleur du texte et restent nets à toutes les
 * tailles.
 */
const TRAITS = {
  cloche: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  'cloche-coupee': '<path d="M6 16.5V11a6 6 0 0 1 9.5-4.9M18 11v5.5l1.5 2H8.5"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'
    + '<path d="M4 4l16 16"/>',
  musique: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  tapis: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M12 5v14"/><path d="M4 12h8" opacity=".55"/>',
  oeil: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  recommencer: '<path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5"/><path d="M19.5 4v4.5H15"/>',
  maison: '<path d="M4 11.5 12 4.5l8 7"/><path d="M6.5 10.5v9h11v-9"/><path d="M10.5 19.5v-5h3v5"/>',
  // L'accueil et ses rubriques.
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.9-1.1 1.3-2.1-.7-1.2 0-2.4 1.4-2.4h2.3a3.5 3.5 0 0 0 3.5-3.5C20.5 7.5 16.7 3.5 12 3.5z"/>'
    + '<circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/>',
  cle: '<circle cx="8" cy="14.5" r="4"/><path d="M11 11.5 19.5 3M16.5 6l2.5 2.5M14 8.5l2 2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
  amis: '<circle cx="9" cy="8.5" r="3"/><path d="M3 19c.5-3.5 2.8-5.5 6-5.5s5.5 2 6 5.5"/>'
    + '<path d="M15.5 5.7a3 3 0 0 1 0 5.6M17.5 13.8c1.9.7 3.1 2.5 3.5 5.2"/>',
  robot: '<rect x="5" y="8.5" width="14" height="10.5" rx="3"/><path d="M12 8.5V5"/><circle cx="12" cy="4" r="1"/>'
    + '<circle cx="9.3" cy="13" r="1.2"/><circle cx="14.7" cy="13" r="1.2"/><path d="M9.5 16.5h5M3 12.5v3M21 12.5v3"/>',
  calendrier: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'
    + '<path d="M9 14.8l2.2 2.2 4-4.3"/>',
  'porte-voix': '<path d="M4 10v4l3 .5 9 4.5V5L7 9.5z"/><path d="M8 14.5l1.2 4.5h2.3l-1-3.8M19 9.5c1 1.5 1 3.5 0 5"/>',
  trophee: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5c0 3 1.2 4.5 3.3 4.8M16 5.5h3c0 3-1.2 4.5-3.3 4.8"/>'
    + '<path d="M12 13v3.5M8.5 20h7M9.5 20c0-2 1-3.5 2.5-3.5s2.5 1.5 2.5 3.5"/>',
  medaille: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11.2 5.5 3.5h4l2.5 5 2.5-5h4l-3 7.7"/><path d="M12 13v4M10.8 14h1.2"/>',
  parcours: '<path d="M4 20V10M9.3 20V4M14.7 20v-7M20 20V8"/>',
  livre: '<path d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5V20"/>',
  parchemin: '<path d="M7 4h10.5a2 2 0 0 1 2 2v1.5H16"/><path d="M16 6v12a2 2 0 0 1-2 2H5.5a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H7"/>'
    + '<path d="M10 9h3.5M10 12.5h3.5M10 16h2"/>',
} as const;

export type Icone = keyof typeof TRAITS;

/** Le pictogramme, prêt à glisser dans un bouton. */
export const icone = (nom: Icone): string =>
  `<svg class="picto" viewBox="0 0 24 24" aria-hidden="true">${TRAITS[nom]}</svg>`;
