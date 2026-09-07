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

import { RegleViolee } from '../engine/game.ts';
import { codeValide, type VersClient, type VersServeur } from './protocole.ts';
import { Salon } from './salon.ts';

const racine = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const PORT = Number(process.env.PORT) || 5177;

/** Temps de réflexion des bots : la table doit rester lisible. */
const REFLEXION = 800;
/** Au-delà, on joue à la place d'un joueur déconnecté pour ne pas bloquer les autres. */
const PATIENCE_DECONNEXION = 25_000;
/** Un salon vide finit par être oublié. */
const OUBLI = 2 * 60 * 60 * 1000;

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
};

const serveur = http.createServer(async (req, res) => {
  const demande = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const relatif = demande === '/' ? 'Larbin.html' : demande.replace(/^\/+/, '');
  const fichier = path.join(racine, relatif);

  if (!fichier.startsWith(racine)) {
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

const wss = new WebSocketServer({ server: serveur });

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

  if (message.type === 'rejoindre') {
    if (lien) return;
    const demande = message.salon.toUpperCase();

    let salon: Salon;
    if (!demande) {
      salon = new Salon();
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
      place.nom = message.nom.trim() || place.nom;
    } else {
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
      case 'demarrer':
        exigerHote(salon, id);
        salon.demarrer();
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
  ws.on('message', (donnees) => {
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
  const ip = adresseLocale();
  console.log(`Le Larbin est servi sur http://localhost:${PORT}`);
  if (ip) console.log(`Depuis le téléphone (même wifi) : http://${ip}:${PORT}`);
});
