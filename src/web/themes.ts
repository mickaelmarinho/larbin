/**
 * Les habillages de la table.
 *
 * Un thème n'est qu'une liste de valeurs CSS : le tapis, le dos des cartes, la
 * couleur des boutons. Rien de tout cela ne touche aux règles ni à ce qu'un
 * joueur voit du jeu — c'est la condition pour qu'on puisse en ajouter d'autres
 * un jour, gratuits ou non, sans déséquilibrer quoi que ce soit.
 */
export interface Theme {
  cle: string;
  nom: string;
  /** Ce qui change, variable par variable. */
  couleurs: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    cle: 'feutre',
    nom: 'Feutre',
    couleurs: {
      '--fond-haut': '#1a5a46',
      '--feutre': '#0d3b2e',
      '--fond-bas': '#06231a',
      '--panneau-haut': '#14503f',
      '--panneau-bas': '#0c3527',
      '--voile': '#04140fdd',
      '--laiton': '#d9a441',
      '--laiton-sombre': '#a97b26',
      '--texte-pale': '#b4c0b8',
      '--dos': 'repeating-linear-gradient(45deg, #8d2f2a 0 4px, #7a2723 4px 8px)',
    },
  },
  {
    cle: 'bordeaux',
    nom: 'Bordeaux',
    couleurs: {
      '--fond-haut': '#6b2230',
      '--feutre': '#4a1622',
      '--fond-bas': '#260a12',
      '--panneau-haut': '#59202c',
      '--panneau-bas': '#3a1119',
      '--voile': '#1a060cdd',
      '--laiton': '#e0b862',
      '--laiton-sombre': '#b08a30',
      '--texte-pale': '#cdb6b9',
      '--dos': 'repeating-linear-gradient(45deg, #1f4a3a 0 4px, #1a4032 4px 8px)',
    },
  },
  {
    cle: 'ardoise',
    nom: 'Ardoise',
    couleurs: {
      '--fond-haut': '#3d4f53',
      '--feutre': '#232f33',
      '--fond-bas': '#10181b',
      '--panneau-haut': '#2b393d',
      '--panneau-bas': '#1a2427',
      '--voile': '#0b1113dd',
      '--laiton': '#d08c5a',
      '--laiton-sombre': '#a3663a',
      '--texte-pale': '#b3bec1',
      '--dos': 'repeating-linear-gradient(45deg, #50646a 0 4px, #43555a 4px 8px)',
    },
  },
];

const CLE_STOCKAGE = 'larbin.theme';

export function themeCourant(): Theme {
  let choisi: string | null = null;
  try {
    choisi = localStorage.getItem(CLE_STOCKAGE);
  } catch {
    // Stockage indisponible : on jouera avec le tapis par défaut.
  }
  return THEMES.find((t) => t.cle === choisi) ?? THEMES[0];
}

export function appliquerTheme(theme: Theme): void {
  for (const [variable, valeur] of Object.entries(theme.couleurs)) {
    document.documentElement.style.setProperty(variable, valeur);
  }
  try {
    localStorage.setItem(CLE_STOCKAGE, theme.cle);
  } catch {
    // Le tapis reprendra sa couleur par défaut au prochain lancement, tant pis.
  }
}
