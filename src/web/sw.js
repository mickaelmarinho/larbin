// Le jeu sans réseau.
//
// Le solo et le défi du jour se jouent entièrement dans le téléphone : il leur
// manque seulement la page. Ce service worker en garde une copie, et la sert
// quand le réseau manque — dans le métro, en avion, ou quand la connexion
// flanche. Le jeu en ligne, lui, a besoin du serveur, et le dit.
//
// Réseau d'abord, copie en secours : avec du réseau, on reçoit toujours la
// dernière version ; la copie ne sert que sans lui. Chaque mise en ligne change
// VERSION (l'assemblage y met l'empreinte de la page), ce qui efface les copies
// de la version précédente.
const VERSION = '__VERSION__';
const CACHE = `larbin-${VERSION}`;
/** Ce qu'il faut pour ouvrir le jeu hors ligne : la page porte déjà son script et son style. */
const ESSENTIEL = ['/', '/en', '/manifest.webmanifest', '/en/manifest.webmanifest', '/icone-192.png', '/icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENTIEL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c.startsWith('larbin-') && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  const url = new URL(requete.url);
  // Seules nos pages et nos fichiers : jamais le serveur de parties, jamais les
  // compteurs, jamais ce qui n'est pas une simple lecture.
  if (requete.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/^\/(sante|tables|classement|defi|stats|compte)/.test(url.pathname) || url.pathname.startsWith('/_vercel/')) return;

  e.respondWith(
    fetch(requete)
      .then((reponse) => {
        if (reponse.ok && reponse.type === 'basic') {
          const copie = reponse.clone();
          // Une page ouverte avec ?defi ou ?via est la même page : une seule copie.
          const cle = requete.mode === 'navigate' ? new Request(url.origin + url.pathname) : requete;
          void caches.open(CACHE).then((c) => c.put(cle, copie));
        }
        return reponse;
      })
      .catch(async () => {
        const trouve = await caches.match(requete, { ignoreSearch: true });
        if (trouve) return trouve;
        // Une page jamais visitée, hors ligne : on ouvre le jeu, qui sait jouer sans
        // réseau — dans la langue de l'adresse demandée.
        if (requete.mode === 'navigate') {
          const accueil = /^\/en(\/|$)/.test(url.pathname) ? '/en' : '/';
          return (await caches.match(accueil)) ?? Response.error();
        }
        return Response.error();
      }),
  );
});
