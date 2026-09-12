// Essai de bout en bout des tables publiques contre un vrai serveur.
//
//   node scripts/reseau/e2e-publique.mjs localhost:5177
//   node scripts/reseau/e2e-publique.mjs p01--larbin--xp64cmfbzy56.code.run
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const HOTE = process.argv[2] ?? 'localhost:5177';
// En local on parle en clair ; ailleurs, l'hébergeur impose le chiffrement.
const local = HOTE.startsWith('localhost') || HOTE.startsWith('127.');
const WSP = local ? 'ws' : 'wss';
const HTTP = local ? 'http' : 'https';
// Derrière un hébergeur lointain, la fermeture d'une socket met une dizaine de
// secondes à remonter : on observe, on ne parie pas sur un délai.
const PATIENCE = local ? 5000 : 25000;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const verifs = [];
const verifier = (ok, texte) => { verifs.push([ok, texte]); console.log(`${ok ? '  ok ' : '  ÉCHEC'}  ${texte}`); };

function visiteur(nom) {
  const ws = new WebSocket(`${WSP}://${HOTE}`);
  const v = { nom, ws, salon: null, vue: null, erreurs: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'salon') v.salon = m.etat;
    if (m.type === 'vue') v.vue = m.vue;
    if (m.type === 'erreur') v.erreurs.push(m.message);
  });
  v.pret = new Promise((r) => ws.on('open', r));
  v.entrer = async () => { await v.pret; ws.send(JSON.stringify({ type: 'rejoindre-public', nom })); };
  v.direPret = (oui) => ws.send(JSON.stringify({ type: 'pret', pret: oui }));
  v.demarrer = () => ws.send(JSON.stringify({ type: 'demarrer' }));
  v.siege = () => v.salon?.sieges.find((s) => s.nom.startsWith(nom.slice(0, 5)));
  return v;
}

// `await` même sur une condition synchrone : sans lui, une condition asynchrone
// renverrait une promesse, toujours vraie, et l'essai dirait oui à tout.
async function jusqua(cond, ms, pas = 100) {
  for (let t = 0; t < ms; t += pas) { if (await cond()) return true; await attendre(pas); }
  return await cond();
}

const sante = async () => (await fetch(`${HTTP}://${HOTE}/sante`, { cache: 'no-store' })).json();

const avant = await sante();

/* ----------------------------- personne ne part sans l'accord de l'assemblée */

const alice = visiteur('Alice<img src=x onerror=alert(1)>');
await alice.entrer();
await jusqua(() => alice.salon, 5000);
verifier(alice.salon?.publique === true, `Alice est à une table publique (${alice.salon?.code})`);
verifier(alice.salon?.sieges.length === 1, 'elle y est seule');
verifier(alice.salon?.departDans === null, 'rien ne la presse tant qu’elle ne s’est pas dite prête');
verifier(alice.salon?.sieges[0]?.pret === false, 'et elle arrive « pas prête »');
verifier(!/[<>=()]/.test(alice.salon?.sieges[0]?.nom ?? '<'),
  `son nom piégé a été nettoyé : « ${alice.salon?.sieges[0]?.nom} »`);
verifier(alice.salon?.sieges.every((s) => !s.hote), 'personne n’est hôte');
verifier(await jusqua(async () => (await sante()).enAttente >= 1, 3000),
  'le serveur annonce qu’un visiteur attend');

await attendre(3000);
verifier(alice.vue === null && alice.salon?.commencee === false,
  'trois secondes plus tard, la partie n’est toujours pas partie sans elle');

alice.direPret(true);
verifier(await jusqua(() => alice.salon?.departDans > 15000, 3000),
  `prête et seule, elle lance le compte à rebours (${alice.salon?.departDans} ms)`);

alice.direPret(false);
verifier(await jusqua(() => alice.salon?.departDans === null, 3000),
  'elle se dédit, le compte à rebours s’arrête');
alice.direPret(true);
await jusqua(() => alice.salon?.departDans > 0, 3000);

/* --------------------------- un nouveau venu n'a rien promis : tout s'arrête */

const bruno = visiteur('Bruno');
await bruno.entrer();
await jusqua(() => bruno.salon && alice.salon.sieges.length === 2, 5000);
verifier(bruno.salon?.code === alice.salon?.code, `Bruno rejoint la même table (${bruno.salon?.code})`);
verifier(alice.salon?.departDans === null,
  'son arrivée arrête le compte à rebours : il n’a rien promis');
verifier(alice.siege()?.pret === true, 'Alice, elle, est toujours prête');

bruno.direPret(true);
verifier(await jusqua(() => alice.salon?.departDans > 15000, 3000),
  `il se dit prêt, le départ est relancé (${alice.salon?.departDans} ms)`);

const demarre = await jusqua(() => alice.vue && bruno.vue, 25000);
verifier(demarre, 'la partie démarre au bout du compte à rebours');
verifier(alice.salon?.sieges.length === 4, `quatre places (${alice.salon?.sieges.map((s) => s.nom).join(', ')})`);
verifier(alice.salon?.sieges.filter((s) => s.estBot).length === 2, 'deux bots complètent les deux humains');
verifier(alice.vue?.me.hand.length === 13, 'chacun a reçu ses 13 cartes');
verifier(!JSON.stringify(alice.vue?.others ?? []).includes('suit'), 'Alice ne voit pas les cartes des autres');

/* --------------------------------------- commencer sans attendre l'accord de personne */

const diane = visiteur('Diane');
await diane.entrer();
await jusqua(() => diane.salon, 5000);
verifier(diane.salon?.code !== alice.salon?.code,
  `Diane, arrivée après le départ, obtient une nouvelle table (${diane.salon?.code})`);
diane.demarrer();
verifier(await jusqua(() => diane.vue, 5000), 'elle commence avec des bots quand elle le décide');
verifier(diane.salon?.sieges.filter((s) => s.estBot).length === 3, 'trois bots l’accompagnent');

/* ------------------- le départ d'un joueur peut faire l'accord de ceux qui restent */

const elise = visiteur('Élise');
const felix = visiteur('Félix');
await elise.entrer();
await jusqua(() => elise.salon, 5000);
await felix.entrer();
await jusqua(() => felix.salon && elise.salon.sieges.length === 2, 5000);
elise.direPret(true);
await attendre(1000);
verifier(elise.salon?.departDans === null, 'Élise prête, Félix muet : rien ne part');

felix.ws.close();
const t0 = Date.now();
verifier(await jusqua(() => elise.salon?.sieges.length === 1 && elise.salon?.departDans > 0, PATIENCE, 250),
  `Félix parti, l’accord d’Élise suffit et le départ s’enclenche (${Date.now() - t0} ms)`);

elise.direPret(false);
verifier(await jusqua(() => elise.salon?.departDans === null, 5000),
  'elle se dédit à temps et reprend son attente');

const pendant = (await sante()).salons;
elise.ws.close();
verifier(await jusqua(async () => (await sante()).salons === pendant - 1, PATIENCE, 400),
  `la table vidée disparaît (${pendant} → ${(await sante()).salons})`);

const erreurs = [...alice.erreurs, ...bruno.erreurs, ...diane.erreurs, ...elise.erreurs];
verifier(erreurs.length === 0, `aucune erreur reçue${erreurs.length ? ' : ' + erreurs.join(' | ') : ''}`);

for (const v of [alice, bruno, diane]) v.ws.close();
await attendre(300);
const echecs = verifs.filter(([ok]) => !ok).length;
console.log(`\n${verifs.length - echecs}/${verifs.length} vérifications réussies (salons au départ : ${avant.salons})`);
process.exit(echecs ? 1 : 0);
