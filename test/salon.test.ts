import test from 'node:test';
import assert from 'node:assert/strict';

import { RegleViolee } from '../src/engine/game.ts';
import { Salon, tablePubliqueOuverte } from '../src/reseau/salon.ts';
import { codeDeSalon, codeValide, nomPropre } from '../src/reseau/protocole.ts';

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

test('la table voit qui a décroché', () => {
  const salon = tableDe(2);
  salon.demarrer();
  const [mickael, aurelie] = salon.places;

  assert.ok(salon.vuePour(mickael.id)!.others.every((o) => o.connecte));

  aurelie.connecte = false;
  const vue = salon.vuePour(mickael.id)!;
  assert.equal(vue.others.find((o) => o.id === aurelie.id)!.connecte, false);
  assert.ok(
    vue.others.filter((o) => o.id !== aurelie.id).every((o) => o.connecte),
    'les bots et les autres restent présents',
  );
});

test('seul l’hôte relance une partie', () => {
  const salon = tableDe(2);
  salon.demarrer();
  const [hote, invite] = salon.places;

  assert.throws(() => salon.jouer(invite.id, { type: 'nouvelle-partie' }), RegleViolee);
  salon.jouer(hote.id, { type: 'nouvelle-partie' });
  assert.equal(salon.etat!.round, 1);
  assert.ok(salon.etat!.players.every((p) => p.points === 0));
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

test('retirer puis ajouter des bots ne crée pas deux fois le même joueur', () => {
  const salon = new Salon('TEST');
  salon.asseoir('Hôte', 'jh');
  salon.ajouterBot();
  salon.ajouterBot();
  salon.retirer(salon.places[1].id);
  salon.ajouterBot();
  salon.ajouterBot();

  const ids = salon.places.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, ids.join(', '));
  assert.doesNotThrow(() => salon.demarrer(), 'le moteur refuse deux joueurs du même identifiant');
});

/* ------------------------------------------------------ tables publiques */

test('un nom ne peut pas servir à glisser du code chez les autres', () => {
  assert.equal(nomPropre('Mickaël'), 'Mickaël');
  assert.equal(nomPropre("D'Artagnan"), "D'Artagnan");
  assert.equal(nomPropre('  Jean-Mi   2 '), 'Jean-Mi 2');
  for (const brut of ['<img src=x onerror=alert(1)>', '"><script>x</script>', 'a&amp;b']) {
    assert.doesNotMatch(nomPropre(brut), /[<>"&=()]/, brut);
  }
  assert.equal(nomPropre('Unnomvraimentbeaucouptroplong').length, 14);

  const salon = new Salon('TEST');
  assert.doesNotMatch(salon.asseoir('<b onmouseover=x>Zoé</b>', 'j1').nom, /[<>=]/);
  assert.equal(salon.asseoir('<<>>', 'j2').nom, 'Joueur', 'un nom vidé par le nettoyage retombe sur « Joueur »');
});

test('une table publique n’a pas d’hôte, et chacun peut y relancer', () => {
  const salon = new Salon('PUBL', { publique: true });
  salon.asseoir('Aurélie', 'ja');
  const bruno = salon.asseoir('Bruno', 'jb');

  assert.equal(salon.hote, null);
  assert.equal(salon.etatPublic().publique, true);
  assert.ok(salon.etatPublic().sieges.every((s) => !s.hote));

  salon.completerEtDemarrer();
  assert.doesNotThrow(() => salon.jouer(bruno.id, { type: 'nouvelle-partie' }));
});

test('au bout du compte à rebours, des bots complètent la table', () => {
  const salon = new Salon('PUBL', { publique: true });
  salon.asseoir('Seul au monde', 'j1');
  salon.lancement = Date.now() + 20_000;

  salon.completerEtDemarrer();
  assert.ok(salon.commencee);
  assert.equal(salon.places.length, 4);
  assert.equal(salon.places.filter((p) => p.estBot).length, 3);
  assert.equal(salon.etatPublic().departDans, null, 'plus de compte à rebours une fois lancée');
});

test('assez de monde à la table : aucun bot ne s’invite', () => {
  const salon = new Salon('PUBL', { publique: true });
  for (const nom of ['A', 'B', 'C', 'D', 'E']) salon.asseoir(nom, `j-${nom}`);
  salon.completerEtDemarrer();
  assert.equal(salon.places.length, 5);
  assert.ok(salon.places.every((p) => !p.estBot));
});

test('le compte à rebours s’annonce en durée, pas en heure', () => {
  const salon = new Salon('PUBL', { publique: true });
  salon.asseoir('Aurélie', 'ja');
  assert.equal(salon.etatPublic().departDans, null, 'rien de prévu tant que le serveur n’a rien programmé');

  salon.lancement = Date.now() + 15_000;
  const reste = salon.etatPublic().departDans!;
  assert.ok(reste > 14_000 && reste <= 15_000, String(reste));
});

test('on rejoint la table publique la plus remplie qui attend encore', () => {
  const privee = new Salon('PRIV');
  privee.asseoir('Ami', 'j0');

  const petite = new Salon('PETI', { publique: true });
  petite.asseoir('Un', 'j1');

  const grande = new Salon('GRAN', { publique: true });
  grande.asseoir('Deux', 'j2');
  grande.asseoir('Trois', 'j3');

  const lancee = new Salon('LANC', { publique: true });
  for (const n of ['W', 'X', 'Y']) lancee.asseoir(n, `j${n}`);
  lancee.completerEtDemarrer();

  const desertee = new Salon('DESE', { publique: true });
  for (const n of ['P', 'Q', 'R']) desertee.asseoir(n, `j${n}`).connecte = false;

  assert.equal(tablePubliqueOuverte([privee, petite, lancee, desertee, grande])?.code, 'GRAN');
  assert.equal(tablePubliqueOuverte([privee, lancee, desertee]), undefined, 'sinon, on en ouvrira une');
});

test('les bots sont prêts d’office, les humains non', () => {
  const salon = new Salon('PUBL', { publique: true });
  const aurelie = salon.asseoir('Aurélie', 'ja');
  const bot = salon.ajouterBot();

  assert.equal(aurelie.pret, false);
  assert.equal(bot.pret, true, 'un bot ne fait jamais attendre personne');
  assert.equal(salon.tousPrets, false);

  salon.marquerPret(aurelie.id, true);
  assert.equal(salon.tousPrets, true);
  assert.equal(salon.etatPublic().sieges.find((s) => s.id === aurelie.id)?.pret, true);
});

test('se dédire défait l’accord, et un nouveau venu aussi', () => {
  const salon = new Salon('PUBL', { publique: true });
  const aurelie = salon.asseoir('Aurélie', 'ja');
  salon.marquerPret(aurelie.id, true);
  assert.equal(salon.tousPrets, true);

  salon.marquerPret(aurelie.id, false);
  assert.equal(salon.tousPrets, false, 'se dédire suffit');

  salon.marquerPret(aurelie.id, true);
  const bruno = salon.asseoir('Bruno', 'jb');
  assert.equal(salon.tousPrets, false, 'Bruno n’a encore rien promis');

  salon.marquerPret(bruno.id, true);
  assert.equal(salon.tousPrets, true);
});

test('une table où il n’y a que des bots n’est jamais prête', () => {
  const salon = new Salon('PUBL', { publique: true });
  salon.ajouterBot();
  salon.ajouterBot();
  assert.equal(salon.tousPrets, false, 'sinon une table désertée se lancerait toute seule');
});

test('on ne se dit pas prêt à la place d’un autre, ni après le départ', () => {
  const salon = new Salon('PUBL', { publique: true });
  const aurelie = salon.asseoir('Aurélie', 'ja');
  const bot = salon.ajouterBot();
  assert.throws(() => salon.marquerPret(bot.id, false), RegleViolee);
  assert.throws(() => salon.marquerPret('inconnu', true), RegleViolee);

  salon.completerEtDemarrer();
  assert.throws(() => salon.marquerPret(aurelie.id, false), RegleViolee);
});

test('une table publique pleine n’accueille plus personne', () => {
  const salon = new Salon('PLEI', { publique: true });
  for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) salon.asseoir(n, `j${n}`);
  assert.equal(salon.accueille, false);
});
