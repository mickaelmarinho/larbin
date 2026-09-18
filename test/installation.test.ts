import test from 'node:test';
import assert from 'node:assert/strict';

import { PARTIES_AVANT, RELANCE, REFUS_MAX, proposerInstallation } from '../src/web/installation.ts';

test('on ne propose l’installation qu’après quelques parties', () => {
  assert.equal(proposerInstallation(0, null), false);
  assert.equal(proposerInstallation(PARTIES_AVANT - 1, null), false);
  assert.equal(proposerInstallation(PARTIES_AVANT, null), true);
});

test('un « plus tard » est respecté : dix parties de plus, et deux fois au plus', () => {
  const refus = { fois: 1, aParties: 3 };
  assert.equal(proposerInstallation(3, refus), false);
  assert.equal(proposerInstallation(3 + RELANCE - 1, refus), false);
  assert.equal(proposerInstallation(3 + RELANCE, refus), true);
  assert.equal(proposerInstallation(500, { fois: REFUS_MAX, aParties: 3 }), false);
});
