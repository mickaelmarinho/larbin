/**
 * Assemble Larbin.html : un fichier unique, sans dépendance, qui s'ouvre d'un
 * double-clic et se transmet aussi facilement qu'une photo.
 *
 *   node scripts/build.mjs [--watch]
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
  const [gabarit, style, regles, paquet] = await Promise.all([
    readFile(src('index.html'), 'utf8'),
    readFile(src('style.css'), 'utf8'),
    readFile(src('regles.html'), 'utf8'),
    build(optionsEsbuild).then((r) => r.outputFiles[0].text),
  ]);

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
  await writeFile(path.join(publie, 'regles.html'), regles, 'utf8');
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
}
