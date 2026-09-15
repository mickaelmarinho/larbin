import test from 'node:test';
import assert from 'node:assert/strict';

import { Salon } from '../src/reseau/salon.ts';
import { PERSONNAGES, TRAITS, nomAuHasard } from '../src/web/noms.ts';

const tousLesNoms = () => PERSONNAGES.flatMap((p) => TRAITS.map((t) => `${p} ${t}`));

test('chaque nom proposé tient dans le champ (14 caractères) et passe tel quel à table', () => {
  for (const nom of tousLesNoms()) {
    assert.ok(nom.length >= 3 && nom.length <= 14, `${nom} : ${nom.length} caractères`);
    assert.equal(new Salon('TEST').asseoir(nom, 'jeton').nom, nom);
  }
});

test('le hasard choisit, jusqu’aux bornes des listes', () => {
  assert.equal(nomAuHasard(() => 0), `${PERSONNAGES[0]} ${TRAITS[0]}`);
  assert.equal(nomAuHasard(() => 0.999999), `${PERSONNAGES.at(-1)} ${TRAITS.at(-1)}`);
  const tires = new Set(Array.from({ length: 200 }, () => nomAuHasard()));
  assert.ok(tires.size > 20, 'assez de variété pour qu’une table ne se ressemble pas');
});
