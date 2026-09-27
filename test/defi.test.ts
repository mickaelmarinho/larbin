import test from 'node:test';
import assert from 'node:assert/strict';

import { apply, viewFor } from '../src/engine/game.ts';
import { botAction } from '../src/engine/bot.ts';
import type { GameState, Role } from '../src/engine/types.ts';
import type { Action } from '../src/engine/types.ts';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { repondreApi } from '../src/reseau/api.ts';
import { DepotMemoire } from '../src/reseau/depot.ts';
import { jourDeParis } from '../src/web/jour.ts';
import {
  DEFI_MANCHES, DEFI_MAXIMUM, bilanVierge, emojisDuDefi, graineDuJour, hasardDuDefi, noterLaManche, partieDuDefi,
  rejouerLeDefi, texteDuDefi,
} from '../src/web/defi.ts';

/**
 * Joue le défi de bout en bout, chacun jouant comme le bot — « moi » compris —
 * et relève les coups de « moi », comme le fait le navigateur.
 */
function jouerLeDefi(jour: string): { roles: Role[]; points: number; donne: string; coups: Action[] } {
  let e: GameState = partieDuDefi(jour);
  const donne = viewFor(e, 'moi').me.hand.map((c) => c.id).join(',');
  const roles: Role[] = [];
  const coups: Action[] = [];
  for (let garde = 0; garde < 5000; garde++) {
    if (e.phase === 'fin-de-manche') {
      roles.push(e.players.find((p) => p.id === 'moi')!.role!);
      if (e.round === DEFI_MANCHES) break;
      coups.push({ type: 'manche-suivante' });
      e = apply(e, { type: 'manche-suivante' });
      continue;
    }
    const acteur = e.order[e.turn];
    // « moi » tire son hasard ailleurs : son jeu n'a pas à ressembler à celui d'un bot.
    const coup = botAction(viewFor(e, acteur), acteur === 'moi' ? () => 0.1 : hasardDuDefi(e));
    assert.ok(coup, `personne ne joue (phase ${e.phase})`);
    if (acteur === 'moi') coups.push(coup);
    e = apply(e, coup);
  }
  assert.equal(roles.length, DEFI_MANCHES, 'le défi va jusqu’à sa dernière manche');
  return { roles, points: e.players.find((p) => p.id === 'moi')!.points, donne, coups };
}

test('le défi du jour se rejoue à l’identique : même donne, même hasard, même issue', () => {
  const a = jouerLeDefi('2026-09-27');
  const b = jouerLeDefi('2026-09-27');
  assert.deepEqual(a, b);
  assert.ok(a.points >= 0 && a.points <= DEFI_MAXIMUM);
});

test('le serveur retrouve le score en rejouant les seuls coups du joueur', () => {
  const partie = jouerLeDefi('2026-09-27');
  assert.deepEqual(rejouerLeDefi('2026-09-27', partie.coups), { points: partie.points, roles: partie.roles });
});

test('des coups trafiqués, tronqués ou d’un autre jour ne valent rien', () => {
  const { coups } = jouerLeDefi('2026-09-27');
  assert.equal(rejouerLeDefi('2026-09-27', coups.slice(0, -1)), null, 'il manque le dernier coup');
  assert.equal(rejouerLeDefi('2026-09-27', [...coups, { type: 'passer' }]), null, 'un coup de trop');
  assert.equal(rejouerLeDefi('2026-09-28', coups), null, 'la donne d’un autre jour');
  const premierePose = coups.findIndex((c) => c.type === 'poser');
  const triche = structuredClone(coups);
  (triche[premierePose] as { cards: string[] }).cards = ['15♠'];
  assert.equal(rejouerLeDefi('2026-09-27', triche), null, 'une carte qu’on n’a pas');
  assert.equal(rejouerLeDefi('2026-09-27', 'n’importe quoi'), null);
  assert.equal(rejouerLeDefi('2026-09-27', [{ type: 'nouvelle-partie' }]), null);
});

test('l’API du défi : le serveur rejoue, classe, et n’accepte qu’un score par joueur', async () => {
  const depot = new DepotMemoire();
  const serveur = http.createServer(async (req, res) => {
    if (!(await repondreApi(req, res, depot))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r));
  const { port } = serveur.address() as AddressInfo;
  const appeler = async (chemin: string, corps?: unknown, jeton?: string) => {
    const r = await fetch(`http://127.0.0.1:${port}${chemin}`, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    return { statut: r.status, corps: await r.json() };
  };

  const jour = jourDeParis();
  const partie = jouerLeDefi(jour);

  // Un invité : le serveur trouve lui-même le score, quoi qu'on prétende.
  const invite = await appeler('/defi', { jour, coups: partie.coups, nom: 'Zoé', points: 9 });
  assert.equal(invite.statut, 201);
  assert.deepEqual(invite.corps, { place: 1, total: 1, points: partie.points, nom: 'Zoé' });
  assert.equal((await appeler('/defi', { jour, coups: partie.coups, nom: 'Zoé bis' })).statut, 409,
    'un seul score par adresse et par jour pour les invités');

  // Un compte : il signe de son pseudo, une fois par jour.
  const cree = await appeler('/compte/creer', { pseudo: 'Mickagames' });
  const jeton = cree.corps.jeton as string;
  const compte = await appeler('/defi', { jour, coups: partie.coups, nom: 'Autre' }, jeton);
  assert.equal(compte.statut, 201);
  assert.equal(compte.corps.nom, 'Mickagames');
  assert.equal(compte.corps.total, 2);
  assert.equal((await appeler('/defi', { jour, coups: partie.coups }, jeton)).statut, 409);

  // Ce qui ne se rejoue pas, ou qui vient d'un autre jour, est refusé.
  assert.equal((await appeler('/defi', { jour, coups: partie.coups.slice(1) }, jeton)).statut, 400);
  assert.equal((await appeler('/defi', { jour: '2020-01-01', coups: partie.coups })).statut, 400);

  const classement = await appeler(`/defi?jour=${jour}`);
  assert.equal(classement.corps.total, 2);
  assert.deepEqual(classement.corps.lignes.map((l: { nom: string }) => l.nom), ['Zoé', 'Mickagames'],
    'à égalité, le premier arrivé passe devant');
  assert.equal(classement.corps.lignes[1].compte, true);
  assert.equal(classement.corps.lignes[0].roles, partie.roles.join(','));

  await new Promise<void>((r) => serveur.close(() => r()));
});

test('chaque jour a sa donne', () => {
  assert.notEqual(graineDuJour('2026-09-27'), graineDuJour('2026-09-28'));
  assert.notEqual(jouerLeDefi('2026-09-27').donne, jouerLeDefi('2026-09-28').donne);
});

test('le bilan : chaque manche une fois, et le défi se clôt à la troisième', () => {
  let b = bilanVierge('2026-09-27');
  b = noterLaManche(b, 1, 'boss', 3);
  assert.equal(noterLaManche(b, 1, 'larbin', 3), b, 'revoir l’écran de fin ne recompte rien');
  b = noterLaManche(b, 2, 'sous-boss', 5);
  assert.equal(b.fini, false);
  b = noterLaManche(b, 3, 'larbin', 5);
  assert.equal(b.fini, true);
  assert.equal(noterLaManche(b, 3, 'boss', 8), b, 'un défi fini ne bouge plus');
  assert.equal(emojisDuDefi(b), '👑 🥈 🧹');
  assert.match(texteDuDefi(b), /^Le Larbin — défi du 27\/09 : 5\/9\n👑 🥈 🧹\n/);
});
