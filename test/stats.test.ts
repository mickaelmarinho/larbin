import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { repondreApi } from '../src/reseau/api.ts';
import { DepotMemoire, jourDeParis } from '../src/reseau/depot.ts';

async function serveurDeTest(depot: DepotMemoire) {
  const serveur = http.createServer(async (req, res) => {
    if (!(await repondreApi(req, res, depot))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r));
  const { port } = serveur.address() as AddressInfo;
  const adresse = `http://127.0.0.1:${port}`;
  return {
    envoyer: (chemin: string, corps: unknown) => fetch(`${adresse}${chemin}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(corps),
    }),
    lire: (chemin: string) => fetch(`${adresse}${chemin}`),
    fermer: () => new Promise<void>((r) => serveur.close(() => r())),
  };
}

test('les compteurs : le navigateur ne compte que ce qui le regarde, le serveur le reste', async () => {
  process.env.STATS_CLE = 'une-cle-de-test';
  const depot = new DepotMemoire();
  const s = await serveurDeTest(depot);

  assert.equal((await s.envoyer('/stats', { evenement: 'solo-finie' })).status, 204);
  assert.equal((await s.envoyer('/stats', { evenement: 'solo-finie' })).status, 204);
  assert.equal((await s.envoyer('/stats', { evenement: 'compte-cree' })).status, 400);
  assert.equal((await s.envoyer('/stats', { evenement: 'n-importe-quoi' })).status, 400);
  assert.equal((await s.envoyer('/compte/creer', { pseudo: 'Compteur' })).status, 201);

  const n = async (evenement: string) =>
    (await depot.compteurs(jourDeParis())).find((l) => l.evenement === evenement)?.n ?? 0;
  assert.equal(await n('solo-finie'), 2);
  assert.equal(await n('compte-cree'), 1);

  // La page de lecture ne s'ouvre qu'avec la clé.
  assert.equal((await s.lire('/stats')).status, 404);
  assert.equal((await s.lire('/stats?cle=mauvaise')).status, 404);
  const page = await s.lire('/stats?cle=une-cle-de-test');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Solo finies/);
  assert.match(html, /noindex/);

  await s.fermer();
});

test('un pseudo grossier est refusé à la création du compte', async () => {
  const s = await serveurDeTest(new DepotMemoire());
  const r = await s.envoyer('/compte/creer', { pseudo: 'Connard' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erreur, /pas accepté/);
  await s.fermer();
});

test('le jour des compteurs est celui de Paris', () => {
  // 23 h 30 à Paris le 17 septembre, c'est déjà le 17 à Paris mais 21 h 30 UTC.
  assert.equal(jourDeParis(new Date('2026-09-17T21:30:00Z')), '2026-09-17');
  // 0 h 30 à Paris le 18, c'est encore le 17 en UTC.
  assert.equal(jourDeParis(new Date('2026-09-17T22:30:00Z')), '2026-09-18');
});
