// Essai de bout en bout : les réactions lancées à table. Elles vont à toute la
// table et à elle seule, ne sortent que de la liste permise, et ne se
// mitraillent pas.
//
//   node scripts/reseau/e2e-reactions.mjs localhost:5177
//   node scripts/reseau/e2e-reactions.mjs p01--larbin--xp64cmfbzy56.code.run
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

function visiteur(nom) {
  const ws = new WebSocket(`${WSP}://${HOTE}`);
  const v = { nom, ws, moi: null, salon: null, vue: null, erreurs: [], reactions: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'bienvenue') v.moi = m.moi;
    if (m.type === 'salon') v.salon = m.etat;
    if (m.type === 'vue') v.vue = m.vue;
    if (m.type === 'erreur') v.erreurs.push(m.message);
    if (m.type === 'reaction') v.reactions.push(m);
  });
  v.pret = new Promise((r) => ws.on('open', r));
  v.public = async () => { await v.pret; ws.send(JSON.stringify({ type: 'rejoindre-public', nom })); };
  v.rejoindre = async (code) => { await v.pret; ws.send(JSON.stringify({ type: 'rejoindre', salon: code, nom })); };
  v.demarrer = () => ws.send(JSON.stringify({ type: 'demarrer' }));
  v.reagir = async (reaction) => { await v.pret; ws.send(JSON.stringify({ type: 'reaction', reaction })); };
  return v;
}

async function jusqua(cond, ms, pas = 100) {
  for (let t = 0; t < ms; t += pas) { if (await cond()) return true; await attendre(pas); }
  return await cond();
}

/* ------------------------------------------------ deux inconnus à la même table */

const alice = visiteur('Alice');
await alice.public();
await jusqua(() => alice.salon, PATIENCE);
const bruno = visiteur('Bruno');
await bruno.public();
await jusqua(() => bruno.salon, PATIENCE);
verifier(alice.salon && bruno.salon?.code === alice.salon.code,
  `Alice et Bruno sont à la même table (${alice.salon?.code})`);

// Une autre table, qui ne doit rien entendre de la leur.
const carla = visiteur('Carla');
await carla.rejoindre('');
await jusqua(() => carla.salon, PATIENCE);
verifier(carla.salon && carla.salon.code !== alice.salon.code, `Carla est dans un autre salon (${carla.salon?.code})`);

alice.demarrer();
verifier(await jusqua(() => alice.vue && bruno.vue, PATIENCE), 'la partie commence');

/* ------------------------------------------------------------------ réagir */

await alice.reagir('👏');
verifier(await jusqua(() => bruno.reactions.length === 1, PATIENCE), 'Bruno voit la réaction d’Alice');
verifier(bruno.reactions[0]?.reaction === '👏' && bruno.reactions[0]?.de === alice.moi,
  'avec la bonne émoticône, et le bon auteur');
verifier(await jusqua(() => alice.reactions.length === 1, PATIENCE), 'Alice la voit aussi, au-dessus de sa ligne');

await alice.reagir('😂');
await attendre(local ? 600 : 2500);
verifier(bruno.reactions.length === 1, 'une seconde réaction trop rapprochée est ignorée');
verifier(alice.erreurs.length === 0, 'sans message d’erreur pour autant');

await attendre(1600);
await alice.reagir('🔥');
verifier(await jusqua(() => bruno.reactions.length === 2, PATIENCE), 'passé le délai, la suivante passe');

await bruno.reagir('<b>coucou</b>');
verifier(await jusqua(() => bruno.erreurs.length > 0, PATIENCE), `un texte libre est refusé : « ${bruno.erreurs[0]} »`);
await attendre(local ? 300 : 1500);
verifier(alice.reactions.length === 2, 'et Alice n’en reçoit rien');

verifier(carla.reactions.length === 0, 'Carla, à une autre table, n’a rien entendu');

const intrus = visiteur('Intrus');
await intrus.reagir('👍');
verifier(await jusqua(() => intrus.erreurs.length > 0, PATIENCE), `qui n’est assis nulle part ne réagit pas : « ${intrus.erreurs[0]} »`);
verifier(alice.reactions.length === 2 && bruno.reactions.length === 2, 'et personne ne l’a vu');

for (const v of [alice, bruno, carla, intrus]) v.ws.close();

const reussies = verifs.filter(([ok]) => ok).length;
console.log(`\n${reussies}/${verifs.length} vérifications réussies`);
process.exit(reussies === verifs.length ? 0 : 1);
