import test from 'node:test';
import assert from 'node:assert/strict';

import { RegleViolee } from '../src/engine/game.ts';
import { Salon } from '../src/reseau/salon.ts';
import { codeDeSalon, codeValide } from '../src/reseau/protocole.ts';

/** Un salon avec deux humains et le nombre de bots demandé. */
function tableDe(bots: number): Salon {
  const salon = new Salon('TEST');
  salon.asseoir('Mickaël', 'jeton-m');
  salon.asseoir('Aurélie', 'jeton-a');
  for (let i = 0; i < bots; i++) salon.ajouterBot();
  return salon;
}

test('un code de salon se dicte au téléphone sans ambiguïté', () => {
  for (let i = 0; i < 200; i++) {
    const code = codeDeSalon();
    assert.equal(code.length, 4);
    assert.ok(codeValide(code), code);
    // Ni I ni O : on les confond avec 1 et 0.
    assert.ok(!/[IO]/.test(code), code);
  }
  assert.ok(!codeValide('AB1D'));
  assert.ok(!codeValide('abcd'));
  assert.ok(!codeValide('ABCDE'));
});

test('le premier arrivé est l’hôte, et les homonymes sont numérotés', () => {
  const salon = new Salon('TEST');
  const premier = salon.asseoir('Marc', 'j1');
  const second = salon.asseoir('Marc', 'j2');

  assert.equal(salon.hote, premier.id);
  assert.equal(premier.nom, 'Marc');
  assert.equal(second.nom, 'Marc 2', 'deux Marc à la même table prêteraient à confusion');
});

test('la table refuse un septième joueur', () => {
  const salon = tableDe(4);
  assert.equal(salon.places.length, 6);
  assert.throws(() => salon.asseoir('De trop', 'j7'), RegleViolee);
});

test('on ne démarre pas à trois', () => {
  const salon = tableDe(1);
  assert.throws(() => salon.demarrer(), RegleViolee);

  salon.ajouterBot();
  salon.demarrer();
  assert.ok(salon.commencee);
  assert.equal(salon.etat!.players.length, 4);
});

test('une fois lancée, la table est fermée', () => {
  const salon = tableDe(2);
  salon.demarrer();
  assert.throws(() => salon.asseoir('Retardataire', 'j9'), RegleViolee);
  assert.throws(() => salon.ajouterBot(), RegleViolee);
  assert.throws(() => salon.retirer(salon.places[3].id), RegleViolee);
});

test('on ne joue pas à la place d’un autre', () => {
  const salon = tableDe(2);
  salon.demarrer();
  const [mickael, aurelie] = salon.places;

  assert.throws(
    () => salon.jouer(mickael.id, { type: 'passer', player: aurelie.id }),
    RegleViolee,
    'usurper le tour du voisin doit être refusé',
  );
});

test('chacun ne reçoit que sa propre main', () => {
  const salon = tableDe(2);
  salon.demarrer();
  const [mickael, aurelie] = salon.places;

  const vue = salon.vuePour(mickael.id)!;
  assert.equal(vue.me.id, mickael.id);
  assert.equal(vue.me.hand.length, 13);
  assert.equal(vue.others.length, 3);
  assert.ok(
    !JSON.stringify(vue.others).includes('suit'),
    'aucune carte adverse ne doit transiter',
  );
  assert.notEqual(salon.vuePour(aurelie.id)!.me.id, mickael.id);
});

test('le jeton ramène à sa place, et à personne d’autre', () => {
  const salon = tableDe(2);
  const mickael = salon.parJeton('jeton-m');
  assert.equal(mickael?.nom, 'Mickaël');
  assert.equal(salon.parJeton('jeton-inconnu'), undefined);
});

test('les bots jouent, et on couvre un joueur parti sans prévenir', () => {
  const salon = tableDe(2);
  salon.demarrer();
  const humains = salon.places.filter((p) => !p.estBot);

  // Tant que les humains sont là, la table n'attend que celui dont c'est le tour.
  const acteur = salon.acteurAutomatique();
  if (acteur) {
    assert.ok(salon.place(acteur)!.estBot, 'seul un bot peut être joué automatiquement ici');
  }

  // Un humain se déconnecte : la table ne doit pas rester bloquée sur lui.
  for (const h of humains) h.connecte = false;
  const tour = salon.etat!.order[salon.etat!.turn];
  assert.equal(salon.acteurAutomatique(), tour);
  assert.ok(salon.coupAutomatique(tour), 'il y a toujours un coup à jouer pour lui');
});

test('une partie complète se joue de bout en bout sur le serveur', () => {
  const salon = tableDe(2);
  salon.demarrer();
  for (const p of salon.places) p.connecte = false;   // tout le monde en pilote automatique

  for (let coup = 0; coup < 4000; coup++) {
    const acteur = salon.acteurAutomatique();
    if (!acteur) break;
    salon.jouer(acteur, salon.coupAutomatique(acteur)!);
  }

  assert.equal(salon.etat!.phase, 'fin-de-manche');
  assert.equal(salon.etat!.classement.length, 4);
  const total = salon.etat!.players.reduce((n, p) => n + p.points, 0);
  assert.equal(total, 3 + 2 + 1 + 0);
});
