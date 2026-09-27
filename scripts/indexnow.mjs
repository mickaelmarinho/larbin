// Prévenir Bing (et les autres moteurs du protocole IndexNow) que les pages
// du site ont changé : ils viennent les relire sans attendre leur tournée.
//
// La clé est un fichier à la racine du site (src/web/statique/<clé>.txt) : il
// prouve que c'est bien le propriétaire du site qui parle. Elle n'a rien de
// secret — tout le monde peut la lire.
//
// Appelé à la fin de chaque assemblage de production sur Vercel, et à la main :
//   node scripts/indexnow.mjs
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOTE = 'larbin.vercel.app';
/** Les pages qui méritent d'être trouvées ; la confidentialité est en noindex. */
const PAGES = ['/', '/regles', '/strategie', '/variantes'];
const STATIQUE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'web', 'statique');

async function cle() {
  const fichier = (await readdir(STATIQUE)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!fichier) throw new Error('aucune clé IndexNow dans src/web/statique');
  return (await readFile(path.join(STATIQUE, fichier), 'utf8')).trim();
}

/** Renvoie le statut HTTP de la réponse ; 200 et 202 veulent dire « reçu ». */
export async function prevenirIndexNow() {
  const k = await cle();
  const reponse = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOTE,
      key: k,
      keyLocation: `https://${HOTE}/${k}.txt`,
      urlList: PAGES.map((p) => `https://${HOTE}${p}`),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return reponse.status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const statut = await prevenirIndexNow();
  console.log(`IndexNow : ${statut}${statut === 200 || statut === 202 ? ' — reçu' : ''}`);
  process.exit(statut === 200 || statut === 202 ? 0 : 1);
}
