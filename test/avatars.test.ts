import test from 'node:test';
import assert from 'node:assert/strict';

import { AVATARS } from '../src/reseau/protocole.ts';
import { Salon } from '../src/reseau/salon.ts';
import { SUCCES } from '../src/web/succes.ts';
import { AVATARS_A_GAGNER, AVATARS_LIBRES, AVATAR_PAR_DEFAUT, avatarDebloquePar, avatarPermis } from '../src/web/avatars.ts';

test('le serveur connaît exactement les avatars proposés, sans doublon', () => {
  const proposes = [...AVATARS_LIBRES, ...AVATARS_A_GAGNER.map((a) => a.avatar)];
  assert.equal(new Set(proposes).size, proposes.length);
  assert.deepEqual([...AVATARS].sort(), proposes.sort());
  assert.ok(AVATARS_LIBRES.includes(AVATAR_PAR_DEFAUT));
});

test('chaque avatar à gagner se rattache à un vrai succès, chacun le sien', () => {
  const ids = new Set(SUCCES.map((s) => s.id));
  for (const { avatar, succes } of AVATARS_A_GAGNER) assert.ok(ids.has(succes), `${avatar} → ${succes}`);
  assert.equal(new Set(AVATARS_A_GAGNER.map((a) => a.succes)).size, AVATARS_A_GAGNER.length);
  assert.equal(avatarDebloquePar('larbin-boss'), '👑');
  assert.equal(avatarDebloquePar('premiere-victoire'), undefined);
});

test('un avatar libre se prend, un avatar à gagner se mérite', () => {
  assert.ok(avatarPermis('🐙', {}));
  assert.ok(!avatarPermis('👑', {}));
  assert.ok(avatarPermis('👑', { 'larbin-boss': '2026-09-14' }));
  assert.ok(!avatarPermis('🍕', {}));
  assert.ok(!avatarPermis('<img src=x>', {}));
});

test('à table, l’avatar choisi suit le joueur ; un intrus est refusé ; les bots n’en ont pas', () => {
  const salon = new Salon('TEST');
  const mickael = salon.asseoir('Mickaël', 'jeton-m', '🦉');
  const intrus = salon.asseoir('Intrus', 'jeton-i', '<img src=x onerror=alert(1)>');
  const sansRien = salon.asseoir('Discret', 'jeton-d');
  const bot = salon.ajouterBot();
  assert.equal(mickael.avatar, '🦉');
  assert.equal(intrus.avatar, null);
  assert.equal(sansRien.avatar, null);
  assert.equal(bot.avatar, null);
  const sieges = salon.etatPublic().sieges;
  assert.equal(sieges.find((s) => s.id === mickael.id)?.avatar, '🦉');
});

test('revenir, ou reprendre la place d’un bot, se fait avec son avatar', () => {
  const salon = new Salon('PUBL', { publique: true });
  const alice = salon.asseoir('Alice', 'jeton-a', '🐸');
  salon.completerEtDemarrer();
  const bruno = salon.reprendreUnBot('Bruno', 'jeton-b', '👑');
  assert.equal(bruno?.avatar, '👑');

  salon.changerAvatar(alice.id, '🦄');
  assert.equal(salon.place(alice.id)?.avatar, '🦄');
  salon.changerAvatar(alice.id, 'n’importe quoi');
  assert.equal(salon.place(alice.id)?.avatar, '🦄', 'un avatar inconnu ne remplace rien');
  const unBot = salon.places.find((p) => p.estBot)!;
  salon.changerAvatar(unBot.id, '🐙');
  assert.equal(unBot.avatar, null, 'un bot ne se choisit pas d’avatar');
});
