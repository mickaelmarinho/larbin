import test from 'node:test';
import assert from 'node:assert/strict';

import { podium, signeDeVie, texteDuBoutonPublic } from '../src/web/vitrine.ts';

test('serveur muet : l’accueil ne promet rien', () => {
  assert.equal(signeDeVie(null), null);
  assert.equal(texteDuBoutonPublic(null), 'Jouer avec d\'autres visiteurs');
});

test('site désert : une invitation, jamais « 0 joueur »', () => {
  const signe = signeDeVie({ joueurs: 0, publiques: 0, enAttente: 0 });
  assert.equal(signe?.vivant, false);
  assert.doesNotMatch(signe!.texte, /\b0\b/);
});

test('du monde : le nombre de joueurs, et les tables ouvertes s’il y en a', () => {
  assert.deepEqual(signeDeVie({ joueurs: 1, publiques: 0, enAttente: 0 }), { texte: '1 en ligne', detail: '', vivant: true });
  assert.deepEqual(signeDeVie({ joueurs: 3, publiques: 1, enAttente: 1 }), { texte: '3 en ligne', detail: '1 table ouverte', vivant: true });
  assert.equal(signeDeVie({ joueurs: 7, publiques: 2, enAttente: 3 })?.detail, '2 tables ouvertes');
});

test('le bouton invite à rejoindre ceux qui attendent', () => {
  assert.equal(texteDuBoutonPublic({ joueurs: 4, publiques: 0, enAttente: 0 }), 'Jouer avec d\'autres visiteurs');
  assert.equal(texteDuBoutonPublic({ joueurs: 4, publiques: 1, enAttente: 1 }), 'Rejoindre un visiteur qui attend');
  assert.equal(texteDuBoutonPublic({ joueurs: 4, publiques: 1, enAttente: 3 }), 'Rejoindre 3 visiteurs qui attendent');
});

test('le podium : trois au plus, et seulement ceux qui ont gagné', () => {
  const ligne = (pseudo: string, victoires: number, parties: number) => ({ pseudo, avatar: null, victoires, parties });
  const lignes = [ligne('Zoé', 0, 4), ligne('Hugo', 2, 9), ligne('Gina', 5, 8), ligne('Lila', 2, 3), ligne('Naïm', 1, 1)];
  assert.deepEqual(podium(lignes).map((l) => l.pseudo), ['Gina', 'Lila', 'Hugo']);
  assert.deepEqual(podium([ligne('Zoé', 0, 4)]), []);
  assert.deepEqual(podium(null), []);
});
