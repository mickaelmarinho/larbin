// La page du jeu pour un portail de jeux.
//
// Un portail héberge le jeu chez lui, dans un cadre : il lui faut un dossier
// autonome, sans adresse à nous, et en anglais par défaut. On part du fichier
// unique — déjà autonome et muet — et on y pose la marque que le script
// reconnaît (voir src/web/portail.ts). Comme pour la page anglaise, un morceau
// introuvable arrête l'assemblage.
//
// Deux portails, deux pages : CrazyGames impose sa bibliothèque et interdit
// comptes et liens vers le site (la classe « portail » les masque) ; itch.io
// n'impose rien, et le jeu y reste entier.

const PRESENTATION = `<main id="presentation">
  <h1>Le Larbin — the President card game, but faster</h1>
  <p>Loading…</p>
</main>`;

/** Ce que chaque portail ajoute à la page : la classe du corps, et ce qui précède le script du jeu. */
const PORTAILS = {
  crazygames: {
    classe: 'portail',
    // Sa bibliothèque d'abord : le jeu la trouve prête, ou s'en passe.
    avant: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n',
  },
  itch: { classe: 'itch', avant: '' },
};

/** [ce qu'on cherche dans le fichier unique, ce qu'on met à la place] */
const remplacements = (portail) => [
  ['<html lang="fr">', '<html lang="en">'],
  [/<title>[^<]*<\/title>/, '<title>Le Larbin — the President card game, but faster</title>'],
  [/<meta name="description"[^>]*>/,
    '<meta name="description" content="The President card game, but faster: a trick goes around the table only once. Against bots, with friends or with other players.">'],
  [/<main id="presentation">[\s\S]*?<\/main>/, PRESENTATION],
  ['<body>', `<body class="${PORTAILS[portail].classe}">`],
  ['<script>/*SCRIPT*/', `${PORTAILS[portail].avant}<script>window.LARBIN_PORTAIL = '${portail}';</script>\n<script>/*SCRIPT*/`],
];

/** `gabarit` : le fichier unique avant l'insertion du script (qui ne doit pas être fouillé). */
export function pagePortail(gabarit, portail = 'crazygames') {
  if (!PORTAILS[portail]) throw new Error(`page du portail : portail inconnu — ${portail}`);
  let resultat = gabarit;
  for (const [avant, apres] of remplacements(portail)) {
    const suivant = resultat.replace(avant, () => apres);
    if (suivant === resultat) throw new Error(`page du portail : introuvable dans le gabarit — ${avant}`);
    resultat = suivant;
  }
  return resultat;
}
