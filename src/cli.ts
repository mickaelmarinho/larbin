/**
 * Le Larbin en terminal : vous contre trois bots.
 * Lancement :  npm run jouer
 *
 * C'est un banc d'essai du moteur de règles, pas l'interface finale — celle-ci
 * viendra en HTML, pensée pour le téléphone.
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { Card, GameState } from './engine/types.ts';
import { RegleViolee, apply, createGame, viewFor } from './engine/game.ts';
import { botAction } from './engine/bot.ts';
import { cardLabel, rankLabel, sortHand } from './engine/cards.ts';

const MOI = 'moi';
const C = {
  reset: '\x1b[0m', gras: '\x1b[1m', pale: '\x1b[2m',
  rouge: '\x1b[31m', vert: '\x1b[32m', jaune: '\x1b[33m', bleu: '\x1b[36m',
};

const rouge = (c: Card) => c.suit === '♥' || c.suit === '♦';
const carte = (c: Card) => (rouge(c) ? C.rouge : '') + cardLabel(c) + C.reset;
const main = (cards: Card[]) => sortHand(cards).map(carte).join(' ');

function afficher(state: GameState): void {
  const vue = viewFor(state, MOI);
  console.log('');
  console.log(`${C.gras}— Manche ${vue.round} —${C.reset}`);
  for (const o of vue.others) {
    const role = o.role ? ` ${C.pale}(${o.role})${C.reset}` : '';
    const etat = o.count === 0 ? `${C.vert}sorti ${o.finishedAt! + 1}e${C.reset}`
      : o.passed ? `${C.pale}a passé${C.reset}`
      : o.aAgi ? `${o.count} cartes ${C.pale}(a joué)${C.reset}`
      : `${o.count} cartes`;
    console.log(`  ${o.name}${role} : ${etat}`);
  }

  if (vue.pile.length > 0) {
    const dernier = vue.pile[vue.pile.length - 1];
    const nom = dernier.player === MOI
      ? 'Vous'
      : vue.others.find((o) => o.id === dernier.player)!.name;
    console.log(`  ${C.bleu}Sur la table :${C.reset} ${main(dernier.cards)}  ${C.pale}(${nom})${C.reset}`);
  } else {
    console.log(`  ${C.pale}Table vide : nouvelle série.${C.reset}`);
  }

  const monRole = vue.me.role ? ` ${C.pale}(${vue.me.role})${C.reset}` : '';
  console.log(`  ${C.gras}Votre main${C.reset}${monRole} : ${main(vue.me.hand)}`);
}

async function tourHumain(state: GameState, rl: readline.Interface): Promise<GameState> {
  const vue = viewFor(state, MOI);

  if (vue.coupe) {
    const taille = vue.coupe.taille;
    console.log(`\n${C.gras}À vous de couper.${C.reset} Les cartes ne sont pas mélangées :`);
    console.log('elles sont dans l\'ordre où elles sont tombées la manche dernière.');
    for (;;) {
      const rep = await rl.question(`Couper après combien de cartes ? (1 à ${taille - 1}) > `);
      const position = Number(rep.trim());
      if (Number.isInteger(position) && position >= 1 && position < taille) {
        return apply(state, { type: 'couper', player: MOI, position });
      }
      console.log(`${C.pale}Un nombre entre 1 et ${taille - 1}.${C.reset}`);
    }
  }

  afficher(state);
  const exigence = vue.requirement
    ? `${vue.requirement.count} carte(s) au-dessus de ${rankLabel(vue.requirement.rank)}`
    : 'ce que vous voulez';
  console.log(`${C.jaune}À vous${C.reset} — posez ${exigence}.`);

  if (vue.legal.length === 0) {
    console.log(`${C.pale}Vous ne pouvez pas monter : vous passez.${C.reset}`);
    return apply(state, { type: 'passer', player: MOI });
  }

  vue.legal.forEach((play, i) => {
    console.log(`   ${String(i + 1).padStart(2)}. ${main(play)}`);
  });
  if (vue.canPass) console.log(`    p. ${C.pale}passer${C.reset}`);

  for (;;) {
    const rep = (await rl.question('> ')).trim().toLowerCase();
    if (rep === 'p' && vue.canPass) return apply(state, { type: 'passer', player: MOI });
    const n = Number(rep);
    if (Number.isInteger(n) && n >= 1 && n <= vue.legal.length) {
      return apply(state, { type: 'poser', player: MOI, cards: vue.legal[n - 1].map((c) => c.id) });
    }
    console.log(`${C.pale}Tapez un numéro${vue.canPass ? ' ou "p"' : ''}.${C.reset}`);
  }
}

function tourBot(state: GameState, id: string): GameState {
  const action = botAction(viewFor(state, id));
  if (!action) throw new Error(`Le bot ${id} est bloqué.`);
  const suivant = apply(state, action);
  // Les échanges ne laissent pas de trace publique : rien à annoncer alors.
  if (suivant.log.length > state.log.length) {
    console.log(`  ${C.pale}${suivant.log[suivant.log.length - 1]}${C.reset}`);
  }
  return suivant;
}

function finDeManche(state: GameState): void {
  console.log(`\n${C.gras}Fin de la manche ${state.round}${C.reset}`);
  for (const id of state.finishOrder) {
    const p = state.players.find((x) => x.id === id)!;
    const nom = id === MOI ? 'Vous' : p.name;
    const marque = p.finishedOnTwo ? `  ${C.rouge}(fini sur un 2 !)${C.reset}` : '';
    const couleur = p.role === 'boss' ? C.vert : p.role === 'larbin' ? C.rouge : '';
    console.log(`  ${nom.padEnd(8)} ${couleur}${p.role}${C.reset}${marque}`);
  }
}

async function jouer(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  rl.on('close', () => process.exit(0));
  let state = createGame([
    { id: MOI, name: 'Vous' },
    { id: 'gina', name: 'Gina', isBot: true },
    { id: 'hugo', name: 'Hugo', isBot: true },
    { id: 'lila', name: 'Lila', isBot: true },
  ]);

  console.log(`${C.gras}Le Larbin${C.reset} — vous contre Gina, Hugo et Lila.`);

  try {
    for (;;) {
      if (state.phase === 'fin-de-partie') {
        finDeManche(state);
        const ordre = [...state.players].sort((a, b) => b.points - a.points);
        console.log(`\n${C.gras}Partie terminée${C.reset}`);
        for (const p of ordre) {
          const nom = p.id === MOI ? 'Vous' : p.name;
          console.log(`  ${nom.padEnd(8)} ${p.points} pt${p.points > 1 ? 's' : ''}`);
        }
        const suite = await rl.question('\nUne nouvelle partie ? (o/n) > ');
        if (suite.trim().toLowerCase().startsWith('n')) break;
        state = apply(state, { type: 'nouvelle-partie' });
        continue;
      }

      if (state.phase === 'fin-de-manche') {
        finDeManche(state);
        const suite = await rl.question('\nUne autre manche ? (o/n) > ');
        if (suite.trim().toLowerCase().startsWith('n')) break;
        state = apply(state, { type: 'manche-suivante' });
        continue;
      }

      const acteur = state.order[state.turn];

      try {
        state = acteur === MOI ? await tourHumain(state, rl) : tourBot(state, acteur);
      } catch (err) {
        if (!(err instanceof RegleViolee)) throw err;
        console.log(`${C.rouge}${err.message}${C.reset}`);
      }
    }
  } finally {
    rl.close();
  }
  console.log('\nÀ la prochaine !');
}

jouer();
