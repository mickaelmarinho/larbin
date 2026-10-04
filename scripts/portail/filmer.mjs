// Filme une partie contre les bots dans Chrome sans écran, image par image.
//   node scripts/portail/filmer.mjs paysage 960 540 2 19
//   node scripts/portail/filmer.mjs portrait 480 720 2.25 19
// Les images vont dans portail/film/images-<nom>/, avec la liste que ffmpeg
// assemble (voir PORTAIL.md). Chrome doit être installé à son adresse habituelle.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(racine, 'package.json'));
const WebSocket = require('ws');

const [nom, L, H, echelle, secondes] = process.argv.slice(2);
const ici = path.join(racine, 'portail', 'film');
const dossier = path.join(ici, `images-${nom}`);
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(ici, 'profil-film-' + nom)}`,
  `--window-size=${L},${H}`, 'about:blank',
], { stdio: 'ignore' });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let cible = null;
for (let i = 0; i < 40 && !cible; i++) {
  await attendre(250);
  try {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    cible = pages.find((p) => p.type === 'page');
  } catch { /* pas encore prêt */ }
}
if (!cible) { chrome.kill(); throw new Error('Chrome ne répond pas'); }
const ws = new WebSocket(cible.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let id = 0; const attentes = new Map();
ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m.result ?? m); attentes.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; attentes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const js = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

await cdp('Emulation.setDeviceMetricsOverride', { width: +L, height: +H, deviceScaleFactor: +echelle, mobile: false });
await cdp('Page.enable');
await cdp('Page.navigate', { url: pathToFileURL(path.join(racine, 'portail', 'index.html')).href + '?lang=en' });
await attendre(2500);

// Lancer une partie contre les bots, puis laisser un joueur automatique tenir la main.
console.log(await js(`(async () => {
  try { localStorage.setItem('larbin.sons', 'coupes'); } catch {}
  document.getElementById('solo').click();
  await new Promise(r => setTimeout(r, 500));
  const v = document.getElementById('voile');
  if (!v.hidden) v.querySelector('.action.primaire')?.click();
  await new Promise(r => setTimeout(r, 400));
  let patience = 0;
  setInterval(() => {
    const voile = document.getElementById('voile');
    if (!voile.hidden) { voile.querySelector('.action.primaire')?.click(); return; }
    const jouables = [...document.querySelectorAll('.carte.jouable')];
    if (!jouables.length) { patience = 0; return; }
    const poser = document.getElementById('poser'), passer = document.getElementById('passer');
    if (!poser.disabled) { poser.click(); patience = 0; return; }
    const libres = jouables.filter(c => !c.classList.contains('choisie'));
    if (libres.length && patience < 4) { libres[libres.length - 1].click(); patience++; return; }
    if (!passer.disabled) { passer.click(); patience = 0; }
  }, 650);
  return 'partie lancée : ' + !document.getElementById('table').hidden;
})()`));

const debut = Date.now(); const temps = [];
while (Date.now() - debut < secondes * 1000) {
  const t = Date.now() - debut;
  const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  if (!data) continue;
  const fichier = `i${String(temps.length).padStart(5, '0')}.jpg`;
  writeFileSync(path.join(dossier, fichier), Buffer.from(data, 'base64'));
  temps.push([fichier, t]);
}
// La liste pour ffmpeg : chaque image dure jusqu'à la suivante.
const lignes = temps.map(([f, t], i) => `file '${f}'\nduration ${(((temps[i + 1]?.[1] ?? t + 80) - t) / 1000).toFixed(3)}`);
lignes.push(`file '${temps.at(-1)[0]}'`);
writeFileSync(path.join(dossier, 'liste.txt'), lignes.join('\n'));
console.log(`${temps.length} images en ${secondes} s`);
ws.close(); chrome.kill();
process.exit(0);
