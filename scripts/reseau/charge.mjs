// Test de charge : combien de tables le serveur tient-il en même temps ?
//
// On ouvre des salons privés de quatre joueurs simulés, par paliers, et on
// mesure le temps que met le serveur à répondre à chaque coup. Les joueurs
// jouent comme le bot du jeu, mais au rythme d'un humain (1,5 à 3 s par coup).
//
// Pour ne rien fausser : les tables s'arrêtent d'elles-mêmes après la
// troisième manche (une partie en demande au moins cinq), donc aucune partie de
// test ne se termine ni n'entre aux compteurs ; et une table quittée se met en
// pause côté serveur.
//
//   node scripts/reseau/charge.mjs localhost:5177 --paliers 10,20,40 --duree 40
//   node scripts/reseau/charge.mjs localhost:5177 --pid 1234   (mesure aussi le processeur du serveur)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

import { botAction } from '../../src/engine/bot.ts';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const HOTE = process.argv[2] ?? 'localhost:5177';
const option = (nom, defaut) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i > 0 ? process.argv[i + 1] : defaut;
};
const PALIERS = option('paliers', '5,10,20').split(',').map(Number);
const DUREE = Number(option('duree', '40')) * 1000;
const PID = option('pid', null);
const SEUIL = 1000;         // au-delà d'une seconde de réponse, un joueur le sent
const MANCHES_MAX = 3;

const local = HOTE.startsWith('localhost') || HOTE.startsWith('127.');
const WSP = local ? 'ws' : 'wss';
const HTTP = local ? 'http' : 'https';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const hasard = (min, max) => min + Math.random() * (max - min);

/* ------------------------------------------------------------ les mesures */

let latences = [];
let coups = 0;
let erreurs = [];
let coupures = 0;

const quantile = (liste, q) => {
  if (liste.length === 0) return 0;
  const tri = [...liste].sort((a, b) => a - b);
  return Math.round(tri[Math.min(tri.length - 1, Math.floor(q * tri.length))]);
};

/** Le temps processeur cumulé du serveur, en secondes (Windows). */
function cpuDuServeur() {
  if (!PID) return null;
  const sortie = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${PID}).CPU`]);
  return Number(String(sortie).trim().replace(',', '.'));
}

/* ------------------------------------------------------------ un joueur */

const tous = [];

function joueur(nom) {
  const ws = new WebSocket(`${WSP}://${HOTE}`);
  const j = { ws, nom, vue: null, salon: null, moi: null, prevu: false, envoye: 0, fini: false, manchesLancees: new Set() };
  tous.push(j);

  const jouerSiBesoin = () => {
    if (j.prevu || j.fini || !j.vue) return;
    const v = j.vue;
    if (v.phase === 'fin-de-manche' && j.hote && !j.manchesLancees.has(v.round)) {
      j.manchesLancees.add(v.round);
      if (v.round >= MANCHES_MAX) return;   // on s'arrête avant qu'une partie puisse finir
      j.prevu = true;
      setTimeout(() => { j.prevu = false; envoyer(j, { type: 'action', action: { type: 'manche-suivante' } }); }, 3000);
      return;
    }
    if (!botAction(v)) return;
    j.prevu = true;
    setTimeout(() => {
      j.prevu = false;
      const action = j.vue && botAction(j.vue);
      if (!action || j.fini) return;
      envoyer(j, { type: 'action', action });
    }, hasard(1500, 3000));
  };

  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'bienvenue') { j.moi = m.moi; j.code = m.salon; }
    if (m.type === 'salon') j.salon = m.etat;
    if (m.type === 'erreur') erreurs.push(m.message);
    if (m.type === 'vue') {
      if (j.envoye) {
        latences.push(Date.now() - j.envoye);
        j.envoye = 0;
      }
      j.vue = m.vue;
      jouerSiBesoin();
    }
  });
  ws.on('close', () => { if (!j.fini) coupures += 1; });
  ws.on('error', () => {});
  j.ouvert = new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  return j;
}

function envoyer(j, message) {
  if (j.ws.readyState !== WebSocket.OPEN) return;
  if (message.type === 'action') {
    j.envoye = Date.now();
    coups += 1;
  }
  j.ws.send(JSON.stringify(message));
}

async function jusqua(cond, ms, pas = 100) {
  for (let t = 0; t < ms; t += pas) { if (cond()) return true; await attendre(pas); }
  return cond();
}

/** Une table de quatre : l'hôte ouvre un salon privé, trois amis le rejoignent, on démarre. */
async function ouvrirUneTable(n) {
  const hote = joueur(`Charge${n}`);
  hote.hote = true;
  await hote.ouvert;
  envoyer(hote, { type: 'rejoindre', salon: '', nom: `Charge${n}` });
  if (!await jusqua(() => hote.code, 15000)) throw new Error('pas de salon');
  const amis = [1, 2, 3].map((k) => joueur(`Charge${n}x${k}`));
  for (const a of amis) {
    await a.ouvert;
    envoyer(a, { type: 'rejoindre', salon: hote.code, nom: a.nom });
  }
  await jusqua(() => hote.salon?.sieges.length === 4, 15000);
  envoyer(hote, { type: 'demarrer' });
}

/* ------------------------------------------------------------ le test */

async function santeEnMs() {
  const debut = Date.now();
  try {
    await fetch(`${HTTP}://${HOTE}/sante`, { cache: 'no-store' });
    return Date.now() - debut;
  } catch {
    return null;
  }
}

console.log(`Test de charge sur ${HOTE} — paliers ${PALIERS.join(', ')} tables, ${DUREE / 1000} s chacun\n`);
console.log('tables  connexions  coups/s  réponse médiane  95 %   pire   /sante   processeur  erreurs');

let ouvertes = 0;
for (const palier of PALIERS) {
  while (ouvertes < palier) {
    ouvertes += 1;
    try {
      await ouvrirUneTable(ouvertes);
    } catch (err) {
      erreurs.push(`table ${ouvertes} : ${err.message}`);
    }
    await attendre(150);
  }
  await attendre(5000);   // le temps que tout le monde soit lancé

  latences = [];
  coups = 0;
  const santes = [];
  const cpuAvant = cpuDuServeur();
  const debut = Date.now();
  while (Date.now() - debut < DUREE) {
    const s = await santeEnMs();
    if (s !== null) santes.push(s);
    await attendre(3000);
  }
  const secondes = (Date.now() - debut) / 1000;
  const cpuApres = cpuDuServeur();
  const cpu = cpuAvant === null ? '—' : `${Math.round(((cpuApres - cpuAvant) / secondes) * 100)} %`;

  const p95 = quantile(latences, 0.95);
  console.log([
    String(palier).padStart(6),
    String(tous.filter((j) => j.ws.readyState === WebSocket.OPEN).length).padStart(11),
    (coups / secondes).toFixed(1).padStart(8),
    `${quantile(latences, 0.5)} ms`.padStart(16),
    `${p95} ms`.padStart(7),
    `${quantile(latences, 1)} ms`.padStart(7),
    `${quantile(santes, 0.5)} ms`.padStart(8),
    cpu.padStart(11),
    String(erreurs.length + coupures).padStart(8),
  ].join(' '));

  if (p95 > SEUIL || coupures > 0) {
    console.log(`\nArrêt : ${p95 > SEUIL ? `95 % des réponses au-delà de ${SEUIL} ms` : `${coupures} connexions coupées`}.`);
    break;
  }
}

if (erreurs.length) console.log(`\nErreurs (${erreurs.length}) :`, [...new Set(erreurs)].slice(0, 5));
for (const j of tous) { j.fini = true; j.ws.close(); }
await attendre(500);
process.exit(0);
