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
} as const;

export type Icone = keyof typeof TRAITS;

/** Le pictogramme, prêt à glisser dans un bouton. */
export const icone = (nom: Icone): string =>
  `<svg class="icone" viewBox="0 0 24 24" aria-hidden="true">${TRAITS[nom]}</svg>`;
