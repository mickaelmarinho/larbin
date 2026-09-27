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
import { jourDeParis, type Compte, type Depot } from './depot.ts';
import { nomConvenable } from './moderation.ts';
import { EVENEMENTS, EVENEMENTS_NAVIGATEUR, estAvatar, nomPropre, type Evenement } from './protocole.ts';
import { rejouerLeDefi } from '../web/defi.ts';
import { nomAuHasard } from '../web/noms.ts';

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

/** Les compteurs : une partie toutes les deux minutes, c'est déjà beaucoup ; une rafale, non. */
const ENVOIS_MAX = 120;
const envois = new Map<string, number[]>();

function tropSouvent(req: IncomingMessage, registre: Map<string, number[]>, max: number): boolean {
  const cle = adresseDe(req);
  const maintenant = Date.now();
  const liste = (registre.get(cle) ?? []).filter((t) => maintenant - t < FENETRE_ESSAIS);
  liste.push(maintenant);
  registre.set(cle, liste);
  return liste.length > max;
}

const tropDEssais = (req: IncomingMessage) => tropSouvent(req, essais, ESSAIS_MAX);

setInterval(() => {
  const maintenant = Date.now();
  for (const registre of [essais, envois]) {
    for (const [cle, liste] of registre) {
      if (liste.every((t) => maintenant - t >= FENETRE_ESSAIS)) registre.delete(cle);
    }
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
  if (chemin !== '/classement' && chemin !== '/stats' && chemin !== '/defi' && chemin !== '/compte'
    && !chemin.startsWith('/compte/')) {
    return false;
  }

  if (req.method === 'OPTIONS') {
    repondre(res, 204);
    return true;
  }
  // Les compteurs se passent des comptes : sans base, ils se taisent simplement.
  if (chemin === '/stats') {
    try {
      if (req.method === 'POST') await compterDepuisLeNavigateur(req, res, depot);
      else await montrerLesCompteurs(req, res, depot);
    } catch (err) {
      console.error('Compteurs', err);
      if (!res.headersSent) repondre(res, 500);
    }
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

  if (chemin === '/defi') {
    if (req.method === 'POST') await recevoirUnDefi(req, res, depot);
    else await montrerLeDefi(req, res, depot);
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
  if (typeof corps.pseudo === 'string' && !nomConvenable(corps.pseudo)) {
    repondre(res, 400, { erreur: 'Ce pseudo n’est pas accepté ici. Choisissez-en un autre.' });
    return;
  }
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
  await depot.compter('compte-cree', jourDeParis());
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

/* ------------------------------------------------------- le défi du jour */

/*
 * Le navigateur n'envoie pas son score : il envoie ses coups, et le serveur
 * rejoue la partie du jour pour trouver le score lui-même (voir web/defi.ts).
 * Un score par compte et par jour ; pour les invités, un par adresse et par
 * jour — l'adresse n'est gardée qu'en mémoire, sous forme d'empreinte, et
 * oubliée le lendemain.
 */

const LIGNES_DU_DEFI = 10;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const invitesDuJour = new Map<string, Set<string>>();

/** Aujourd'hui, ou hier : un défi commencé avant minuit s'envoie après. */
function jourAdmis(jour: unknown): jour is string {
  if (typeof jour !== 'string' || !JOUR.test(jour)) return false;
  const maintenant = new Date();
  return jour === jourDeParis(maintenant) || jour === jourDeParis(new Date(maintenant.getTime() - 86_400_000));
}

async function montrerLeDefi(req: IncomingMessage, res: Reponse, depot: Depot): Promise<void> {
  const demande = new URL(req.url ?? '/', 'http://larbin').searchParams.get('jour') ?? '';
  const jour = JOUR.test(demande) ? demande : jourDeParis();
  repondre(res, 200, { jour, ...await depot.classementDefi(jour, LIGNES_DU_DEFI) });
}

async function recevoirUnDefi(req: IncomingMessage, res: Reponse, depot: Depot): Promise<void> {
  if (tropSouvent(req, envois, ENVOIS_MAX)) {
    repondre(res, 429, { erreur: 'Trop d’envois. Réessayez dans quelques minutes.' });
    return;
  }
  const corps = await lireCorps(req);
  if (!corps || !jourAdmis(corps.jour)) {
    repondre(res, 400, { erreur: 'Ce défi n’est plus ouvert.' });
    return;
  }
  const jour = corps.jour as string;
  const resultat = rejouerLeDefi(jour, corps.coups);
  if (!resultat) {
    repondre(res, 400, { erreur: 'Cette partie ne se rejoue pas : score refusé.' });
    return;
  }

  const jeton = jetonDe(req);
  const compte = jeton ? await depot.compteParSession(empreinte(jeton)) : null;
  let nom: string;
  if (compte) {
    nom = compte.pseudo;
  } else {
    // Un invité par adresse et par jour : sinon, on rejouerait jusqu'au meilleur score.
    const adresse = empreinte(`${adresseDe(req)}|${jour}`);
    for (const j of invitesDuJour.keys()) if (!jourAdmis(j)) invitesDuJour.delete(j);
    const vus = invitesDuJour.get(jour) ?? new Set<string>();
    if (vus.has(adresse)) {
      repondre(res, 409, { erreur: 'Un score a déjà été envoyé d’ici pour ce défi.' });
      return;
    }
    vus.add(adresse);
    invitesDuJour.set(jour, vus);
    const souhaite = typeof corps.nom === 'string' ? nomPropre(corps.nom) : '';
    // Un invité ne signe pas du pseudo réservé d'un compte.
    nom = souhaite && !await depot.pseudoPris(souhaite) ? souhaite : nomAuHasard();
  }

  const rang = await depot.noterDefi({
    jour, nom, points: resultat.points, roles: resultat.roles.join(','), compteId: compte?.id ?? null,
  });
  if (!rang) {
    repondre(res, 409, { erreur: 'Vous avez déjà un score pour ce défi.' });
    return;
  }
  repondre(res, 201, { ...rang, points: resultat.points, nom });
}

/* ------------------------------------------------------------ les compteurs */

/*
 * Des compteurs anonymes : combien de visites, de parties, de partages, de
 * comptes, jour par jour. On ne reçoit que le nom d'un événement, et le serveur
 * ajoute 1 au total du jour — c'est tout ce qu'il garde.
 */

async function compterDepuisLeNavigateur(req: IncomingMessage, res: Reponse, depot: Depot | null): Promise<void> {
  if (tropSouvent(req, envois, ENVOIS_MAX)) {
    repondre(res, 429);
    return;
  }
  const evenement = (await lireCorps(req))?.evenement;
  if (!(EVENEMENTS_NAVIGATEUR as readonly unknown[]).includes(evenement)) {
    repondre(res, 400, { erreur: 'Événement inconnu.' });
    return;
  }
  if (depot) await depot.compter(evenement as Evenement, jourDeParis());
  repondre(res, 204);
}

const LIBELLES: Record<Evenement, string> = {
  'visite': 'Visites',
  'solo-lancee': 'Solo lancées',
  'solo-finie': 'Solo finies',
  'defi-lance': 'Défis lancés',
  'defi-fini': 'Défis finis',
  'didacticiel-fini': 'Didacticiels finis',
  'partage': 'Partages',
  'installation': 'Installations',
  'en-ligne-finie': 'En ligne finies',
  'en-ligne-entre-humains': 'dont entre humains',
  'compte-cree': 'Comptes créés',
};
const JOURS_MONTRES = 14;

/** La page de lecture : réservée à qui connaît la clé (variable STATS_CLE), invisible sinon. */
async function montrerLesCompteurs(req: IncomingMessage, res: Reponse, depot: Depot | null): Promise<void> {
  const attendue = process.env.STATS_CLE;
  const donnee = new URL(req.url ?? '/', 'http://larbin').searchParams.get('cle') ?? '';
  if (!attendue || !depot || !memes(donnee, attendue)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Introuvable.');
    return;
  }

  const [a, m, j] = jourDeParis().split('-').map(Number);
  const jours = Array.from({ length: JOURS_MONTRES }, (_, i) => new Date(Date.UTC(a, m - 1, j - i)).toISOString().slice(0, 10));
  const lignes = await depot.compteurs(jours[jours.length - 1]);
  const n = (jour: string, e: Evenement) => lignes.find((l) => l.jour === jour && l.evenement === e)?.n ?? 0;
  const total = (e: Evenement) => jours.reduce((s, jour) => s + n(jour, e), 0);
  const cellule = (v: number) => `<td${v === 0 ? ' class="zero"' : ''}>${v}</td>`;

  const corps = jours.map((jour) => `<tr><td>${jour.slice(8)}/${jour.slice(5, 7)}</td>${
    EVENEMENTS.map((e) => cellule(n(jour, e))).join('')}</tr>`).join('');

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Compteurs — Le Larbin</title>
<style>
body{margin:0;padding:20px 16px;background:#0d3b2e;color:#e8e2d4;font:14px/1.4 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}p{color:#a9b6ad;margin:0 0 14px}.defile{overflow-x:auto}
table{border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:6px 10px;text-align:right;border-bottom:1px solid #ffffff1a;white-space:nowrap}
th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:#0d3b2e}
thead th{font-size:12px;color:#d9a441;vertical-align:bottom;white-space:normal;min-width:64px}
tfoot td{font-weight:700;border-top:2px solid #d9a441;border-bottom:none}.zero{color:#ffffff40}
</style></head><body>
<h1>Compteurs du Larbin</h1>
<p>Les ${JOURS_MONTRES} derniers jours, heure de Paris. Anonymes : aucun joueur n'y est reconnaissable.</p>
<div class="defile"><table>
<thead><tr><th>Jour</th>${EVENEMENTS.map((e) => `<th>${LIBELLES[e]}</th>`).join('')}</tr></thead>
<tbody>${corps}</tbody>
<tfoot><tr><td>Total</td>${EVENEMENTS.map((e) => cellule(total(e))).join('')}</tr></tfoot>
</table></div>
</body></html>`);
}
