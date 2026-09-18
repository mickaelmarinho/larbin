import test from 'node:test';
import assert from 'node:assert/strict';

import { pseudoValide } from '../src/reseau/comptes.ts';
import { nomConvenable } from '../src/reseau/moderation.ts';
import { nomPropre } from '../src/reseau/protocole.ts';
import { Salon } from '../src/reseau/salon.ts';
import { PERSONNAGES, TRAITS } from '../src/web/noms.ts';

const GROSSIERS = [
  'Connard', 'S4l0pe', 'grosCon', 'Gros con', 'fils de pute', 'PD', 'Hitler92', 'FuckYou',
  'enculé', 'Coooonnard', 'Nique ta mère', 'Les putes',
];

const HONNETES = [
  'Mickaël', 'Constance', 'Faucon', 'Technique', 'Violette', 'Nazir', 'Pornic', 'Yoshito',
  'Scunthorpe', 'Culture', 'Déconnecté', 'Jean-Mi', 'D\'Artagnan', 'Zoé 2', 'Mitchs',
];

test('les grossièretés sont refusées, même déguisées', () => {
  for (const nom of GROSSIERS) assert.equal(nomConvenable(nom), false, nom);
});

test('les noms honnêtes passent, même quand un mot grossier s’y cache', () => {
  for (const nom of HONNETES) assert.equal(nomConvenable(nom), true, nom);
  for (const p of PERSONNAGES) for (const t of TRAITS) assert.equal(nomConvenable(`${p} ${t}`), true, `${p} ${t}`);
});

test('un nom grossier ne s’affiche nulle part', () => {
  assert.equal(nomPropre('Connard'), '');
  assert.equal(pseudoValide('Connard'), null);
  assert.equal(pseudoValide('Constance'), 'Constance');
  // Un invité grossier s'assoit sous un nom tiré au sort.
  const place = new Salon('TEST').asseoir('S4l0pe', 'jeton');
  assert.ok(PERSONNAGES.some((p) => place.nom.startsWith(`${p} `)), place.nom);
});
