// Essai de bout en bout : un joueur présent mais muet ne bloque pas la table.
// Elle doit finir par jouer pour lui, après l'avoir annoncé.
//
//   node scripts/reseau/e2e-inactif.mjs localhost:5177
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const HOTE = process.argv[2] ?? 'localhost:5177';
const local = HOTE.startsWith('localhost') || HOTE.startsWith('127.');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const verifs = [];
const verifier = (ok, texte) => { verifs.push([ok, texte]); console.log(`${ok ? '  ok ' : '  ÉCHEC'}  ${texte}`); };

const ws = new WebSocket(`${local ? 'ws' : 'wss'}://${HOTE}`);
const etat = { salon: null, vue: null, erreurs: [] };
ws.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.type === 'salon') etat.salon = m.etat;
  if (m.type === 'vue') etat.vue = m.vue;
  if (m.type === 'erreur') etat.erreurs.push(m.message);
});
await new Promise((r) => ws.on('open', r));

async function jusqua(cond, ms, pas = 200) {
  for (let t = 0; t < ms; t += pas) { if (await cond()) return true; await attendre(pas); }
  return await cond();
}

ws.send(JSON.stringify({ type: 'rejoindre-public', nom: 'Muette' }));
await jusqua(() => etat.salon, 5000);
ws.send(JSON.stringify({ type: 'demarrer' }));
verifier(await jusqua(() => etat.vue, 5000), 'la partie commence, trois bots et elle');

// Les bots jouent en quelques secondes ; ensuite la table l'attend.
const sonTour = await jusqua(() => etat.vue?.turnPlayer === etat.vue?.me.id, 30000);
verifier(sonTour, 'son tour arrive');

const avant = etat.vue.me.hand.length;
const annonce = etat.salon?.delaiPourJouer;
verifier(annonce > 50000 && annonce <= 60000,
  `la table annonce le temps qui lui reste (${annonce} ms)`);

// Elle ne fait rien. Personne ne peut l'appeler : c'est à la table d'agir.
console.log(`  … on attend sans rien jouer (${avant} cartes en main)`);
const reprise = await jusqua(
  () => etat.vue.me.hand.length !== avant || etat.vue.turnPlayer !== etat.vue.me.id,
  90000,
  1000,
);
verifier(reprise, 'la table finit par jouer pour elle, et la partie repart');
verifier(etat.erreurs.length === 0,
  `aucune erreur reçue${etat.erreurs.length ? ' : ' + etat.erreurs.join(' | ') : ''}`);

ws.close();
await attendre(300);
const echecs = verifs.filter(([ok]) => !ok).length;
console.log(`\n${verifs.length - echecs}/${verifs.length} vérifications réussies`);
process.exit(echecs ? 1 : 0);
