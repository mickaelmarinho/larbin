// Essai de bout en bout : la liste des tables publiques, et la reprise d'un
// siège tenu par un bot dans une partie déjà commencée.
//
//   node scripts/reseau/e2e-tables.mjs localhost:5177
//   node scripts/reseau/e2e-tables.mjs p01--larbin--xp64cmfbzy56.code.run
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const HOTE = process.argv[2] ?? 'localhost:5177';
const local = HOTE.startsWith('localhost') || HOTE.startsWith('127.');
const WSP = local ? 'ws' : 'wss';
const HTTP = local ? 'http' : 'https';
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
  v.public = async () => { await v.pret; ws.send(JSON.stringify({ type: 'rejoindre-public', nom })); };
  v.rejoindre = async (code) => { await v.pret; ws.send(JSON.stringify({ type: 'rejoindre', salon: code, nom })); };
  v.direPret = (oui) => ws.send(JSON.stringify({ type: 'pret', pret: oui }));
  v.demarrer = () => ws.send(JSON.stringify({ type: 'demarrer' }));
  v.bot = () => ws.send(JSON.stringify({ type: 'ajouter-bot' }));
  return v;
}

async function jusqua(cond, ms, pas = 100) {
  for (let t = 0; t < ms; t += pas) { if (await cond()) return true; await attendre(pas); }
  return await cond();
}

const tables = async () => (await fetch(`${HTTP}://${HOTE}/tables`, { cache: 'no-store' })).json();
const laTable = async (code) => (await tables()).find((t) => t.code === code);

/* ------------------------------------------- une table publique se voit du dehors */

const alice = visiteur('Alice');
await alice.public();
await jusqua(() => alice.salon, 5000);
const code = alice.salon.code;

verifier(await jusqua(async () => !!(await laTable(code)), 5000),
  `la table d’Alice apparaît dans la liste publique (${code})`);
let vue = await laTable(code);
verifier(vue?.joueurs === 1 && vue?.bots === 0, `un joueur, aucun bot`);
verifier(vue?.prets === 0 && vue?.commencee === false, 'personne de prêt, rien de commencé');
verifier(vue?.libre === true, 'on peut s’y asseoir');

alice.direPret(true);
verifier(await jusqua(async () => (await laTable(code))?.prets === 1, 3000),
  'la liste montre qu’elle s’est dite prête');

/* ------------------------------------ une partie en cours reste visible, et joignable */

alice.demarrer();
verifier(await jusqua(() => alice.vue, 5000), 'elle commence avec des bots');
vue = await laTable(code);
verifier(vue?.commencee === true && vue?.manche === 1, `partie en cours, manche ${vue?.manche}`);
verifier(vue?.joueurs === 1 && vue?.bots === 3, 'une humaine et trois bots');
verifier(vue?.libre === true, 'un siège de bot est à prendre');

const bruno = visiteur('Bruno');
await bruno.rejoindre(code);
verifier(await jusqua(() => bruno.vue, 5000), 'Bruno prend la place d’un bot et joue tout de suite');
verifier((bruno.vue?.me.hand.length ?? 0) > 0,
  `il hérite de la main du bot (${bruno.vue?.me.hand.length} cartes)`);
verifier(await jusqua(async () => (await laTable(code))?.bots === 2, 5000),
  'la liste ne compte plus que deux bots');
verifier(await jusqua(() => alice.salon?.sieges.some((s) => s.nom === 'Bruno' && !s.estBot), 5000),
  'Alice voit Bruno à la place de la machine');
verifier(!JSON.stringify(bruno.vue?.others ?? []).includes('suit'),
  'il ne voit pas les cartes des autres pour autant');

/* ------------------------------------------------- on choisit de jouer à six */

const gaston = visiteur('Gaston');
await gaston.public();
await jusqua(() => gaston.salon, 5000);
const codeSix = gaston.salon.code;
verifier(gaston.salon?.taille === 4, 'une table naît à quatre');

gaston.ws.send(JSON.stringify({ type: 'taille', taille: 6 }));
verifier(await jusqua(() => gaston.salon?.taille === 6, 3000), 'Gaston la passe à six');
verifier((await laTable(codeSix))?.taille === 6, 'la liste publique l’annonce à six');

gaston.demarrer();
verifier(await jusqua(() => gaston.vue, 5000), 'la partie part');
verifier(gaston.salon?.sieges.length === 6,
  `six places, dont ${gaston.salon?.sieges.filter((s) => s.estBot).length} bots`);
verifier((gaston.vue?.others.length ?? 0) === 5, 'cinq adversaires autour de la table');
verifier((gaston.vue?.me.hand.length ?? 0) > 0,
  `les 52 cartes sont réparties (${gaston.vue?.me.hand.length} en main)`);

/* ------------------------------------------- un salon privé reste privé */

const hote = visiteur('Hôte');
await hote.public();          // on ouvre d'abord une table publique…
await jusqua(() => hote.salon, 5000);
const prive = visiteur('Privé');
await prive.rejoindre('');    // …puis un salon privé, code vide
await jusqua(() => prive.salon, 5000);
const codePrive = prive.salon.code;
verifier(prive.salon?.publique === false, `salon privé ouvert (${codePrive})`);
for (let i = 0; i < 3; i++) prive.bot();
await jusqua(() => prive.salon?.sieges.length === 4, 5000);
prive.demarrer();
verifier(await jusqua(() => prive.vue, 5000), 'la partie privée démarre');
verifier((await tables()).every((t) => t.code !== codePrive), 'il n’apparaît pas dans la liste publique');

const intrus = visiteur('Intrus');
await intrus.rejoindre(codePrive);
verifier(await jusqua(() => intrus.erreurs.length > 0, 5000),
  `un inconnu ne s’y invite pas : « ${intrus.erreurs[0] ?? '—'} »`);
verifier(intrus.vue === null, 'et il ne reçoit aucune carte');

/* --------------------------- une table dont tout le monde est parti n'est plus montrée */

alice.ws.close();
bruno.ws.close();
verifier(await jusqua(async () => !(await laTable(code)), PATIENCE, 400),
  'la table quittée par tous disparaît de la liste');

for (const v of [hote, prive, intrus]) v.ws.close();
await attendre(300);
const echecs = verifs.filter(([ok]) => !ok).length;
console.log(`\n${verifs.length - echecs}/${verifs.length} vérifications réussies`);
process.exit(echecs ? 1 : 0);
