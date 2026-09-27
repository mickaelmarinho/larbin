/**
 * Assemble Larbin.html : un fichier unique, sans dépendance, qui s'ouvre d'un
 * double-clic et se transmet aussi facilement qu'une photo.
 *
 *   node scripts/build.mjs [--watch]
 */
import { build, context } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { manifesteAnglais, pageAnglaise } from './page-anglaise.mjs';
import path from 'node:path';

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = (p) => path.join(racine, 'src', 'web', p);
const sortie = path.join(racine, 'Larbin.html');
const publie = path.join(racine, 'public');

/**
 * Le fichier unique et le site ne veulent pas le même en-tête : l'un se promène
 * hors ligne et doit rester muet, l'autre a une adresse, une image de partage et
 * une mesure d'audience. Un seul gabarit, deux découpes.
 */
const horsLigne = (page) => page
  .replace(/<!--EN-LIGNE[\s\S]*?EN-LIGNE-->\n?/, '')
  .replace(/\n{3,}/g, '\n\n');
const enLigne = (page) => page.replace('<!--EN-LIGNE', '').replace('EN-LIGNE-->', '');

const optionsEsbuild = {
  entryPoints: [src('app.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'none',
};

async function assembler() {
  const [gabarit, style, regles, confidentialite, strategie, variantes, travailleur, paquet] = await Promise.all([
    readFile(src('index.html'), 'utf8'),
    readFile(src('style.css'), 'utf8'),
    readFile(src('regles.html'), 'utf8'),
    readFile(src('confidentialite.html'), 'utf8'),
    readFile(src('strategie.html'), 'utf8'),
    readFile(src('variantes.html'), 'utf8'),
    readFile(src('sw.js'), 'utf8'),
    build(optionsEsbuild).then((r) => r.outputFiles[0].text),
  ]);

  // Les pages d'articles (stratégie, variantes) portent la mise en page de celle
  // des règles : une seule feuille de style à tenir, pas trois.
  const styleArticle = regles.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (!styleArticle) throw new Error('regles.html : pas de <style> à partager');
  const article = (html) => html.replace('/*STYLE-ARTICLE*/', () => styleArticle.trim());

  // On insère via une fonction de remplacement : sinon $& et compagnie dans le
  // code minifié seraient interprétés comme des motifs.
  const page = gabarit
    .replace('/*STYLE*/', () => style.trim())
    .replace('/*SCRIPT*/', () => paquet.trim());

  const seul = horsLigne(page);
  await writeFile(sortie, seul, 'utf8');

  // Le dossier publié : la page du jeu, celle des règles, et les fichiers que
  // navigateurs et moteurs de recherche viennent chercher à la racine. Le reste
  // du dépôt n'a rien à faire en ligne.
  await mkdir(publie, { recursive: true });
  await writeFile(path.join(publie, 'index.html'), enLigne(page), 'utf8');
  // La même page en anglais, sous /en : le script y lit sa langue dans l'adresse.
  await mkdir(path.join(publie, 'en'), { recursive: true });
  await writeFile(path.join(publie, 'en', 'index.html'), pageAnglaise(enLigne(page)), 'utf8');
  await writeFile(path.join(publie, 'en', 'manifest.webmanifest'),
    manifesteAnglais(await readFile(src('statique/manifest.webmanifest'), 'utf8')), 'utf8');
  await writeFile(path.join(publie, 'regles.html'), regles, 'utf8');
  await writeFile(path.join(publie, 'confidentialite.html'), confidentialite, 'utf8');
  await writeFile(path.join(publie, 'strategie.html'), article(strategie), 'utf8');
  await writeFile(path.join(publie, 'variantes.html'), article(variantes), 'utf8');
  // Les pages anglaises : même mise en page que les françaises.
  for (const nom of ['rules', 'strategy', 'variants', 'privacy']) {
    await writeFile(path.join(publie, 'en', `${nom}.html`), article(await readFile(src(`en/${nom}.html`), 'utf8')), 'utf8');
  }
  // Le service worker porte l'empreinte de la page : une nouvelle version du jeu
  // en fait un nouveau, qui efface les copies de l'ancienne.
  const empreinte = createHash('sha256').update(enLigne(page)).digest('hex').slice(0, 12);
  await writeFile(path.join(publie, 'sw.js'), travailleur.replace('__VERSION__', empreinte), 'utf8');
  await cp(src('statique'), publie, { recursive: true });

  const ko = (Buffer.byteLength(seul) / 1024).toFixed(0);
  console.log(`Larbin.html assemblé — ${ko} Ko, et public/ prêt pour l'hébergement`);
}

if (process.argv.includes('--watch')) {
  const ctx = await context({ ...optionsEsbuild, plugins: [{
    name: 'reassembler',
    setup(b) { b.onEnd(() => assembler()); },
  }] });
  await ctx.watch();
  console.log('Surveillance active. Ctrl+C pour arrêter.');
} else {
  await assembler();
  // Sur Vercel, en production seulement : on prévient les moteurs que les pages
  // ont changé. Un échec ne doit jamais empêcher la mise en ligne.
  if (process.env.VERCEL_ENV === 'production') {
    try {
      const { prevenirIndexNow } = await import('./indexnow.mjs');
      console.log(`IndexNow prévenu : ${await prevenirIndexNow()}`);
    } catch (err) {
      console.log(`IndexNow injoignable, tant pis : ${err instanceof Error ? err.message : err}`);
    }
  }
}
