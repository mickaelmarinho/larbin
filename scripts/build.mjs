/**
 * Assemble Larbin.html : un fichier unique, sans dépendance, qui s'ouvre d'un
 * double-clic et se transmet aussi facilement qu'une photo.
 *
 *   node scripts/build.mjs [--watch]
 */
import { build, context } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = (p) => path.join(racine, 'src', 'web', p);
const sortie = path.join(racine, 'Larbin.html');

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
  const [gabarit, style, paquet] = await Promise.all([
    readFile(src('index.html'), 'utf8'),
    readFile(src('style.css'), 'utf8'),
    build(optionsEsbuild).then((r) => r.outputFiles[0].text),
  ]);

  // On insère via une fonction de remplacement : sinon $& et compagnie dans le
  // code minifié seraient interprétés comme des motifs.
  const page = gabarit
    .replace('/*STYLE*/', () => style.trim())
    .replace('/*SCRIPT*/', () => paquet.trim());

  await writeFile(sortie, page, 'utf8');
  const ko = (Buffer.byteLength(page) / 1024).toFixed(0);
  console.log(`Larbin.html assemblé — ${ko} Ko`);
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
