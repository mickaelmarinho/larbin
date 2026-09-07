/**
 * Serveur statique minimal, sans dépendance.
 *
 *   node scripts/serveur.mjs
 *
 * Sert Larbin.html sur http://localhost:5177 — et sur l'adresse du réseau local
 * affichée au démarrage, ce qui permet d'ouvrir le jeu depuis le téléphone tant
 * qu'on est sur le même wifi.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 5177;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const serveur = http.createServer(async (req, res) => {
  const demande = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const relatif = demande === '/' ? 'Larbin.html' : demande.replace(/^\/+/, '');
  const fichier = path.join(racine, relatif);

  // On ne sort pas du dossier du projet.
  if (!fichier.startsWith(racine)) {
    res.writeHead(403).end('Interdit');
    return;
  }

  try {
    const contenu = await readFile(fichier);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(fichier)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(contenu);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
});

function adresseLocale() {
  for (const cartes of Object.values(networkInterfaces())) {
    for (const carte of cartes ?? []) {
      if (carte.family === 'IPv4' && !carte.internal) return carte.address;
    }
  }
  return null;
}

serveur.listen(PORT, () => {
  const ip = adresseLocale();
  console.log(`Le Larbin est servi sur http://localhost:${PORT}`);
  if (ip) console.log(`Depuis le téléphone (même wifi) : http://${ip}:${PORT}`);
});
