// Essai de bout en bout : une table que tous les humains ont quittée se met en
// pause, et reprend quand l'un d'eux revient.
//
//   node scripts/reseau/e2e-pause.mjs localhost:5177
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const HOTE = process.argv[2] ?? 'localhost:5177';
const local = HOTE.startsWith('localhost') || HOTE.startsWith('127.');
const WSP = local ? 'ws' : 'wss';
const PATIENCE = local ? 5000 : 25000;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const verifs = [];
const verifier = (ok, texte) => { verifs.push([ok, texte]); console.log(`${ok ? '  ok ' : '  ÉCHEC'}  ${texte}`); };

function joueur() {
  const ws = new WebSocket(`${WSP}://${HOTE}`);
  const j = { ws, vue: null, bienvenue: null };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'bienvenue') j.bienvenue = m;
    if (m.type === 'vue') j.vue = m.vue;
  });
  j.ouvert = new Promise((r) => ws.on('open', r));
  j.envoyer = async (m) => { await j.ouvert; ws.send(JSON.stringify(m)); };
  return j;
}

async function jusqua(cond, ms, pas = 100) {
  for (let t = 0; t < ms; t += pas) { if (cond()) return true; await attendre(pas); }
  return cond();
}

/** Ce qui bouge quand quelqu'un joue : le nombre de cartes de chacun, et le tour. */
const empreinte = (v) => JSON.stringify([v.round, v.turnPlayer, v.me.hand.length, v.others.map((o) => o.count)]);

// Une joueuse et trois bots, dans un salon privé.
const alice = joueur();
await alice.envoyer({ type: 'rejoindre', salon: '', nom: 'Alice' });
await jusqua(() => alice.bienvenue, PATIENCE);
for (let i = 0; i < 3; i++) await alice.envoyer({ type: 'ajouter-bot' });
await attendre(300);
await alice.envoyer({ type: 'demarrer' });
verifier(await jusqua(() => alice.vue?.phase === 'jeu', PATIENCE), 'la partie commence : Alice et trois bots');

// Alice part au moment où les bots ont la main : sans pause, ils joueraient.
await jusqua(() => alice.vue?.phase === 'jeu' && alice.vue.turnPlayer !== alice.vue.me.id, PATIENCE);
const { salon, jeton } = alice.bienvenue;
const avant = empreinte(alice.vue);
alice.ws.close();
await attendre(6000);

// Elle revient avec son jeton : elle retrouve la table exactement où elle l'a laissée.
const retour = joueur();
await retour.envoyer({ type: 'rejoindre', salon, nom: 'Alice', jeton });
await jusqua(() => retour.vue, PATIENCE);
verifier(retour.vue && empreinte(retour.vue) === avant,
  'personne à table pendant six secondes : rien n’a bougé');

// Et la table repart d'elle-même.
verifier(await jusqua(() => retour.vue && empreinte(retour.vue) !== avant, PATIENCE + 3000),
  'son retour relance la partie');

retour.ws.close();
const reussies = verifs.filter(([ok]) => ok).length;
console.log(`\n${reussies}/${verifs.length} vérifications réussies`);
process.exit(reussies === verifs.length ? 0 : 1);
