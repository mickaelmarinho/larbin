// La page du jeu pour un portail de jeux (CrazyGames et ses pareils).
//
// Un portail héberge le jeu chez lui, dans un cadre : il lui faut un dossier
// autonome, sans adresse à nous, sans lien qui ramène ses joueurs ailleurs, et
// en anglais par défaut. On part du fichier unique — déjà autonome et muet — et
// on y pose la marque que le script reconnaît (voir src/web/portail.ts). Comme
// pour la page anglaise, un morceau introuvable arrête l'assemblage.

const PRESENTATION = `<main id="presentation">
  <h1>Le Larbin — the President card game, but faster</h1>
  <p>Loading…</p>
</main>`;

/** [ce qu'on cherche dans le fichier unique, ce qu'on met à la place] */
const REMPLACEMENTS = [
  ['<html lang="fr">', '<html lang="en">'],
  [/<title>[^<]*<\/title>/, '<title>Le Larbin — the President card game, but faster</title>'],
  [/<meta name="description"[^>]*>/,
    '<meta name="description" content="The President card game, but faster: a trick goes around the table only once. Against bots, with friends or with other players.">'],
  [/<main id="presentation">[\s\S]*?<\/main>/, PRESENTATION],
  ['<body>', '<body class="portail">'],
  ['<script>/*SCRIPT*/', '<script>window.LARBIN_PORTAIL = true;</script>\n<script>/*SCRIPT*/'],
];

/** `gabarit` : le fichier unique avant l'insertion du script (qui ne doit pas être fouillé). */
export function pagePortail(gabarit) {
  let resultat = gabarit;
  for (const [avant, apres] of REMPLACEMENTS) {
    const suivant = resultat.replace(avant, () => apres);
    if (suivant === resultat) throw new Error(`page du portail : introuvable dans le gabarit — ${avant}`);
    resultat = suivant;
  }
  return resultat;
}
