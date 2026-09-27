// La page d'accueil en anglais, tirée de la française.
//
// Le jeu est le même script dans les deux langues : il lit la sienne dans
// l'adresse (/en). Mais ce que lisent les moteurs de recherche et les aperçus
// de lien — le titre, la description, le texte de présentation — doit être
// écrit en anglais dans la page elle-même. On le remplace ici, morceau par
// morceau ; si un morceau attendu manque, l'assemblage s'arrête plutôt que de
// publier une page à moitié française.

const PRESENTATION_EN = `<main id="presentation">
  <h1>Le Larbin — the President card game online, but faster</h1>
  <p>The President card game — also known as Scum, Asshole or Daifugō — free to play online:
     against bots, with friends or with other players, each on their own phone or PC.</p>
  <ul>
    <li><strong>One trip around the table</strong> per trick: everyone speaks only once.</li>
    <li><strong>The 2 cuts</strong>: higher than the ace, it ends the trick as soon as it lands.</li>
    <li><strong>Finishing on a 2</strong> makes you the Lackey by default.</li>
  </ul>
  <p>A daily challenge: the same deal for everyone, and a leaderboard of the day.</p>
  <p><a href="/en/rules">The full rules of President and its Larbin variant</a> ·
     <a href="/en/strategy">How to win at President</a> ·
     <a href="/en/variants">President variants and house rules</a></p>
</main>`;

/** [texte français, texte anglais] : chaque paire doit être trouvée, une fois. */
const REMPLACEMENTS = [
  ['<html lang="fr">', '<html lang="en">'],
  ['<title>Le Larbin — le Président (Trou du cul) en ligne, gratuit</title>',
    '<title>Le Larbin — play President (Scum) card game online, free</title>'],
  [/<meta name="description" content="[^"]*">/,
    '<meta name="description" content="Play the President card game (Scum, Asshole) online for free: against bots, with friends or other players, on phone or PC. A trick goes around only once.">'],
  ['<link rel="canonical" href="https://larbin.vercel.app/">', '<link rel="canonical" href="https://larbin.vercel.app/en">'],
  ['<link rel="manifest" href="/manifest.webmanifest">', '<link rel="manifest" href="/en/manifest.webmanifest">'],
  ['<meta property="og:locale" content="fr_FR">', '<meta property="og:locale" content="en_GB">'],
  [/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Le Larbin — the President card game online, but faster">'],
  [/<meta property="og:description" content="[^"]*">/,
    '<meta property="og:description" content="The President card game (Scum, Asshole) online and free: against bots, with friends or other players, on phone or PC. A trick goes around the table only once.">'],
  ['<meta property="og:url" content="https://larbin.vercel.app/">', '<meta property="og:url" content="https://larbin.vercel.app/en">'],
  [/<meta property="og:image:alt" content="[^"]*">/, '<meta property="og:image:alt" content="Le Larbin, the President card game online">'],
  ['"alternateName": ["Président en ligne", "Trou du cul en ligne"]', '"alternateName": ["President card game online", "Scum card game online"]'],
  [/"description": "Le jeu de cartes du Président[^"]*"/,
    '"description": "The President card game, also known as Scum or Asshole, online and free: against bots, with friends or other players, on phone or PC."'],
  ['"url": "https://larbin.vercel.app/",', '"url": "https://larbin.vercel.app/en",'],
  ['"inLanguage": "fr"', '"inLanguage": "en"'],
  ['"genre": "Jeu de cartes"', '"genre": "Card game"'],
  ['"gamePlatform": ["Navigateur web", "Téléphone", "PC"]', '"gamePlatform": ["Web browser", "Phone", "PC"]'],
  ['"operatingSystem": "Tout navigateur récent"', '"operatingSystem": "Any modern browser"'],
  [/<main id="presentation">[\s\S]*?<\/main>/, PRESENTATION_EN],
];

export function pageAnglaise(page) {
  let resultat = page;
  for (const [avant, apres] of REMPLACEMENTS) {
    const suivant = resultat.replace(avant, () => apres);
    if (suivant === resultat) throw new Error(`page anglaise : introuvable dans la page française — ${avant}`);
    resultat = suivant;
  }
  return resultat;
}

/** Le manifeste de l'appli installée depuis la page anglaise : elle s'ouvre en anglais. */
export function manifesteAnglais(manifeste) {
  const m = JSON.parse(manifeste);
  return JSON.stringify({
    ...m,
    description: 'The President card game (Scum), but faster — online and free, on phone or PC.',
    lang: 'en',
    start_url: '/en',
  }, null, 2);
}
