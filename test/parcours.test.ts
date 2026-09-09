/**
 * Le parcours relit un contenu venu du disque du joueur : il a pu être écrit
 * par une version plus ancienne, tronqué par un quota plein, ou bricolé à la
 * main dans la console. Ces épreuves portent surtout sur ce qu'il fait d'une
 * entrée abîmée — c'est le seul endroit du jeu qui accorde sa confiance à des
 * données qu'il n'a pas produites lui-même.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Node n'a pas de localStorage : on lui en prête un, en mémoire. */
const memoire = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (c: string) => memoire.get(c) ?? null,
  setItem: (c: string, v: string) => { memoire.set(c, v); },
  removeItem: (c: string) => { memoire.delete(c); },
};

const { bilan, noterManche, noterPartie, parcours } = await import('../src/web/parcours.ts');

const CLE = 'larbin.parcours';
let jeu = 0;
let manche = 0;
const table = () => { memoire.clear(); jeu = 0; manche = 0; };

function partie(place: number, points = 10) {
  return {
    date: new Date().toISOString(),
    mode: 'solo' as const,
    joueurs: 4,
    place,
    points,
    gagnant: place === 1 ? 'Vous' : 'Hugo',
    manches: 6,
  };
}

test('un parcours vierge ne raconte rien plutôt que de planter', () => {
  table();
  const b = bilan(parcours());
  assert.equal(b.parties, 0);
  assert.equal(b.victoires, 0);
  assert.equal(b.taux, null);
  assert.equal(b.serie, 0);
});

test('les parties se rangent de la plus récente à la plus ancienne', () => {
  table();
  noterPartie(String(++jeu), partie(3));
  const p = noterPartie(String(++jeu), partie(1));
  assert.equal(p.parties[0].place, 1);
  assert.equal(p.parties[1].place, 3);
});

test('la série en cours se compte depuis la dernière partie', () => {
  table();
  noterPartie(String(++jeu), partie(1));
  noterPartie(String(++jeu), partie(4));   // la défaite qui coupe
  noterPartie(String(++jeu), partie(1));
  noterPartie(String(++jeu), partie(1));
  const b = bilan(parcours());
  assert.equal(b.parties, 4);
  assert.equal(b.victoires, 3);
  assert.equal(b.taux, 75);
  assert.equal(b.serie, 2, 'les deux dernières victoires');
  assert.equal(b.meilleureSerie, 2);
});

test('une défaite en dernière place remet la série en cours à zéro', () => {
  table();
  noterPartie(String(++jeu), partie(1));
  noterPartie(String(++jeu), partie(1));
  noterPartie(String(++jeu), partie(2));
  const b = bilan(parcours());
  assert.equal(b.serie, 0);
  assert.equal(b.meilleureSerie, 2, 'la meilleure série, elle, reste acquise');
});

test('le journal ne dépasse jamais cinquante parties', () => {
  table();
  for (let i = 0; i < 60; i++) noterPartie(String(++jeu), partie(1));
  assert.equal(parcours().parties.length, 50);
});

test('les rôles et les 2 fatals s’accumulent', () => {
  table();
  noterManche(String(jeu), ++manche, 'boss', false);
  noterManche(String(jeu), ++manche, 'larbin', true);
  noterManche(String(jeu), ++manche, 'larbin', true);
  const p = parcours();
  assert.equal(p.roles.boss, 1);
  assert.equal(p.roles.larbin, 2);
  assert.equal(p.deuxFatals, 2);
  assert.equal(bilan(p).manches, 3);
});

test('un contenu illisible ne fait pas perdre le jeu', () => {
  table();
  memoire.set(CLE, '{ ceci n’est pas du JSON');
  assert.equal(bilan(parcours()).parties, 0);
});

test('une entrée abîmée est réparée plutôt que recopiée telle quelle', () => {
  table();
  memoire.set(CLE, JSON.stringify({
    parties: [
      { date: '2026-01-01T00:00:00.000Z', place: 'premier', points: -8, joueurs: null },
      { place: 1 },                       // sans date : inexploitable, on l'écarte
      'une chaîne au milieu du tableau',
    ],
    roles: { boss: 3, larbin: 'beaucoup', inconnu: 12 },
    deuxFatals: -5,
  }));

  const p = parcours();
  assert.equal(p.parties.length, 1, 'seule l’entrée datée survit');
  assert.equal(p.parties[0].place, 1, 'une place illisible retombe sur 1');
  assert.equal(p.parties[0].points, 0, 'un score négatif n’a pas de sens');
  assert.equal(p.parties[0].joueurs, 4);
  assert.equal(p.parties[0].gagnant, '?');
  assert.equal(p.roles.boss, 3);
  assert.equal(p.roles.larbin, 0, 'un compteur non numérique repart de zéro');
  assert.equal(p.deuxFatals, 0);
  assert.equal((p.roles as Record<string, number>).inconnu, undefined, 'aucun rôle inventé');
});

test('un stockage en panne laisse le jeu jouable', () => {
  table();
  const vrai = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem() { throw new Error('mode privé'); },
    setItem() { throw new Error('quota dépassé'); },
  };
  assert.doesNotThrow(() => noterManche(String(jeu), ++manche, 'boss', false));
  assert.equal(bilan(parcours()).parties, 0);
  (globalThis as Record<string, unknown>).localStorage = vrai;
});

test('recharger la page sur le panneau de fin ne compte pas la manche deux fois', () => {
  table();
  noterManche('partie-A', 3, 'larbin', true);
  noterManche('partie-A', 3, 'larbin', true);   // le panneau revient, la manche non
  noterManche('partie-A', 3, 'larbin', true);
  const p = parcours();
  assert.equal(p.roles.larbin, 1);
  assert.equal(p.deuxFatals, 1);
});

test('recharger sur « partie terminée » ne rejoue pas la partie dans le journal', () => {
  table();
  noterPartie('partie-A', partie(1));
  noterPartie('partie-A', partie(1));
  noterPartie('partie-A', partie(1));
  assert.equal(parcours().parties.length, 1);
});

test('une manche déjà dépassée ne se recompte pas en revenant en arrière', () => {
  table();
  noterManche('partie-A', 1, 'boss', false);
  noterManche('partie-A', 2, 'neutre', false);
  noterManche('partie-A', 1, 'boss', false);   // un vieux panneau qui traîne
  const p = parcours();
  assert.equal(bilan(p).manches, 2);
  assert.equal(p.roles.boss, 1);
});

test('la partie suivante repart avec ses propres compteurs', () => {
  table();
  noterManche('partie-A', 4, 'boss', false);
  noterPartie('partie-A', partie(1));
  // Nouvelle partie : la manche 1 est bien postérieure, malgré son petit numéro.
  noterManche('partie-B', 1, 'larbin', false);
  noterPartie('partie-B', partie(4));
  const p = parcours();
  assert.equal(bilan(p).manches, 2);
  assert.equal(p.parties.length, 2);
  assert.equal(p.roles.larbin, 1);
});
