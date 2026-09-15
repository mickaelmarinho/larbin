import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { createGame } from '../src/engine/game.ts';
import { repondreApi } from '../src/reseau/api.ts';
import { cleDePseudo, codeNormalise, nouveauCode, pseudoValide } from '../src/reseau/comptes.ts';
import { DepotMemoire, type Depot } from '../src/reseau/depot.ts';
import { Recompenses, entreHumains, vainqueur } from '../src/reseau/recompenses.ts';
import { Salon } from '../src/reseau/salon.ts';
import { fusionnerParcours, relire } from '../src/web/parcours.ts';
import { fusionnerSucces } from '../src/web/succes.ts';

/* ------------------------------------------------------------- outillage */

async function serveurDeTest(depot: Depot | null = new DepotMemoire()) {
  const serveur = http.createServer(async (req, res) => {
    if (!(await repondreApi(req, res, depot))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r));
  const { port } = serveur.address() as AddressInfo;
  const appeler = async (chemin: string, corps?: unknown, jeton?: string) => {
    const entetes: Record<string, string> = {};
    if (corps !== undefined) entetes['Content-Type'] = 'application/json';
    if (jeton) entetes.Authorization = `Bearer ${jeton}`;
    const r = await fetch(`http://127.0.0.1:${port}${chemin}`, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: entetes,
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const texte = await r.text();
    return { statut: r.status, corps: texte ? JSON.parse(texte) : null, entetes: r.headers };
  };
  return { appeler, fermer: () => new Promise<void>((r) => serveur.close(() => r())) };
}

/* --------------------------------------------------------------- l'outil */

test('un pseudo : 3 à 14 caractères montrables, dont au moins une lettre', () => {
  assert.equal(pseudoValide('Mickaël'), 'Mickaël');
  assert.equal(pseudoValide('  Jean-Mi  '), 'Jean-Mi');
  assert.equal(pseudoValide('ab'), null);
  assert.equal(pseudoValide('12345'), null);
  assert.equal(pseudoValide('<b>x</b>'), 'bxb');
  assert.equal(pseudoValide('unpseudotroplong'), null);
  assert.equal(pseudoValide(42), null);
  assert.equal(cleDePseudo('Mickaël'), cleDePseudo('MICKAEL'));
});

test('un code secret se recopie sans ambiguïté, et ne se répète pas', () => {
  const codes = new Set(Array.from({ length: 200 }, () => nouveauCode()));
  assert.equal(codes.size, 200);
  for (const code of codes) {
    assert.match(code, /^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/);
    assert.equal(codeNormalise(code.toLowerCase().replaceAll('-', ' ')), code.replaceAll('-', ''));
  }
  assert.equal(codeNormalise('ABCD'), null);
  assert.equal(codeNormalise('0000-1111-OOOO-IIII'), null);
});

/* ----------------------------------------------------------------- l'API */

test('créer un compte : un code, une session, et un pseudo qui n’est plus à personne d’autre', async () => {
  const { appeler, fermer } = await serveurDeTest();
  try {
    const cree = await appeler('/compte/creer', { pseudo: 'Mickaël' });
    assert.equal(cree.statut, 201);
    assert.match(cree.corps.code, /^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/);
    assert.equal(cree.corps.compte.pseudo, 'Mickaël');
    assert.equal(cree.entetes.get('access-control-allow-origin'), '*');

    const moi = await appeler('/compte', undefined, cree.corps.jeton);
    assert.equal(moi.statut, 200);
    assert.equal(moi.corps.compte.pseudo, 'Mickaël');

    const double = await appeler('/compte/creer', { pseudo: 'MICKAEL' });
    assert.equal(double.statut, 409);
    assert.equal((await appeler('/compte/creer', { pseudo: 'x' })).statut, 400);
  } finally {
    await fermer();
  }
});

test('se connecter : le bon code, sous n’importe quelle forme ; un mauvais code ne dit rien', async () => {
  const { appeler, fermer } = await serveurDeTest();
  try {
    const { corps } = await appeler('/compte/creer', { pseudo: 'Aurélie' });
    const faux = await appeler('/compte/connexion', { pseudo: 'Aurélie', code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' });
    const inconnu = await appeler('/compte/connexion', { pseudo: 'Personne', code: corps.code });
    assert.equal(faux.statut, 401);
    assert.equal(inconnu.statut, 401);
    assert.equal(faux.corps.erreur, inconnu.corps.erreur, 'on ne révèle pas quels pseudos existent');

    const bon = await appeler('/compte/connexion', { pseudo: 'aurelie', code: corps.code.toLowerCase().replaceAll('-', '') });
    assert.equal(bon.statut, 200);
    assert.equal((await appeler('/compte', undefined, bon.corps.jeton)).statut, 200);
    assert.equal((await appeler('/compte', undefined, 'jeton-invente')).statut, 401);
  } finally {
    await fermer();
  }
});

test('la synchronisation réunit les deux côtés, et le navigateur ne peut rien « vérifier »', async () => {
  const { appeler, fermer } = await serveurDeTest();
  try {
    const { corps } = await appeler('/compte/creer', { pseudo: 'Bruno' });
    const partie = { date: '2026-09-10T10:00:00.000Z', mode: 'solo', joueurs: 4, place: 1, points: 16, gagnant: 'Vous', manches: 5 };
    const envoi = await appeler('/compte/synchro', {
      parcours: { parties: [partie], roles: { boss: 2, 'sous-boss': 0, neutre: 0, 'sur-larbin': 1, larbin: 2 }, deuxFatals: 1 },
      succes: [{ id: 'premiere-victoire', date: '2026-09-10', verifie: true }, { id: 'inconnu', date: '2026-09-10' }],
      avatar: '🐙',
    }, corps.jeton);
    assert.equal(envoi.statut, 200);
    assert.deepEqual(envoi.corps.donnees.succes, [{ id: 'premiere-victoire', date: '2026-09-10', verifie: false }]);

    // Un autre appareil envoie la même partie, et une autre : la première ne compte qu'une fois.
    const autre = { ...partie, date: '2026-09-11T10:00:00.000Z', place: 3 };
    const second = await appeler('/compte/synchro', { parcours: { parties: [partie, autre] } }, corps.jeton);
    assert.equal(second.corps.donnees.parcours.parties.length, 2);
    assert.equal(second.corps.donnees.parcours.roles.boss, 2, 'les rôles ne se doublent pas');
    assert.equal((await appeler('/compte', undefined, corps.jeton)).corps.compte.avatar, '🐙');
  } finally {
    await fermer();
  }
});

test('un nouveau code chasse l’ancien, et les autres appareils', async () => {
  const { appeler, fermer } = await serveurDeTest();
  try {
    const cree = await appeler('/compte/creer', { pseudo: 'Carla' });
    const ailleurs = await appeler('/compte/connexion', { pseudo: 'Carla', code: cree.corps.code });
    const nouveau = await appeler('/compte/nouveau-code', {}, cree.corps.jeton);
    assert.equal(nouveau.statut, 200);
    assert.notEqual(nouveau.corps.code, cree.corps.code);

    assert.equal((await appeler('/compte', undefined, cree.corps.jeton)).statut, 200, 'la session courante reste');
    assert.equal((await appeler('/compte', undefined, ailleurs.corps.jeton)).statut, 401, 'les autres sont fermées');
    assert.equal((await appeler('/compte/connexion', { pseudo: 'Carla', code: cree.corps.code })).statut, 401);
    assert.equal((await appeler('/compte/connexion', { pseudo: 'Carla', code: nouveau.corps.code })).statut, 200);
  } finally {
    await fermer();
  }
});

test('supprimer son compte l’efface, et rend le pseudo libre', async () => {
  const { appeler, fermer } = await serveurDeTest();
  try {
    const cree = await appeler('/compte/creer', { pseudo: 'Diane' });
    assert.equal((await appeler('/compte/supprimer', {}, cree.corps.jeton)).statut, 204);
    assert.equal((await appeler('/compte', undefined, cree.corps.jeton)).statut, 401);
    assert.equal((await appeler('/compte/creer', { pseudo: 'Diane' })).statut, 201);
  } finally {
    await fermer();
  }
});

test('sans base de données, les comptes sont fermés — et l’on peut toujours demander', async () => {
  const { appeler, fermer } = await serveurDeTest(null);
  try {
    assert.equal((await appeler('/compte/creer', { pseudo: 'Élise' })).statut, 503);
    assert.equal((await appeler('/classement')).statut, 503);
  } finally {
    await fermer();
  }
});

test('le classement : les victoires en ligne, départagées par le nombre de parties', async () => {
  const depot = new DepotMemoire();
  const a = (await depot.creerCompte('Alice', 'x'))!;
  const b = (await depot.creerCompte('Bruno', 'y'))!;
  for (const gagne of [true, false, true]) await depot.noterResultat(a.id, { date: new Date().toISOString(), gagne });
  for (const gagne of [true, true]) await depot.noterResultat(b.id, { date: new Date().toISOString(), gagne });
  const { appeler, fermer } = await serveurDeTest(depot);
  try {
    const { corps } = await appeler('/classement');
    assert.deepEqual(corps.map((l: { pseudo: string }) => l.pseudo), ['Bruno', 'Alice']);
    assert.deepEqual(corps[1], { pseudo: 'Alice', avatar: null, victoires: 2, parties: 3 });
  } finally {
    await fermer();
  }
});

/* -------------------------------------------------------------- fusions */

test('deux parcours réunis : une partie vue deux fois compte une fois', () => {
  const partie = { date: '2026-09-10T10:00:00.000Z', mode: 'solo', joueurs: 4, place: 1, points: 16, gagnant: 'Vous', manches: 5 };
  const ici = relire({ parties: [partie], roles: { boss: 3 }, deuxFatals: 1 });
  const la = relire({ parties: [partie, { ...partie, date: '2026-09-12T10:00:00.000Z' }], roles: { boss: 1, larbin: 4 } });
  const p = fusionnerParcours(ici, la);
  assert.equal(p.parties.length, 2);
  assert.equal(p.parties[0].date, '2026-09-12T10:00:00.000Z', 'la plus récente d’abord');
  assert.equal(p.roles.boss, 3);
  assert.equal(p.roles.larbin, 4);
  assert.equal(p.deuxFatals, 1);
});

test('deux listes de succès réunies : la première date, et la vérification, l’emportent', () => {
  const liste = fusionnerSucces(
    [{ id: 'boss-direct', date: '2026-09-12', verifie: false }],
    [{ id: 'boss-direct', date: '2026-09-10', verifie: true }, { id: 'inconnu' as 'boss-direct', date: '2026-09-01', verifie: true }],
  );
  assert.deepEqual(liste, [{ id: 'boss-direct', date: '2026-09-10', verifie: true }]);
});

/* ---------------------------------------------------------------- à table */

test('à table, un compte joue sous son pseudo ; un invité ne peut pas le prendre', () => {
  const salon = new Salon('TEST');
  const compte = salon.asseoir('Surnom', 'jeton-c', '🦉', { compte: { id: 'c1', pseudo: 'Mickaël' } });
  const invite = salon.asseoir('Mickaël', 'jeton-i', undefined, { reserve: (n) => cleDePseudo(n) === cleDePseudo('Mickaël') });
  assert.equal(compte.nom, 'Mickaël');
  assert.notEqual(invite.nom, 'Mickaël');
  const sieges = salon.etatPublic().sieges;
  assert.equal(sieges.find((s) => s.id === compte.id)?.compte, true);
  assert.equal(sieges.find((s) => s.id === invite.id)?.compte, false);
});

test('en ligne, le serveur décerne lui-même les succès, et note le résultat', async () => {
  const depot = new DepotMemoire();
  const compte = (await depot.creerCompte('Mickaël', 'x'))!;
  const prevenus: string[][] = [];
  const recompenses = new Recompenses(depot, (_salon, _id, ids) => prevenus.push(ids));

  const salon = new Salon('PUBL', { publique: true });
  const place = salon.asseoir('Mickaël', 'jeton', undefined, { compte: { id: compte.id, pseudo: 'Mickaël' } });
  salon.asseoir('Invité', 'jeton-2');   // un autre humain en face
  salon.completerEtDemarrer();
  const etat = salon.etat!;

  // Fin de la première manche : Boss d'entrée.
  etat.phase = 'fin-de-manche';
  etat.players.find((p) => p.id === place.id)!.role = 'boss';
  await recompenses.observer(salon);
  await recompenses.observer(salon);   // le même moment ne se compte qu'une fois
  assert.deepEqual(prevenus, [['boss-direct']]);

  // Fin de la partie, gagnée.
  etat.phase = 'fin-de-partie';
  etat.round = 2;
  for (const p of etat.players) p.points = p.id === place.id ? etat.objectif : 0;
  assert.equal(vainqueur(etat), place.id);
  await recompenses.observer(salon);

  const donnees = await depot.lireDonnees(compte.id);
  assert.ok(donnees.succes.every((s) => s.verifie));
  assert.ok(donnees.succes.some((s) => s.id === 'premiere-victoire'));
  assert.ok(donnees.succes.some((s) => s.id === 'en-ligne'));
  assert.deepEqual(await depot.resultats(compte.id), { parties: 1, serie: 1 });
  assert.deepEqual((await depot.classement(10))[0], { pseudo: 'Mickaël', avatar: null, victoires: 1, parties: 1 });
});

test('seul face aux bots, une table en ligne ne vérifie rien et ne compte pas au classement', async () => {
  const depot = new DepotMemoire();
  const compte = (await depot.creerCompte('Mickaël', 'x'))!;
  const prevenus: string[][] = [];
  const recompenses = new Recompenses(depot, (_salon, _id, ids) => prevenus.push(ids));

  const salon = new Salon('PUBL', { publique: true });
  const place = salon.asseoir('Mickaël', 'jeton', undefined, { compte: { id: compte.id, pseudo: 'Mickaël' } });
  salon.completerEtDemarrer();   // les bots prennent les places vides
  assert.equal(entreHumains(salon), false);
  const etat = salon.etat!;

  etat.phase = 'fin-de-manche';
  etat.players.find((p) => p.id === place.id)!.role = 'boss';
  await recompenses.observer(salon);
  etat.phase = 'fin-de-partie';
  for (const p of etat.players) p.points = p.id === place.id ? etat.objectif : 0;
  await recompenses.observer(salon);

  assert.deepEqual(prevenus, []);
  assert.deepEqual((await depot.lireDonnees(compte.id)).succes, []);
  assert.deepEqual(await depot.resultats(compte.id), { parties: 0, serie: 0 });
  assert.deepEqual(await depot.classement(10), []);
});

test('une nouvelle partie ne remet pas de vieux rôles en jeu', () => {
  const etat = createGame([{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }, { id: 'd', name: 'd' }]);
  assert.equal(vainqueur(etat), null);
});
