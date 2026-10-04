import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, apply, viewFor } from '../src/engine/game.ts';
import { botAction } from '../src/engine/bot.ts';
import { cartesEnAnglais, ligneEnAnglais } from '../src/web/journal.ts';
import { langueDe } from '../src/web/langue.ts';
import { messageEnAnglais } from '../src/web/messages.ts';
import { readFileSync } from 'node:fs';

test('chaque message que le serveur peut envoyer a sa traduction anglaise', () => {
  // On relit les sources : un message ajouté côté serveur sans traduction fait échouer ce test.
  const sources = ['src/reseau/serveur.ts', 'src/reseau/api.ts', 'src/reseau/salon.ts', 'src/engine/game.ts', 'src/web/compte.ts']
    .map((f) => readFileSync(f, 'utf8')).join('\n');
  const litteraux = [
    ...sources.matchAll(/(?:message|erreur): '([^']+)'/g),
    ...sources.matchAll(/(?:RegleViolee|fail)\(\s*'([^']+)'/g),
    ...sources.matchAll(/(?:RegleViolee|fail)\(\s*"([^"]+)"/g),
    ...sources.matchAll(/\? '(Le serveur ne répond pas[^']*|Une erreur est survenue[^']*)'/g),
    ...sources.matchAll(/: '(Une erreur est survenue\.)'/g),
  ].map((m) => m[1]);
  const manquants = [...new Set(litteraux)].filter((m) => messageEnAnglais(m) === m);
  assert.deepEqual(manquants, []);

  assert.equal(messageEnAnglais('Aucun salon ABCD. Le code est-il bon ?'), 'No room ABCD. Is the code right?');
  assert.equal(messageEnAnglais('D ne bat pas R : il faut monter strictement.'), 'Q doesn’t beat K: you must go strictly higher.');
  assert.equal(messageEnAnglais('Un message inconnu.'), 'Un message inconnu.', 'l’inconnu reste tel quel');
});

test('la langue se lit dans l’adresse', () => {
  assert.equal(langueDe('/'), 'fr');
  assert.equal(langueDe('/regles'), 'fr');
  assert.equal(langueDe('/en'), 'en');
  assert.equal(langueDe('/en/'), 'en');
  assert.equal(langueDe('/en/rules'), 'en');
  assert.equal(langueDe('/enfin'), 'fr');
});

test('les cartes : Valet, Dame, Roi deviennent Jack, Queen, King', () => {
  assert.equal(cartesEnAnglais('V♠ D♥ R♦ A♣ 10♠ 2♥'), 'J♠ Q♥ K♦ A♣ 10♠ 2♥');
  assert.equal(cartesEnAnglais('Vous'), 'Vous', 'un mot n’est pas une carte');
});

test('chaque annonce du moteur a sa version anglaise, conjuguée à la bonne personne', () => {
  const cas: Array<[string, string, string]> = [
    ['--- Manche 2 ---', 'Hugo', '--- Round 2 ---'],
    ['Lila ouvre la première manche (dame de cœur).', 'Moi', 'Lila opens the first round (queen of hearts).'],
    ['Moi ouvre la première manche (dame de cœur).', 'Moi', 'You open the first round (queen of hearts).'],
    ['Gina coupe et montre R♠ : il la garde.', 'Moi', 'Gina cuts the deck and shows K♠, then keeps it.'],
    ['Moi et Lila ont fait leur échange.', 'Moi', 'You and Lila swapped cards.'],
    ['Lila et Moi ont fait leur échange.', 'Moi', 'You and Lila swapped cards.'],
    ['Hugo pose D♥ D♣.', 'Moi', 'Hugo plays Q♥ Q♣.'],
    ['Moi pose V♦.', 'Moi', 'You play J♦.'],
    ['Hugo termine sur un 2 : Larbin d\'office !', 'Moi', 'Hugo finishes on a 2: Lackey by default!'],
    ['Moi a fini (1er).', 'Moi', 'You are out (1st).'],
    ['Hugo a fini (3e).', 'Moi', 'Hugo is out (3rd).'],
    ['Le 2 coupe : la série s\'arrête là.', 'Moi', 'The 2 cuts: the trick ends here.'],
    ['Moi passe.', 'Moi', 'You pass.'],
    ['Hugo passe.', 'Moi', 'Hugo passes.'],
    ['Série terminée.', 'Moi', 'Trick over.'],
    ['Lila ouvre une nouvelle série.', 'Moi', 'Lila opens a new trick.'],
    ['Hugo : sous-boss, +2 (7 pts).', 'Moi', 'Hugo: Deputy, +2 (7 pts).'],
    ['Moi remporte la partie avec 15 points.', 'Moi', 'You win the game with 15 points.'],
  ];
  for (const [fr, moi, en] of cas) assert.equal(ligneEnAnglais(fr, moi), en, fr);
});

test('aucune annonce d’une vraie partie ne reste en français', () => {
  let e = createGame([
    { id: 'moi', name: 'You' }, { id: 'a', name: 'Gina', isBot: true },
    { id: 'b', name: 'Hugo', isBot: true }, { id: 'c', name: 'Lila', isBot: true },
  ], 12345);
  const lignes = new Set<string>();
  for (let garde = 0; garde < 20000 && e.phase !== 'fin-de-partie'; garde++) {
    for (const l of e.log) lignes.add(l);
    e = e.phase === 'fin-de-manche'
      ? apply(e, { type: 'manche-suivante' })
      : apply(e, botAction(viewFor(e, e.order[e.turn]))!);
  }
  for (const l of e.log) lignes.add(l);
  const restees = [...lignes].map((l) => ligneEnAnglais(l, 'You'))
    .filter((l) => /\b(pose|passe|manche|série|coupe|échange|remporte|fini|termine)\b/.test(l));
  assert.deepEqual(restees, []);
});

test('chez un portail, la langue suit le navigateur, et l’anglais sert les autres', async () => {
  const { langueDuNavigateur } = await import('../src/web/portail.ts');
  assert.equal(langueDuNavigateur('fr-FR'), 'fr');
  assert.equal(langueDuNavigateur('fr'), 'fr');
  assert.equal(langueDuNavigateur('en-US'), 'en');
  assert.equal(langueDuNavigateur('de-DE'), 'en');
  assert.equal(langueDuNavigateur(undefined), 'en');
});

test('la page du portail : marquée, en anglais, sans lien vers le site', async () => {
  const { pagePortail } = await import('../scripts/page-portail.mjs');
  const gabarit = readFileSync('src/web/index.html', 'utf8').replace(/<!--EN-LIGNE[\s\S]*?EN-LIGNE-->\n?/, '');
  const page = pagePortail(gabarit);
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<body class="portail">/);
  assert.match(page, /window\.LARBIN_PORTAIL = true;<\/script>\s*<script>\/\*SCRIPT\*\//, 'la marque précède le script du jeu');
  assert.doesNotMatch(page, /href="\/|larbin\.vercel\.app|Trou du cul|Asshole/);
});

test('une invitation du portail ne mène qu’à un code de salon bien formé', async () => {
  const { codeDeLInvitation } = await import('../src/web/crazygames.ts');
  assert.equal(codeDeLInvitation({ salon: 'abcd' }), 'ABCD');
  assert.equal(codeDeLInvitation({ salon: ' Q7ZX ' }), 'Q7ZX');
  assert.equal(codeDeLInvitation({ salon: 'ABCDE' }), null);
  assert.equal(codeDeLInvitation({ salon: '<b>x' }), null);
  assert.equal(codeDeLInvitation({ autre: 'ABCD' }), null);
  assert.equal(codeDeLInvitation(null), null);
});
