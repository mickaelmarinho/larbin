// Essai de bout en bout : les comptes. On en crée un, on s'assoit avec à une
// table publique, un invité tente de prendre le même pseudo, puis on efface
// tout.
//
//   node scripts/reseau/e2e-comptes.mjs localhost:5177
//   node scripts/reseau/e2e-comptes.mjs p01--larbin--xp64cmfbzy56.code.run
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

async function appeler(chemin, corps, jeton) {
  const entetes = {};
  if (corps !== undefined) entetes['Content-Type'] = 'application/json';
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  const r = await fetch(`${HTTP}://${HOTE}${chemin}`, {
    method: corps === undefined ? 'GET' : 'POST', headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  return { statut: r.status, corps: texte ? JSON.parse(texte) : null };
}

function visiteur(message) {
  const ws = new WebSocket(`${WSP}://${HOTE}`);
  const v = { ws, moi: null, salon: null };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'bienvenue') v.moi = m.moi;
    if (m.type === 'salon') v.salon = m.etat;
  });
  ws.on('open', () => ws.send(JSON.stringify(message)));
  return v;
}

async function jusqua(cond, ms, pas = 100) {
  for (let t = 0; t < ms; t += pas) { if (await cond()) return true; await attendre(pas); }
  return await cond();
}

const pseudo = `Essai${Math.floor(Math.random() * 90000) + 10000}`;

const cree = await appeler('/compte/creer', { pseudo });
verifier(cree.statut === 201 && /^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/.test(cree.corps?.code ?? ''),
  `compte « ${pseudo} » créé, avec un code secret (statut ${cree.statut})`);
const jeton = cree.corps?.jeton;

const synchro = await appeler('/compte/synchro', { succes: [{ id: 'premiere-victoire', date: '2026-09-14', verifie: true }], avatar: '🐙' }, jeton);
verifier(synchro.statut === 200 && synchro.corps.donnees.succes[0]?.verifie === false,
  'un succès envoyé par le navigateur est gardé, mais pas « vérifié »');

const connexion = await appeler('/compte/connexion', { pseudo: pseudo.toLowerCase(), code: cree.corps?.code });
verifier(connexion.statut === 200, 'on se reconnecte avec le pseudo et le code');

const compte = visiteur({ type: 'rejoindre-public', nom: 'Surnom', avatar: '🐙', session: jeton });
await jusqua(() => compte.salon, PATIENCE);
const monSiege = () => compte.salon?.sieges.find((s) => s.id === compte.moi);
verifier(monSiege()?.nom === pseudo && monSiege()?.compte === true, `à table, le compte joue sous son pseudo (${monSiege()?.nom})`);

const imposteur = visiteur({ type: 'rejoindre-public', nom: pseudo, avatar: '🦊' });
await jusqua(() => imposteur.salon && imposteur.moi, PATIENCE);
await jusqua(() => compte.salon?.sieges.length === 2, PATIENCE);
const sonSiege = compte.salon?.sieges.find((s) => s.id === imposteur.moi);
verifier(sonSiege && sonSiege.nom !== pseudo && sonSiege.compte === false,
  `un invité ne peut pas prendre ce pseudo (il devient « ${sonSiege?.nom} »)`);

const classement = await appeler('/classement');
verifier(classement.statut === 200 && Array.isArray(classement.corps), 'le classement répond');

compte.ws.close();
imposteur.ws.close();

const supprime = await appeler('/compte/supprimer', {}, jeton);
verifier(supprime.statut === 204, 'le compte est supprimé');
verifier((await appeler('/compte', undefined, jeton)).statut === 401, 'sa session ne vaut plus rien');

const reussies = verifs.filter(([ok]) => ok).length;
console.log(`\n${reussies}/${verifs.length} vérifications réussies`);
process.exit(reussies === verifs.length ? 0 : 1);
