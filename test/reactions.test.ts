import test from 'node:test';
import assert from 'node:assert/strict';

import { RegleViolee } from '../src/engine/game.ts';
import { ECART_REACTIONS, Salon } from '../src/reseau/salon.ts';
import { REACTIONS, estReaction } from '../src/reseau/protocole.ts';

/** Deux humains et un bot. */
function table() {
  const salon = new Salon('TEST');
  const mickael = salon.asseoir('Mickaël', 'jeton-m');
  const aurelie = salon.asseoir('Aurélie', 'jeton-a');
  const bot = salon.ajouterBot();
  return { salon, mickael, aurelie, bot };
}

test('une réaction de la liste passe, pour qui est assis', () => {
  const { salon, mickael } = table();
  assert.equal(salon.reagir(mickael.id, '👏', 1000), '👏');
});

test('rien d’autre que la liste : pas de texte libre', () => {
  const { salon, mickael } = table();
  for (const intrus of ['<img src=x onerror=alert(1)>', 'bonjour', '', 42, undefined, null]) {
    assert.throws(() => salon.reagir(mickael.id, intrus, 1000), RegleViolee, String(intrus));
  }
});

test('ni un bot, ni un inconnu ne réagissent', () => {
  const { salon, bot } = table();
  assert.throws(() => salon.reagir(bot.id, '👍', 1000), RegleViolee);
  assert.throws(() => salon.reagir('fantome', '👍', 1000), RegleViolee);
});

test('trop rapprochées, les réactions sont ignorées sans gronder', () => {
  const { salon, mickael, aurelie } = table();
  assert.equal(salon.reagir(mickael.id, '😂', 1000), '😂');
  assert.equal(salon.reagir(mickael.id, '😂', 1000 + ECART_REACTIONS - 1), null);
  // Chacun son rythme : la hâte de l'un ne fait pas taire l'autre.
  assert.equal(salon.reagir(aurelie.id, '😱', 1001), '😱');
  assert.equal(salon.reagir(mickael.id, '🔥', 1000 + ECART_REACTIONS), '🔥');
});

test('la liste est courte, sans doublon, et ne contient que des émoticônes', () => {
  assert.ok(REACTIONS.length >= 4 && REACTIONS.length <= 10);
  assert.equal(new Set(REACTIONS).size, REACTIONS.length);
  for (const r of REACTIONS) {
    assert.ok(estReaction(r));
    // Rien qui puisse passer pour du texte ou du balisage une fois dans la page.
    assert.match(r, /^\p{Extended_Pictographic}️?$/u, r);
  }
});
