/**
 * L'API des comptes et du classement.
 *
 * La page vit sur un autre domaine que le serveur : les réponses sont donc
 * ouvertes aux autres origines. Rien ne repose sur un cookie — le navigateur
 * présente son jeton de session dans l'en-tête Authorization — si bien que
 * cette ouverture ne permet à aucun site tiers d'agir au nom d'un joueur.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import { fusionnerParcours, relire as relireParcours } from '../web/parcours.ts';
import { fusionnerSucces, listeSucces } from '../web/succes.ts';
import { codeNormalise, empreinte, nouveauCode, nouveauJeton, pseudoValide } from './comptes.ts';
import type { Compte, Depot } from './depot.ts';
import { estAvatar } from './protocole.ts';

const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
};

/** Un parcours tient en quelques kilo-octets ; au-delà, ce n'est pas un joueur. */
const CORPS_MAX = 64 * 1024;
/** Créer un compte ou se connecter : quelques essais, pas une rafale. */
const ESSAIS_MAX = 20;
const FENETRE_ESSAIS = 10 * 60 * 1000;
const essais = new Map<string, number[]>();

type Reponse = ServerResponse<IncomingMessage>;

function repondre(res: Reponse, statut: number, corps?: unknown): void {
  const entetes = corps === undefined ? ENTETES : { ...ENTETES, 'Content-Type': 'application/json; charset=utf-8' };
  res.writeHead(statut, entetes).end(corps === undefined ? undefined : JSON.stringify(corps));
}

async function lireCorps(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const morceaux: Buffer[] = [];
  let taille = 0;
  for await (const morceau of req) {
    taille += (morceau as Buffer).length;
    if (taille > CORPS_MAX) return null;
    morceaux.push(morceau as Buffer);
  }
  try {
    const valeur: unknown = JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}');
    return valeur && typeof valeur === 'object' && !Array.isArray(valeur) ? valeur as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Derrière l'hébergeur, l'adresse du visiteur arrive dans un en-tête. On ne la garde que dix minutes, en mémoire. */
function adresseDe(req: IncomingMessage): string {
  const transmise = req.headers['x-forwarded-for'];
  const premiere = (Array.isArray(transmise) ? transmise[0] : transmise)?.split(',')[0]?.trim();
  return premiere || req.socket.remoteAddress || '?';
}

function tropDEssais(req: IncomingMessage): boolean {
  const cle = adresseDe(req);
  const maintenant = Date.now();
  const liste = (essais.get(cle) ?? []).filter((t) => maintenant - t < FENETRE_ESSAIS);
  liste.push(maintenant);
  essais.set(cle, liste);
  return liste.length > ESSAIS_MAX;
}

setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, liste] of essais) {
    if (liste.every((t) => maintenant - t >= FENETRE_ESSAIS)) essais.delete(cle);
  }
}, FENETRE_ESSAIS).unref();

/** Comparer deux empreintes sans que le temps de réponse trahisse où elles diffèrent. */
const memes = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const enPublic = (c: Compte) => ({ pseudo: c.pseudo, avatar: c.avatar, creeLe: c.creeLe });

function jetonDe(req: IncomingMessage): string | null {
  const entete = req.headers.authorization;
  return entete?.startsWith('Bearer ') ? entete.slice(7).trim() || null : null;
}

/** Répond si la demande concerne l'API ; renvoie faux sinon, pour que le serveur serve la page. */
export async function repondreApi(req: IncomingMessage, res: Reponse, depot: Depot | null): Promise<boolean> {
  const chemin = (req.url ?? '/').split('?')[0];
  if (chemin !== '/classement' && chemin !== '/compte' && !chemin.startsWith('/compte/')) return false;

  if (req.method === 'OPTIONS') {
    repondre(res, 204);
    return true;
  }
  if (!depot) {
    repondre(res, 503, { erreur: 'Les comptes ne sont pas encore ouverts.' });
    return true;
  }
  try {
    await aiguiller(req, res, depot, chemin);
  } catch (err) {
    console.error('API', chemin, err);
    if (!res.headersSent) repondre(res, 500, { erreur: 'Le serveur a trébuché. Réessayez dans un instant.' });
  }
  return true;
}

async function aiguiller(req: IncomingMessage, res: Reponse, depot: Depot, chemin: string): Promise<void> {
  if (req.method === 'GET' && chemin === '/classement') {
    repondre(res, 200, await depot.classement(20));
    return;
  }

  if (req.method === 'POST' && (chemin === '/compte/creer' || chemin === '/compte/connexion')) {
    if (tropDEssais(req)) {
      repondre(res, 429, { erreur: 'Trop d’essais. Réessayez dans quelques minutes.' });
      return;
    }
    const corps = await lireCorps(req);
    if (!corps) {
      repondre(res, 400, { erreur: 'Requête illisible.' });
      return;
    }
    if (chemin === '/compte/creer') await creer(res, depot, corps);
    else await connecter(res, depot, corps);
    return;
  }

  // Tout le reste se fait connecté.
  const jeton = jetonDe(req);
  const compte = jeton ? await depot.compteParSession(empreinte(jeton)) : null;
  if (!jeton || !compte) {
    repondre(res, 401, { erreur: 'Session expirée : reconnectez-vous.' });
    return;
  }

  if (req.method === 'GET' && chemin === '/compte') {
    repondre(res, 200, { compte: enPublic(compte), donnees: await depot.lireDonnees(compte.id) });
    return;
  }
  if (req.method !== 'POST') {
    repondre(res, 405, { erreur: 'Méthode non permise.' });
    return;
  }
  const corps = await lireCorps(req);
  if (!corps) {
    repondre(res, 400, { erreur: 'Requête illisible.' });
    return;
  }

  switch (chemin) {
    case '/compte/synchro': {
      // Ce qui vient du navigateur n'est jamais « vérifié » : seul le serveur,
      // qui a vu la partie, peut l'affirmer.
      const venus = listeSucces(corps.succes).map((s) => ({ ...s, verifie: false }));
      const donnees = await depot.modifierDonnees(compte.id, (d) => ({
        parcours: fusionnerParcours(relireParcours(d.parcours), relireParcours(corps.parcours)),
        succes: fusionnerSucces(d.succes, venus),
      }));
      if ('avatar' in corps) await depot.changerAvatar(compte.id, estAvatar(corps.avatar) ? corps.avatar : null);
      repondre(res, 200, { donnees });
      return;
    }
    case '/compte/nouveau-code': {
      const code = nouveauCode();
      await depot.changerCode(compte.id, empreinte(codeNormalise(code)!));
      // L'ancien code a pu fuiter : les autres appareils doivent se reconnecter.
      await depot.fermerSessions(compte.id, empreinte(jeton));
      repondre(res, 200, { code });
      return;
    }
    case '/compte/deconnexion':
      await depot.fermerSession(empreinte(jeton));
      repondre(res, 204);
      return;
    case '/compte/supprimer':
      await depot.supprimerCompte(compte.id);
      repondre(res, 204);
      return;
    default:
      repondre(res, 404, { erreur: 'Introuvable.' });
  }
}

async function creer(res: Reponse, depot: Depot, corps: Record<string, unknown>): Promise<void> {
  const pseudo = pseudoValide(corps.pseudo);
  if (!pseudo) {
    repondre(res, 400, { erreur: 'Un pseudo de 3 à 14 caractères : lettres, chiffres, espace, trait d’union.' });
    return;
  }
  const code = nouveauCode();
  const compte = await depot.creerCompte(pseudo, empreinte(codeNormalise(code)!));
  if (!compte) {
    repondre(res, 409, { erreur: 'Ce pseudo est déjà pris.' });
    return;
  }
  const jeton = nouveauJeton();
  await depot.ouvrirSession(compte.id, empreinte(jeton));
  repondre(res, 201, { compte: enPublic(compte), code, jeton, donnees: await depot.lireDonnees(compte.id) });
}

async function connecter(res: Reponse, depot: Depot, corps: Record<string, unknown>): Promise<void> {
  const code = codeNormalise(corps.code);
  const trouve = typeof corps.pseudo === 'string' && code ? await depot.compteParPseudo(corps.pseudo) : null;
  // Le même message dans tous les cas : on ne dit pas à un inconnu quels pseudos existent.
  if (!trouve || !code || !memes(trouve.codeHash, empreinte(code))) {
    repondre(res, 401, { erreur: 'Pseudo ou code secret incorrect.' });
    return;
  }
  const jeton = nouveauJeton();
  await depot.ouvrirSession(trouve.compte.id, empreinte(jeton));
  repondre(res, 200, { compte: enPublic(trouve.compte), jeton, donnees: await depot.lireDonnees(trouve.compte.id) });
}
