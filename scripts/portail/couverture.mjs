// La couverture du jeu pour les portails : l'emblème, le titre, et un éventail
// des vraies cartes du jeu — le même dessin qu'à la table (src/web/cartes.ts).
//
//   node scripts/portail/couverture.mjs          # écrit portail/couverture.html
//
// La page se capture ensuite dans Chrome sans écran, à trois formats :
//   ?f=large (1920×1080), ?f=haut (800×1200), ?f=carre (800×800).
// Les portails n'acceptent aucun texte que le titre, et rien d'important dans
// le coin haut gauche, que leurs étiquettes recouvrent.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cartes = (await build({
  entryPoints: [path.join(racine, 'src/web/cartes.ts')], bundle: true, format: 'iife', globalName: 'Cartes', write: false,
})).outputFiles[0].text;
const style = await readFile(path.join(racine, 'src/web/style.css'), 'utf8');

const page = `<!doctype html>
<html><head><meta charset="utf-8">
<style>${style}</style>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body { --u: 1vmin; display: flex; align-items: center; justify-content: center; }
  .scene { display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 7); }
  body.haut .scene, body.carre .scene { flex-direction: column; gap: calc(var(--u) * 5); }
  .titre { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .blason { width: calc(var(--u) * 20); height: calc(var(--u) * 20); filter: drop-shadow(0 1vmin 2vmin #0008); }
  h1 { margin: calc(var(--u) * 1) 0 0; font-size: calc(var(--u) * 12.5); font-weight: 800; letter-spacing: -.01em;
       color: #f4efe1; text-shadow: 0 .6vmin 1.6vmin #000a; white-space: nowrap; }
  .eventail-affiche { position: relative; --carte-l: calc(var(--u) * 27); --carte-h: calc(var(--carte-l) * 1.42);
       --rayon: calc(var(--carte-l) * 0.1); width: calc(var(--carte-l) * 3.1); height: calc(var(--carte-l) * 1.75); }
  .eventail-affiche .carte { position: absolute; left: calc(50% - var(--carte-l) / 2); bottom: 0; transform-origin: 50% 120%;
       box-shadow: 0 1.2vmin 3vmin #000a, inset 0 0 0 .25vmin #0001; border: none; }
  .eventail-affiche .carte .coin { top: 4%; left: 7%; }
  .eventail-affiche .carte:nth-child(1) { transform: rotate(-27deg); }
  .eventail-affiche .carte:nth-child(2) { transform: rotate(-9deg); }
  .eventail-affiche .carte:nth-child(3) { transform: rotate(9deg); }
  .eventail-affiche .carte:nth-child(4) { transform: rotate(27deg); }
  body.haut { --u: 1.25vmin; }
  body.haut .scene { padding-top: calc(var(--u) * 6); }
  body.haut .eventail-affiche { --carte-l: calc(var(--u) * 25); margin-top: calc(var(--u) * 4); }
  body.carre .scene { padding-top: calc(var(--u) * 14); gap: calc(var(--u) * 3); }
  body.carre .blason { width: calc(var(--u) * 14); height: calc(var(--u) * 14); }
  body.carre h1 { font-size: calc(var(--u) * 13); }
  body.carre .eventail-affiche { --carte-l: calc(var(--u) * 21); margin-top: calc(var(--u) * 2); }
</style></head>
<body>
<div class="scene">
  <div class="titre">
    <svg class="blason" viewBox="0 0 64 64"><path d="M18 24V13l7.5 6L32 9l6.5 10L46 13v11z" fill="#d9a441"/><path d="M32 54C12 41 14 27 24 27c4.2 0 7 3.2 8 5.4 1-2.2 3.8-5.4 8-5.4 10 0 12 14-8 27z" fill="#c0392b"/></svg>
    <h1>Le Larbin</h1>
  </div>
  <div class="eventail-affiche" id="eventail"></div>
</div>
<script>${cartes}</script>
<script>
  document.body.className = new URLSearchParams(location.search).get('f') || 'large';
  const carte = (nom, rang, couleur) => '<span class="carte' + (couleur === '♥' || couleur === '♦' ? ' rouge' : '') + '">'
    + '<span class="coin">' + nom + '<i>' + couleur + '</i></span>' + Cartes.dessinDeCarte(rang, couleur) + '</span>';
  document.getElementById('eventail').innerHTML = carte('9', 9, '♣') + carte('J', 11, '♦') + carte('Q', 12, '♥') + carte('2', 15, '♠');
</script>
</body></html>
`;
await mkdir(path.join(racine, 'portail'), { recursive: true });
await writeFile(path.join(racine, 'portail', 'couverture.html'), page, 'utf8');
console.log('portail/couverture.html écrit');
