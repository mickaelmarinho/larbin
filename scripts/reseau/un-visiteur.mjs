// Un visiteur qui s'assoit à une table publique et y reste, le temps qu'on
// regarde la liste depuis le navigateur.
//
//   node scripts/reseau/un-visiteur.mjs [hôte] [secondes] [--pret]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const HOTE = process.argv[2] ?? 'localhost:5177';
const SECONDES = Number(process.argv[3]) || 60;
const PRET = process.argv.includes('--pret');
const local = HOTE.startsWith('localhost') || HOTE.startsWith('127.');

const ws = new WebSocket(`${local ? 'ws' : 'wss'}://${HOTE}`);
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'rejoindre-public', nom: 'Aurélie' }));
  if (PRET) setTimeout(() => ws.send(JSON.stringify({ type: 'pret', pret: true })), 500);
});
ws.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.type === 'salon') console.log(`table ${m.etat.code} — ${m.etat.sieges.length} siège(s), départ ${m.etat.departDans}`);
  if (m.type === 'erreur') console.log('erreur :', m.message);
});
setTimeout(() => { ws.close(); console.log('Aurélie s’en va.'); }, SECONDES * 1000);
