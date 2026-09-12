/**
 * Le serveur du Larbin : il sert la page, et il arbitre les parties.
 *
 *   node src/reseau/serveur.ts
 *
 * Un seul processus fait tout — fichiers statiques et WebSocket sur le même
 * port — pour qu'il tourne tel quel n'importe où : sur ce PC, sur un petit
 * hébergeur, ou derrière un nom de domaine.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

import { MAX_JOUEURS, RegleViolee } from '../engine/game.ts';
import { codeDeSalon, codeValide, nomPropre, type VersClient, type VersServeur } from './protocole.ts';
import { Salon, tablePubliqueOuverte } from './salon.ts';

const racine = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
/**
 * On ne sert que le site assemblé, jamais le dépôt : sinon le moteur, les tests
 * et node_modules seraient téléchargeables depuis l'adresse publique. Lancez
 * `npm run build` avant le serveur.
 */
const SITE = path.join(racine, 'public');
const PORT = Number(process.env.PORT) || 5177;

/** Temps de réflexion des bots : la table doit rester lisible. */
const REFLEXION = 800;
/** Au-delà, on joue à la place d'un joueur déconnecté pour ne pas bloquer les autres. */
const PATIENCE_DECONNEXION = 25_000;
/** Un salon vide finit par être oublié. */
const OUBLI = 2 * 60 * 60 * 1000;
/**
 * Le compte à rebours d'une table publique. Assez long pour qu'un deuxième
 * visiteur ait une chance de s'asseoir, assez court pour que le premier ne
 * reparte pas avant d'avoir joué.
 */
const ATTENTE_PUBLIQUE = 20_000;

/* Garde-fous, pour le jour où l'adresse sera publique. */
const MAX_SALONS = 300;
const TAILLE_MAX_MESSAGE = 16 * 1024;
/** Un joueur clique ; il ne mitraille pas. Au-delà, on ferme. */
const MESSAGES_MAX = 60;
const FENETRE_MESSAGES = 5_000;

const salons = new Map<string, Salon>();
/** À quel salon et à quelle place appartient chaque connexion ouverte. */
const connexions = new Map<WebSocket, { salon: Salon; id: string }>();

/* ------------------------------------------------------------- statique */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const serveur = http.createServer(async (req, res) => {
  const demande = decodeURIComponent((req.url ?? '/').split('?')[0]);

  // Les hébergeurs interrogent cette adresse pour savoir si le jeu répond — et
  // la page, quand elle est servie ailleurs, s'en sert pour réveiller le serveur
  // et savoir quand il est debout. D'où l'ouverture aux autres origines : c'est
  // un état public, sans rien de personnel.
  if (demande === '/sante') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }).end(JSON.stringify({
      ok: true,
      salons: salons.size,
      connexions: connexions.size,
      // De quoi dire à l'accueil s'il y a du monde, sans rien révéler de personne.
      publiques: [...salons.values()].filter((s) => s.accueille).length,
      enAttente: [...salons.values()]
        .filter((s) => s.accueille)
        .reduce((n, s) => n + s.places.filter((p) => !p.estBot).length, 0),
    }));
    return;
  }

  // « /regles » plutôt que « /regles.html » : la même adresse qu'en production.
  // La liste des tables publiques : de quoi montrer que le site vit, et laisser
  // un arrivant choisir sa table. Des comptes seulement — les noms des joueurs
  // ne regardent pas les passants. On ne montre que les tables où quelqu'un est
  // effectivement assis, pour ne pas annoncer une animation qui n'existe pas.
  if (demande === '/tables') {
    const tables = [...salons.values()]
      .filter((s) => s.publique && s.places.some((p) => !p.estBot && p.connecte))
      .map((s) => ({
        code: s.code,
        joueurs: s.places.filter((p) => !p.estBot).length,
        bots: s.places.filter((p) => p.estBot).length,
        prets: s.places.filter((p) => !p.estBot && p.pret).length,
        commencee: s.commencee,
        manche: s.etat?.round ?? 0,
        libre: s.accueille || (s.commencee && s.places.some((p) => p.estBot)),
      }));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }).end(JSON.stringify(tables));
    return;
  }

  const nu = demande.replace(/^\/+/, '');
  const relatif = nu === '' ? 'index.html' : path.extname(nu) ? nu : `${nu}.html`;
  const fichier = path.join(SITE, relatif);

  if (!fichier.startsWith(SITE)) {
    res.writeHead(403).end('Interdit');
    return;
  }
  try {
    const contenu = await readFile(fichier);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(fichier)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(contenu);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
});

/* ------------------------------------------------------------ WebSocket */

const wss = new WebSocketServer({ server: serveur, maxPayload: TAILLE_MAX_MESSAGE });

/** Un code de salon libre. La collision est improbable, pas impossible. */
function codeLibre(): string {
  for (let essai = 0; essai < 50; essai++) {
    const code = codeDeSalon();
    if (!salons.has(code)) return code;
  }
  throw new RegleViolee('Trop de salons ouverts, réessayez dans un moment.');
}

function envoyer(ws: WebSocket, message: VersClient): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

/** Chaque joueur reçoit sa propre vue, et personne ne reçoit celle d'un autre. */
function diffuser(salon: Salon): void {
  for (const [ws, lien] of connexions) {
    if (lien.salon !== salon) continue;
    if (salon.commencee) {
      const vue = salon.vuePour(lien.id);
      if (vue) envoyer(ws, { type: 'vue', vue });
    }
    envoyer(ws, { type: 'salon', etat: salon.etatPublic() });
  }
}

const minuteurs = new Map<Salon, NodeJS.Timeout>();

/** Les tables publiques dont le lancement automatique est programmé. */
const lancements = new Map<Salon, NodeJS.Timeout>();

/** Le compte à rebours part, et ne repart pas si quelqu'un d'autre s'assoit. */
function programmerLancement(salon: Salon): void {
  if (!salon.publique || salon.commencee || lancements.has(salon)) return;
  salon.lancement = Date.now() + ATTENTE_PUBLIQUE;
  lancements.set(salon, setTimeout(() => lancer(salon), ATTENTE_PUBLIQUE));
}

/** Plus de compte à rebours, plus de minuteur : on rend son temps au joueur. */
function annulerLancement(salon: Salon): void {
  clearTimeout(lancements.get(salon));
  lancements.delete(salon);
  salon.lancement = null;
}

/**
 * L'unique règle du départ, recalculée après chaque changement : le compte à
 * rebours court tant que tous les joueurs assis se sont dits prêts. Se dédire
 * l'arrête ; l'arrivée de quelqu'un qui n'a rien promis l'arrête aussi.
 */
function ajusterLancement(salon: Salon): void {
  if (!salon.publique || salon.commencee) return;
  if (salon.tousPrets) programmerLancement(salon);
  else annulerLancement(salon);
}

/**
 * L'heure est venue : les bots prennent les places vides et la partie commence.
 * Si tout le monde est reparti entre-temps, la table disparaît simplement.
 */
function lancer(salon: Salon): void {
  annulerLancement(salon);
  if (salon.commencee) return;
  if (!salon.places.some((p) => !p.estBot && p.connecte)) {
    salons.delete(salon.code);
    return;
  }
  salon.completerEtDemarrer();
  diffuser(salon);
  avancer(salon);
}

/**
 * Fait avancer la table : les bots jouent après un temps de réflexion, et on
 * finit par jouer à la place d'un joueur parti sans prévenir.
 */
function avancer(salon: Salon): void {
  clearTimeout(minuteurs.get(salon));
  const acteur = salon.acteurAutomatique();
  if (!acteur) return;

  const place = salon.place(acteur)!;
  const delai = place.estBot ? REFLEXION : PATIENCE_DECONNEXION;

  minuteurs.set(salon, setTimeout(() => {
    // La situation a pu changer pendant l'attente.
    if (salon.acteurAutomatique() !== acteur) {
      avancer(salon);
      return;
    }
    const coup = salon.coupAutomatique(acteur);
    if (!coup) return;
    try {
      salon.jouer(acteur, coup);
    } catch {
      return;
    }
    diffuser(salon);
    avancer(salon);
  }, delai));
}

function traiter(ws: WebSocket, message: VersServeur): void {
  const lien = connexions.get(ws);

  // Table publique : le serveur choisit où asseoir le visiteur, ou lui en ouvre
  // une. Ensuite, reconnexions et coups passent par le même chemin qu'un salon.
  if (message.type === 'rejoindre-public') {
    if (lien) return;
    let salon = tablePubliqueOuverte(salons.values());
    if (!salon) {
      if (salons.size >= MAX_SALONS) {
        envoyer(ws, { type: 'erreur', message: 'Trop de tables ouvertes. Réessayez dans un moment.' });
        return;
      }
      salon = new Salon(codeLibre(), { publique: true });
      salons.set(salon.code, salon);
    }
    const place = salon.asseoir(message.nom, randomUUID());
    connexions.set(ws, { salon, id: place.id });
    envoyer(ws, { type: 'bienvenue', jeton: place.jeton, moi: place.id, salon: salon.code });
    if (salon.places.length >= MAX_JOUEURS) {
      lancer(salon);
    } else {
      ajusterLancement(salon);
      diffuser(salon);
    }
    return;
  }

  if (message.type === 'rejoindre') {
    if (lien) return;
    const demande = message.salon.toUpperCase();

    let salon: Salon;
    if (!demande) {
      if (salons.size >= MAX_SALONS) {
        envoyer(ws, { type: 'erreur', message: 'Trop de tables ouvertes. Réessayez dans un moment.' });
        return;
      }
      salon = new Salon(codeLibre());
      salons.set(salon.code, salon);
    } else {
      if (!codeValide(demande)) {
        envoyer(ws, { type: 'erreur', message: 'Ce code de salon ne ressemble à rien.' });
        return;
      }
      const trouve = salons.get(demande);
      if (!trouve) {
        envoyer(ws, { type: 'erreur', message: `Aucun salon ${demande}. Le code est-il bon ?` });
        return;
      }
      salon = trouve;
    }

    // Reconnexion : on retrouve sa place grâce au jeton gardé par le navigateur.
    const ancienne = message.jeton ? salon.parJeton(message.jeton) : undefined;
    let place = ancienne;
    if (place) {
      // Une place, une session : l'ancienne connexion cède la sienne.
      for (const [autre, lienAutre] of connexions) {
        if (lienAutre.salon === salon && lienAutre.id === place.id) {
          connexions.delete(autre);
          envoyer(autre, { type: 'erreur', message: 'Votre place a été reprise ailleurs.' });
          autre.close();
        }
      }
      place.connecte = true;
      // Même nettoyage qu'à l'arrivée : un nom repris à la reconnexion
      // s'affiche chez les autres tout autant.
      place.nom = nomPropre(message.nom) || place.nom;
    } else {
      // Une partie publique déjà lancée se complète avec des bots : plutôt que
      // d'attendre la fin, un arrivant en reprend un et joue tout de suite.
      place = salon.reprendreUnBot(message.nom, randomUUID()) ?? undefined;
    }
    if (!place) {
      try {
        place = salon.asseoir(message.nom, randomUUID());
      } catch (err) {
        envoyer(ws, {
          type: 'erreur',
          message: err instanceof RegleViolee ? err.message : 'Impossible de rejoindre.',
        });
        return;
      }
    }

    connexions.set(ws, { salon, id: place.id });
    envoyer(ws, { type: 'bienvenue', jeton: place.jeton, moi: place.id, salon: salon.code });
    // Un lien vers une table publique mène au même accord.
    ajusterLancement(salon);
    diffuser(salon);
    avancer(salon);
    return;
  }

  if (!lien) {
    envoyer(ws, { type: 'erreur', message: 'Rejoignez un salon avant de jouer.' });
    return;
  }
  const { salon, id } = lien;

  try {
    switch (message.type) {
      case 'ajouter-bot':
        exigerHote(salon, id);
        salon.ajouterBot();
        break;
      case 'retirer':
        exigerHote(salon, id);
        salon.retirer(message.id);
        break;
      case 'demarrer': {
        // Une table publique n'a pas d'hôte : n'importe qui peut décider de ne
        // pas attendre la fin du compte à rebours.
        if (salon.publique) {
          const assis = salon.place(id);
          if (!assis || assis.estBot) throw new RegleViolee('Il faut être assis à la table.');
          lancer(salon);
          break;
        }
        exigerHote(salon, id);
        salon.demarrer();
        break;
      }
      case 'pret':
        salon.marquerPret(id, message.pret === true);
        ajusterLancement(salon);
        break;
      case 'action':
        salon.jouer(id, message.action);
        break;
      default:
        return;
    }
  } catch (err) {
    if (!(err instanceof RegleViolee)) throw err;
    envoyer(ws, { type: 'erreur', message: err.message });
    return;
  }

  diffuser(salon);
  avancer(salon);
}

function exigerHote(salon: Salon, id: string): void {
  if (salon.hote !== id) throw new RegleViolee("Seul l'hôte du salon décide de cela.");
}

wss.on('connection', (ws) => {
  // Un joueur clique de temps en temps ; un script, non. On coupe les seconds.
  let recents: number[] = [];

  ws.on('message', (donnees) => {
    const maintenant = Date.now();
    recents = recents.filter((t) => maintenant - t < FENETRE_MESSAGES);
    recents.push(maintenant);
    if (recents.length > MESSAGES_MAX) {
      envoyer(ws, { type: 'erreur', message: 'Trop de messages d’un coup.' });
      ws.close();
      return;
    }

    let message: VersServeur;
    try {
      message = JSON.parse(String(donnees)) as VersServeur;
    } catch {
      envoyer(ws, { type: 'erreur', message: 'Message illisible.' });
      return;
    }
    try {
      traiter(ws, message);
    } catch (err) {
      console.error('Erreur en traitant', message.type, err);
      envoyer(ws, { type: 'erreur', message: 'Le serveur a trébuché sur ce message.' });
    }
  });

  ws.on('close', () => {
    const lien = connexions.get(ws);
    connexions.delete(ws);
    if (!lien) return;
    const place = lien.salon.place(lien.id);
    if (place) place.connecte = false;
    // Avant le début, une place vide se libère ; après, on la garde au chaud.
    if (!lien.salon.commencee && place && !place.estBot) lien.salon.retirer(lien.id);
    if (lien.salon.publique && !lien.salon.commencee) {
      const restants = lien.salon.places.filter((p) => !p.estBot).length;
      // Une table que tout le monde a quittée avant de commencer n'a plus de
      // raison d'exister : on ne la proposera à personne.
      if (restants === 0) {
        annulerLancement(lien.salon);
        salons.delete(lien.salon.code);
        return;
      }
      // Le départ des uns peut faire l'accord des autres, ou le défaire.
      ajusterLancement(lien.salon);
    }
    diffuser(lien.salon);
    avancer(lien.salon);
  });
});

/* --------------------------------------------------------------- ménage */

setInterval(() => {
  for (const [code, salon] of salons) {
    const vide = ![...connexions.values()].some((l) => l.salon === salon);
    if (vide && Date.now() - salon.derniereActivite > OUBLI) {
      clearTimeout(minuteurs.get(salon));
      minuteurs.delete(salon);
      clearTimeout(lancements.get(salon));
      lancements.delete(salon);
      salons.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

function adresseLocale(): string | null {
  for (const cartes of Object.values(networkInterfaces())) {
    for (const carte of cartes ?? []) {
      if (carte.family === 'IPv4' && !carte.internal) return carte.address;
    }
  }
  return null;
}

serveur.listen(PORT, () => {
  // Chez un hébergeur, l'adresse du réseau local est celle de sa machine
  // interne : elle n'aide personne et prête à confusion dans les journaux.
  if (process.env.NODE_ENV === 'production') {
    console.log(`Le Larbin écoute sur le port ${PORT}.`);
    return;
  }
  const ip = adresseLocale();
  console.log(`Le Larbin est servi sur http://localhost:${PORT}`);
  if (ip) console.log(`Depuis le téléphone (même wifi) : http://${ip}:${PORT}`);
});

// Les hébergeurs redémarrent le service à chaque mise à jour : on prévient les
// joueurs plutôt que de couper le fil sans un mot.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    for (const ws of connexions.keys()) {
      envoyer(ws, { type: 'erreur', message: 'Le serveur redémarre — rouvrez le lien dans un instant.' });
      ws.close();
    }
    for (const minuteur of minuteurs.values()) clearTimeout(minuteur);
    serveur.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
