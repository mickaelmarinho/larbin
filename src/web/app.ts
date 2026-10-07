/**
 * L'interface du Larbin.
 *
 * Elle ne connaît qu'une chose : la `PlayerView` que lui donne la table, et les
 * actions qu'elle lui renvoie. Que le moteur tourne dans cet onglet (solo) ou
 * sur le serveur (en ligne) ne change rien à ce fichier.
 */
import type { Action, Card, Rank, Role } from '../engine/types.ts';
import type { PlayerView } from '../engine/game.ts';
import { rankLabel, sortHand } from '../engine/cards.ts';
import {
  ADRESSE_PUBLIQUE, DUREE_REACTION, TABLE_PUBLIQUE, TableDefi, TableEnLigne, TableSolo, activite, hoteDuJeu,
  tablesPubliques, type ResumeTable, type Table,
} from './table.ts';
import {
  DEFI_MANCHES, DEFI_MAXIMUM, bilanDuJour, emojisDuDefi, noterDansLHistorique, statsDuDefi, texteDuDefi,
  type BilanDuDefi,
} from './defi.ts';
import { THEMES, appliquerTheme, themeCourant } from './themes.ts';
import { type Parcours, bilan, noterManche, noterPartie, parcours } from './parcours.ts';
import { TableDidacticiel, type Morale } from './didacticiel.ts';
import { RIEN, quoiEntendre, type Instant } from './bruitages.ts';
import { REACTIONS } from '../reseau/protocole.ts';
import {
  SUCCES, type Succes, succesApresDonne, succesApresManche, succesApresPartie, succesDidacticiel,
  succesObtenus,
} from './succes.ts';
import {
  AVATARS_A_GAGNER, AVATARS_LIBRES, BOTS_SOLO, avatarChoisi, avatarDebloquePar, choisirAvatar,
} from './avatars.ts';
import {
  classementPublic, creerCompte, monCompte, nouveauCodeSecret, seConnecter, seDeconnecter,
  supprimerMonCompte, synchroniserBientot,
} from './compte.ts';
import { sessionOuverte } from './session.ts';
import { podium, signeDeVie, texteDuBoutonPublic, type SigneDeVie } from './vitrine.ts';
import { nomPropose } from './noms.ts';
import { compter, compterLaVisite, reglerLeComptage } from './mesure.ts';
import { jourDeParis } from './jour.ts';
import { classementDuDefi, emojisDeLaLigne, envoyerLeDefi } from './defi-en-ligne.ts';
import {
  ecouterInstallation, installer as installerLeJeu, moyenDInstaller, proposerInstallation, refusGarde, refuser,
} from './installation.ts';
import type { Activite } from './table.ts';
import type { LigneClassement } from './compte.ts';
import { adopterSucces } from './succes.ts';
import { jouerSons, ouvrirAuPremierGeste, reglerSons, sonsActifs } from './sons.ts';
import {
  MUSIQUES, ORDRE_MUSIQUES, choisirMusique, musiqueAuPremierGeste, musiqueChoisie,
} from './musique.ts';

import { PREFIXE, enAnglais, pluriel, rang, tr } from './langue.ts';
import { SUR_PORTAIL } from './portail.ts';
import { dessinDeCarte } from './cartes.ts';
import { icone } from './icones.ts';
import { emporter, enMouvement, placesDesCartes, poser, replacerLaMain } from './mouvements.ts';
import {
  direLeSalon, direSiOnJoue, ecouterLesInvitations, invitationRecue, lienDInvitation, multijoueurImmediat, portailPret,
} from './crazygames.ts';
import { ROLES_EN, cartesEnAnglais, ligneEnAnglais } from './journal.ts';
import { messageDuServeur } from './messages.ts';

/** Le nom et la consigne d'un succès, dans la langue de la page. */
const nomDuSucces = (s: Succes) => (enAnglais ? s.en.nom : s.nom);
const consigneDuSucces = (s: Succes) => (enAnglais ? s.en.comment : s.comment);

const $ = (id: string) => document.getElementById(id)!;

/** Pour placer un texte dans un attribut sans qu'un guillemet ne casse la page. */
const attribut = (texte: string) => texte.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);

let table: Table | null = null;
let selection: string[] = [];
let mancheAnnoncee = 0;
let restantesVisibles = false;
let poseAffichee = '';
let minuteur: ReturnType<typeof setTimeout> | undefined;
let annonce = '';
/** Un panneau ouvert par le joueur ne doit pas être balayé par le coup suivant. */
let voileManuel = false;
/** Le rafraîchissement de la liste des tables, tant qu'elle est affichée. */
let minuteurTables: ReturnType<typeof setTimeout> | undefined;
/** La dernière photographie de la table, pour savoir ce qui vient de s'y passer. */
let entendu: Instant = RIEN;
/** La palette des réactions est-elle ouverte ? */
let paletteOuverte = false;
let minuteurBulles: ReturnType<typeof setTimeout> | undefined;
/** La plus récente réaction déjà entendue, pour ne sonner qu'aux nouvelles. */
let derniereBulleEntendue = 0;
/** En solo, la table patiente aussi pendant qu'on lit. */
function suspendre(oui: boolean): void {
  voileManuel = oui;
  if (table instanceof TableSolo) table.suspendre(oui);
}

const TITRES: Record<Role, string> = enAnglais ? ROLES_EN : {
  boss: 'Boss',
  'sous-boss': 'Sous-Boss',
  neutre: 'Neutre',
  'sur-larbin': 'Sur-Larbin',
  larbin: 'Larbin',
};

/**
 * Un lien vers l'accueil du site, dans la langue de la page, avec sa marque
 * (?defi, ?via=partage…) : « /?defi » en français, « /en?defi » en anglais.
 */
const lienDuSite = (marque: string) => `https://${ADRESSE_PUBLIQUE}${enAnglais ? '/en?' : '/?'}${marque}`;
/** Les règles complètes, dans la langue de la page. */
/** Les portails de jeux s'adressent à un public dès 12 ans : on y tait le nom le plus vert du jeu. */
const GROS_MOT_FR = SUR_PORTAIL ? '' : ' — ou Trou du cul —';
const GROS_MOT_EN = SUR_PORTAIL ? '' : ' or Asshole';
const LIEN_REGLES = `https://${ADRESSE_PUBLIQUE}${tr('/regles', '/en/rules')}`;

/** « Défi du 27 sept. » — « Challenge of 27 Sep ». */
const titreDuDefi = (jour: string) => tr(`Défi du ${jourCourt(jour)}`, `Challenge of ${jourCourt(jour)}`);

/** Les morceaux, en anglais : leur nom et ce qu'on y entend. */
const MORCEAUX_EN: Record<keyof typeof MUSIQUES, [string, string]> = {
  casino: ['🎰 Casino', 'A punchy swing: walking bass, cymbal, stabbing piano.'],
  salon: ['🥃 Jazz lounge', 'A brushed ballad: electric piano, soft upright bass.'],
  cabaret: ['🎭 Cabaret', 'A musette waltz on the accordion, a touch nostalgic.'],
  calme: ['🌙 Calm', 'Slow pads, and a few little bells.'],
};
const nomDuMorceau = (cle: keyof typeof MUSIQUES) => (enAnglais ? MORCEAUX_EN[cle][0] : MUSIQUES[cle].nom);
const resumeDuMorceau = (cle: keyof typeof MUSIQUES) => (enAnglais ? MORCEAUX_EN[cle][1] : MUSIQUES[cle].resume);

/** Le rôle tel qu'on l'affiche en pastille : l'identifiant en français, son nom en anglais. */
const pastilleDuRole = (role: Role) => (enAnglais ? ROLES_EN[role] : role);

/* ---------------------------------------------------------------- cartes */

const EST_ROUGE = (c: Card) => c.suit === '♥' || c.suit === '♦';

/** La hauteur d'une carte : V, D, R en français ; J, Q, K en anglais. */
const hauteur = (r: Rank) => (enAnglais ? cartesEnAnglais(`${rankLabel(r)}♠`).slice(0, -1) : rankLabel(r));

function carteHTML(c: Card, classes = ''): string {
  const teinte = EST_ROUGE(c) ? 'rouge' : '';
  return `<button class="carte ${teinte} ${classes}" data-id="${c.id}" type="button">`
    + `<span class="coin">${hauteur(c.rank)}<i>${c.suit}</i></span>`
    + `${dessinDeCarte(c.rank, c.suit)}</button>`;
}

/**
 * Le moteur écrit à la troisième personne (« Hugo pose 7♠ »). Quand le joueur
 * c'est vous, il faut conjuguer : « Vous posez 7♠ ».
 */
const VERBES: Record<string, string> = {
  donne: 'donnez', rend: 'rendez', pose: 'posez',
  passe: 'passez', ouvre: 'ouvrez', termine: 'terminez',
};

function franciser(ligne: string, monNom: string): string {
  if (!ligne) return '';
  const echappe = monNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ligne
    .replace(new RegExp(`^${echappe} `), 'Vous ')
    .replace(new RegExp(` à ${echappe}\\b`, 'g'), ' à vous')
    // « Vous et Lila ont fait leur échange » se dit « … avez fait votre échange ».
    .replace(/^Vous et (.+) ont fait leur échange\.$/, 'Vous et $1 avez fait votre échange.')
    .replace(
      new RegExp(`^(.+) et ${echappe} ont fait leur échange\\.$`),
      'Vous et $1 avez fait votre échange.',
    )
    .replace(/^(.+?) (donne|rend) (.+) à vous\.$/, '$1 vous $2 $3.')
    .replace(/^Vous a fini\b/, 'Vous avez fini')
    .replace(
      /^Vous( \([^)]+\))? (donne|rend|pose|passe|ouvre|termine)\b/,
      (_, role: string | undefined, verbe: string) => `Vous${role ?? ''} ${VERBES[verbe]}`,
    );
}

/* ----------------------------------------------------------------- rendu */

/** Tout le monde autour de la table, moi compris, pour les classements. */
function joueur(vue: PlayerView, id: string) {
  if (id === vue.me.id) {
    return {
      nom: tr('Vous', 'You'), role: vue.me.role, points: vue.me.points,
      finishedOnTwo: vue.me.finishedOnTwo, estMoi: true,
    };
  }
  const o = vue.others.find((x) => x.id === id)!;
  return {
    nom: o.name, role: o.role, points: o.points,
    finishedOnTwo: o.finishedOnTwo, estMoi: false,
  };
}

function rendreScores(vue: PlayerView): void {
  const marques = [
    `<span class="marque moi">${tr('Vous', 'You')} <b>${vue.me.points}</b></span>`,
    ...vue.others.map((o) => `<span class="marque">${o.name} <b>${o.points}</b></span>`),
  ];
  $('tableau-scores').innerHTML = `${marques.join('')}<span class="objectif">${tr('objectif', 'target')} ${vue.objectif}</span>`;
}

/**
 * La bulle d'un joueur qui vient de réagir. L'affichage est redessiné à chaque
 * message du serveur : pour que la bulle ne rejaillisse pas à chaque fois, on
 * reprend son animation là où elle en était, avec un délai négatif.
 */
function bulle(id: string): string {
  const r = table?.reactions?.().get(id);
  if (!r) return '';
  return `<span class="bulle" style="animation-delay:-${Date.now() - r.recueA}ms">${r.reaction}</span>`;
}

/** Redessine au moment où la plus proche des bulles doit s'effacer. */
function programmerBulles(): void {
  clearTimeout(minuteurBulles);
  const bulles = table?.reactions?.();
  if (!bulles) return;
  const restes = [...bulles.values()].map((r) => DUREE_REACTION - (Date.now() - r.recueA));
  if (restes.length > 0) minuteurBulles = setTimeout(rendre, Math.max(50, Math.min(...restes) + 20));
}

/**
 * L'avatar d'un joueur à table : le mien, celui qu'un autre a choisi en ligne,
 * ou celui des bots.
 */
function avatarDe(id: string): string {
  if (!table) return '';
  if (id === table.moi) return avatarChoisi();
  if (table instanceof TableEnLigne) {
    const siege = table.salon()?.sieges.find((s) => s.id === id);
    return siege?.avatar ?? (siege?.estBot ? '🤖' : '🙂');
  }
  return BOTS_SOLO[id] ?? '🤖';
}

/** L'avatar d'un siège de salle d'attente, tel que le serveur l'a transmis. */
const avatarDuSiege = (s: { avatar: string | null; estBot: boolean }) =>
  `<span class="avatar">${s.avatar ?? (s.estBot ? '🤖' : '🙂')}</span>`;

/** Un joueur avec un compte : son nom est un pseudo réservé, on le signale. */
const marqueDeCompte = (s: { compte?: boolean }) =>
  (s.compte ? `<span class="verifie" title="${tr('Joueur avec un compte', 'Player with an account')}">✓</span>` : '');

function rendreAdversaires(vue: PlayerView): void {
  $('adversaires').innerHTML = vue.others.map((o) => {
    const actif = vue.turnPlayer === o.id && vue.phase === 'jeu';
    const dos = Math.min(3, o.count);
    // Une série ne fait qu'un tour : savoir qui a déjà parlé change tout.
    // Et quand la table attend quelqu'un qui a décroché, il faut le dire.
    const etatTexte = !o.connecte ? tr('déconnecté', 'offline')
      : o.count === 0 ? tr(`sorti ${rang(o.finishedAt! + 1)}`, `out ${rang(o.finishedAt! + 1)}`)
      : o.passed ? tr('a passé', 'passed')
      : o.aAgi ? tr('a joué', 'played') : '';
    const classes = [
      actif ? 'actif' : '',
      o.count === 0 ? 'sorti' : '',
      o.connecte ? '' : 'absent',
    ].join(' ');
    return `<div class="joueur ${classes}" data-joueur="${o.id}">
      <span class="medaillon">${avatarDe(o.id)}</span>
      <span class="nom">${o.name}</span>
      <div class="dos-pile">
        ${'<div class="dos"></div>'.repeat(dos)}
        ${o.count > 0 ? `<span class="compte">${o.count}</span>` : ''}
      </div>
      ${o.role ? `<span class="role ${o.role}">${pastilleDuRole(o.role)}</span>` : ''}
      <span class="etat">${etatTexte}</span>
      ${bulle(o.id)}
    </div>`;
  }).join('');
}

/**
 * Le dernier coup joué. Quand une série se clôt, le moteur écrit trois lignes
 * d'affilée — le coup, la fin de série, le nouvel ouvreur — et on perdrait le
 * coup gagnant en ne montrant que la dernière.
 */
function dernierCoup(vue: PlayerView): string {
  for (let i = vue.log.length - 1; i >= 0; i--) {
    const ligne = vue.log[i];
    if (ligne.startsWith('--- Manche')) break;   // ne pas remonter dans la manche d'avant
    if (!/ (pose|passe)[ .]/.test(ligne)) continue;
    // Sans cette mention, la série s'arrêterait sans qu'on comprenne pourquoi.
    const coupe = vue.log[i + 1]?.startsWith('Le 2 coupe');
    if (!coupe) return dansLaLangue(ligne, vue.me.name);
    return `${dansLaLangue(ligne, vue.me.name).replace(/\.$/, '')} — ${tr('le 2 coupe', 'the 2 cuts')}.`;
  }
  return dansLaLangue(vue.log[vue.log.length - 1] ?? '', vue.me.name);
}

/** Une ligne du moteur, dite au joueur : conjuguée en français, traduite en anglais. */
const dansLaLangue = (ligne: string, moi: string) => (enAnglais ? ligneEnAnglais(ligne, moi) : franciser(ligne, moi));

/** D'où part — et où revient — ce qui se joue : la main du joueur, ou le paquet d'un adversaire. */
function placeDuJoueur(id: string, vue: PlayerView): DOMRect | null {
  if (id === vue.me.id) return $('ma-main').getBoundingClientRect();
  const siege = document.querySelector<HTMLElement>(`#adversaires [data-joueur="${CSS.escape(id)}"]`);
  return (siege?.querySelector('.dos') ?? siege)?.getBoundingClientRect() ?? null;
}

function rendreTapis(vue: PlayerView): void {
  const dernier = vue.pile[vue.pile.length - 1];
  const signature = dernier ? `${dernier.player}:${dernier.cards.map((c) => c.id).join(',')}` : '';
  if (signature !== poseAffichee) {
    poseAffichee = signature;
    const pose = $('pose');
    // Avant de redessiner : où sont les cartes qui vont bouger (voir mouvements.ts).
    const anciennes = [...pose.querySelectorAll<HTMLElement>('.carte')];
    const dansMaMain = placesDesCartes($('ma-main'));
    // Un coup qui ouvre une série : celui qui la joue vient de ramasser le pli.
    const ramasse = dernier && vue.pile.length === 1 ? placeDuJoueur(dernier.player, vue) : null;
    if (anciennes.length > 0) emporter(anciennes, ramasse);
    pose.classList.toggle('de-moi', dernier?.player === vue.me.id);
    pose.innerHTML = dernier ? sortHand(dernier.cards).map((c) => carteHTML(c)).join('') : '';
    if (dernier && enMouvement()) {
      const depuis = placeDuJoueur(dernier.player, vue);
      pose.querySelectorAll<HTMLElement>('.carte').forEach((carte, i) => {
        const origine = dansMaMain.get(carte.dataset.id!) ?? depuis;
        if (origine) poser(carte, origine, i);
      });
    }
  }
  // Série close : les cartes restent visibles, mais elles ne comptent plus.
  $('pose').classList.toggle('finie', vue.requirement === null && vue.pile.length > 0);

  const exigence = $('exigence');
  if (vue.requirement) {
    const { count, rank } = vue.requirement;
    exigence.textContent = tr(
      `Il faut ${count === 1 ? 'une carte' : `${count} cartes`} au-dessus du ${hauteur(rank)}`,
      `${count === 1 ? 'One card' : `${count} cards`} higher than ${hauteur(rank)}`,
    );
    exigence.classList.remove('vide');
  } else {
    exigence.textContent = tr('Tapis libre — posez ce que vous voulez', 'Open table — play anything');
    exigence.classList.add('vide');
  }

  $('annonce').textContent = annonce;
}

/**
 * Ce que les adversaires peuvent encore détenir. À une vraie table l'information
 * est publique — et les bots la comptent, alors autant qu'elle soit lisible.
 */
function rendreRestantes(vue: PlayerView): void {
  const zone = $('restantes');
  zone.hidden = !restantesVisibles;
  if (!restantesVisibles) return;
  zone.innerHTML = vue.restantes.slice()
    .sort((a, b) => b[0] - a[0])
    .map(([rang, reste]) => `<span class="hauteur ${reste === 0 ? 'epuisee' : ''}">`
      + `${hauteur(rang)} <b>${reste}</b></span>`)
    .join('');
}

function rendreMaMain(vue: PlayerView): void {
  const rangs = rangsJouables(vue);
  const monTour = vue.turnPlayer === vue.me.id && vue.phase === 'jeu';
  const avant = placesDesCartes($('ma-main'));

  $('ma-main').innerHTML = sortHand(vue.me.hand).map((c) => {
    const jouable = rangs.has(c.rank);
    return carteHTML(c, [
      selection.includes(c.id) ? 'choisie' : '',
      monTour && jouable ? 'jouable' : '',
      monTour && !jouable ? 'morte' : '',
    ].join(' '));
  }).join('');

  ajusterChevauchement(vue.me.hand.length);
  // Les cartes restantes se resserrent ; une donne se distribue depuis le tapis.
  replacerLaMain($('ma-main'), avant, $('pose').getBoundingClientRect());

  const role = vue.me.role ? `<span class="role ${vue.me.role}">${pastilleDuRole(vue.me.role)}</span>` : '';
  // En ligne, de quoi réagir : un bouton, et la palette quand on l'ouvre.
  const reagir = table instanceof TableEnLigne
    ? `${bulle(vue.me.id)}<button id="reagir" class="${paletteOuverte ? 'actif' : ''}" type="button"
         title="${tr('Réagir', 'React')}">😊</button>${paletteOuverte ? `<div class="palette">${REACTIONS
      .map((r) => `<button data-reaction="${r}" type="button">${r}</button>`).join('')}</div>` : ''}`
    : '';
  $('ma-ligne').innerHTML = `<span class="medaillon">${avatarDe(vue.me.id)}</span>${role}`
    + `<span>${tr('Manche', 'Round')} ${vue.round} — ${pluriel(vue.me.hand.length, ['carte', 'cartes'], ['card', 'cards'])}</span>${reagir}`;

  const poser = $('poser') as HTMLButtonElement;
  const passer = $('passer') as HTMLButtonElement;
  const coup = coupChoisi(vue);
  const manquantes = vue.requirement ? vue.requirement.count - selection.length : 0;
  poser.disabled = !coup;
  poser.textContent = !coup && selection.length > 0 && manquantes > 0
    ? tr(`Encore ${manquantes} carte${manquantes > 1 ? 's' : ''}`, `${manquantes} more card${manquantes > 1 ? 's' : ''}`)
    : tr('Poser', 'Play');
  passer.disabled = !(monTour && vue.canPass);
}

/** Les cartes doivent tenir dans la largeur : elles se chevauchent juste ce qu'il faut. */
function ajusterChevauchement(n: number): void {
  const zone = $('ma-main');
  const carte = zone.querySelector('.carte') as HTMLElement | null;
  if (!carte || n < 2) {
    zone.style.setProperty('--chevauchement', '0px');
    return;
  }
  const debord = n * carte.offsetWidth - (zone.clientWidth - 12);
  zone.style.setProperty('--chevauchement', debord > 0 ? `${debord / (n - 1) + 0.5}px` : '0px');
}

function rendre(): void {
  const vue = table?.vue() ?? null;
  $('table').hidden = !vue;
  if (!vue) return;
  rendreScores(vue);
  rendreAdversaires(vue);
  rendreTapis(vue);
  rendreRestantes(vue);
  rendreMaMain(vue);
  programmerBulles();
}

/* ------------------------------------------------------------- décisions */

/**
 * Les hauteurs qui mènent à un coup possible. On raisonne en hauteurs, pas en
 * cartes : avec trois 2 en main, les trois sont bons pour en poser deux.
 */
function rangsJouables(vue: PlayerView): Set<Rank> {
  return new Set(vue.legal.map((play) => play[0].rank));
}

function tailleMax(vue: PlayerView, rank: Rank): number {
  if (vue.requirement) return vue.requirement.count;
  return vue.me.hand.filter((c) => c.rank === rank).length;
}

function coupChoisi(vue: PlayerView): Card[] | null {
  if (selection.length === 0 || vue.turnPlayer !== vue.me.id || vue.phase !== 'jeu') return null;
  const cartes = selection
    .map((id) => vue.me.hand.find((c) => c.id === id))
    .filter((c): c is Card => Boolean(c));
  if (cartes.length !== selection.length) return null;

  const rank = cartes[0].rank;
  if (cartes.some((c) => c.rank !== rank)) return null;
  const possible = vue.legal.some((p) => p[0].rank === rank && p.length === cartes.length);
  return possible ? cartes : null;
}

function choisirCarte(id: string): void {
  const vue = table?.vue();
  if (!vue || vue.phase !== 'jeu' || vue.turnPlayer !== vue.me.id) return;

  const carte = vue.me.hand.find((c) => c.id === id);
  if (!carte || !rangsJouables(vue).has(carte.rank)) return;

  if (selection.includes(id)) {
    selection = selection.filter((x) => x !== id);
    rendre();
    return;
  }
  // On ne mélange pas les hauteurs : choisir un 8 après un 7 repart du 8.
  const memeHauteur = selection.every((autre) => {
    const c = vue.me.hand.find((x) => x.id === autre);
    return c && c.rank === carte.rank;
  });
  selection = [...(memeHauteur ? selection : []), id].slice(-tailleMax(vue, carte.rank));
  rendre();
}

function agir(action: Action): void {
  selection = [];
  table!.envoyer(action);
}

/* ---------------------------------------------------------- la boucle */

function surChangement(): void {
  const vue = table?.vue() ?? null;
  if (vue) annonce = dernierCoup(vue);
  ecouter(vue);
  // Une donne se regarde une fois, à son arrivée — pas dans le didacticiel,
  // dont les mains sont écrites d'avance.
  if (vue && vue.phase === 'jeu' && table?.mode !== 'didacticiel') {
    annoncerSucces(succesApresDonne(vue.partie, vue.round, vue.me.hand));
  }
  // Les succès que le serveur a vérifiés, pendant une partie en ligne.
  if (table instanceof TableEnLigne) {
    const verifies = table.retirerSucces();
    if (verifies.length > 0) {
      annoncerSucces(adopterSucces(verifies.map((id) => ({ id, date: new Date().toISOString() }))));
    }
  }
  direAuPortail();
  rendre();
  boucle();
}

/**
 * Chez un portail, on lui dit où l'on en est : si une partie se joue, et dans
 * quel salon privé on est assis — c'est ce qui permet à un ami de nous y
 * rejoindre depuis le portail. Muet partout ailleurs.
 */
function direAuPortail(): void {
  if (!SUR_PORTAIL) return;
  const phase = table?.vue()?.phase;
  direSiOnJoue(phase === 'jeu' || phase === 'coupe');
  const salon = table instanceof TableEnLigne ? table.salon() : null;
  direLeSalon(salon && !salon.publique
    ? { code: salon.code, joignable: !salon.commencee && salon.sieges.length < salon.taille }
    : null);
}

/** Compare la table à ce qu'elle était, et fait entendre ce qui a changé. */
function ecouter(vue: PlayerView | null): void {
  if (!table) return;
  const maintenant: Instant = { vue, salon: table instanceof TableEnLigne ? table.salon() : null };
  jouerSons(quoiEntendre(entendu, maintenant, table.moi, table.mode === 'en-ligne'));
  entendu = maintenant;

  // La réaction d'un autre fait un petit « pop » ; la sienne, on la connaît.
  const bulles = table.reactions?.();
  if (bulles) {
    for (const [de, r] of bulles) {
      if (r.recueA <= derniereBulleEntendue) continue;
      derniereBulleEntendue = r.recueA;
      if (de !== table.moi) jouerSons(['reaction']);
    }
  }
}

/** La clochette de la barre : barrée quand les sons sont coupés. */
function afficherClochette(): void {
  const actifs = sonsActifs();
  $('sons').innerHTML = icone(actifs ? 'cloche' : 'cloche-coupee');
  $('sons').title = actifs ? tr('Couper les sons', 'Mute sounds') : tr('Remettre les sons', 'Unmute sounds');
  $('sons').classList.toggle('coupes', !actifs);
  // La note de musique, pâlie tant qu'aucun morceau ne joue.
  const musique = musiqueChoisie();
  $('musique-choix').classList.toggle('coupes', !musique);
  $('musique-choix').title = musique
    ? `${tr('Musique', 'Music')} : ${nomDuMorceau(musique)}` : tr('Mettre de la musique', 'Play music');
}

/**
 * Le choix de la musique. Un morceau démarre dès qu'on le touche : on choisit
 * à l'oreille, pas sur la description.
 */
function voileMusique(retour: () => void): void {
  suspendre(true);
  const actuelle = musiqueChoisie();
  const choix = ORDRE_MUSIQUES.map((cle) => `
    <button data-musique="${cle}" class="${cle === actuelle ? 'actif' : ''}" type="button">
      <b>${nomDuMorceau(cle)}</b><small>${resumeDuMorceau(cle)}</small>
    </button>`).join('');

  montrerVoile(`
    <h2>${tr('La musique', 'Music')}</h2>
    <p>${tr('Touchez un morceau pour l’écouter : il continue pendant la partie.',
      'Tap a track to hear it: it keeps playing during the game.')}</p>
    <div class="musiques">
      ${choix}
      <button data-musique="" class="${actuelle ? '' : 'actif'}" type="button"><b>🔇 ${tr('Pas de musique', 'No music')}</b></button>
    </div>
    <button class="action primaire" id="fermer-musique" type="button">${tr('Revenir', 'Back')}</button>
  `);

  $('voile').querySelectorAll('[data-musique]').forEach((b) => {
    b.addEventListener('click', () => {
      const cle = ORDRE_MUSIQUES.find((m) => m === (b as HTMLElement).dataset.musique) ?? null;
      choisirMusique(cle);
      afficherClochette();
      voileMusique(retour);
    });
  });
  $('fermer-musique').addEventListener('click', () => {
    suspendre(false);
    retour();
  });
}

/**
 * Le même réglage dans les salles d'attente, où la barre n'est pas visible —
 * c'est justement là qu'on guette l'arrivée des autres.
 */
const interrupteurSons = () => `<button class="lien" id="sons-salon" type="button">${sonsActifs()
  ? tr('🔔 Sons activés — couper', '🔔 Sounds on — mute') : tr('🔕 Sons coupés — remettre', '🔕 Sounds off — unmute')}</button>`;

function brancherInterrupteurSons(): void {
  $('sons-salon').addEventListener('click', () => {
    reglerSons(!sonsActifs());
    afficherClochette();
    $('sons-salon').outerHTML = interrupteurSons();
    brancherInterrupteurSons();
  });
}

function boucle(): void {
  clearTimeout(minuteur);
  if (!table || voileManuel) return;

  const enLigne = table instanceof TableEnLigne ? table : null;
  const vue = table.vue();

  if (!vue) {
    if (enLigne) voileSalon(enLigne);
    return;
  }

  // Le didacticiel n'a ni manches ni coupe : il enchaîne des situations, et
  // affiche sa consigne au-dessus du tapis.
  const cours = table instanceof TableDidacticiel ? table : null;
  $('lecon').hidden = !cours;
  if (cours) {
    $('lecon').innerHTML = `<span class="etape">${cours.numero()}</span>${cours.consigne()}`;
    const morale = cours.morale();
    if (morale) return voileMorale(cours, morale);
    cacherVoile();
  } else {
    if (vue.phase === 'fin-de-partie') return voileFinDePartie(vue);
    if (vue.phase === 'fin-de-manche') return voileFinDeManche(vue);
    if (vue.phase === 'coupe') return voileCoupe(vue);

    if (vue.round > mancheAnnoncee && vue.round > 1) {
      return voileDebutDeManche(vue);
    }
    mancheAnnoncee = Math.max(mancheAnnoncee, vue.round);
    cacherVoile();
  }

  // Un joueur présent mais muet finirait par bloquer la table : elle joue pour
  // lui au bout d'une minute. Autant l'avertir, plutôt que de le faire dans
  // son dos — et seulement sur la fin, pour ne pas mettre la pression.
  if (enLigne && vue.turnPlayer === vue.me.id && vue.legal.length > 0) {
    const reste = enLigne.delaiPourJouer();
    if (reste !== null) {
      if (reste <= 15) {
        $('annonce').textContent = reste > 0
          ? tr(`À vous — la table jouera pour vous dans ${reste} s.`, `Your turn — the table will play for you in ${reste} s.`)
          : tr('La table joue pour vous…', 'The table is playing for you…');
      }
      // On se redonne la main chaque seconde, même quand il reste du temps :
      // pendant son tour, le joueur ne reçoit plus rien du serveur, donc rien
      // ne viendrait réévaluer le délai — et l'avertissement, placé sous cette
      // condition, ne serait jamais apparu.
      minuteur = setTimeout(boucle, 1000);
      return;
    }
  }

  // Aucun coup possible : la règle impose de passer, autant le faire pour vous.
  if (vue.turnPlayer === vue.me.id && vue.legal.length === 0 && vue.canPass) {
    annonce = tr('Vous ne pouvez pas monter.', 'You cannot go higher.');
    $('annonce').textContent = annonce;
    minuteur = setTimeout(() => agir({ type: 'passer', player: vue.me.id }), 1100);
  }
}

/* ------------------------------------------------------------- les voiles */

function montrerVoile(html: string, classe = ''): void {
  $('voile').innerHTML = `<div class="panneau${classe ? ` ${classe}` : ''}">${html}</div>`;
  $('voile').hidden = false;
}

function cacherVoile(): void {
  $('voile').hidden = true;
  $('voile').innerHTML = '';
}

/**
 * La coupe du Boss. On ne mélange pas entre deux manches : couper est le seul
 * hasard qui reste, et c'est son privilège.
 */
function voileCoupe(vue: PlayerView): void {
  const boss = [vue.me, ...vue.others].find((p) => p.role === 'boss');

  if (!vue.coupe) {
    // Les autres attendent, et méritent de savoir pourquoi.
    montrerVoile(`
      <h2>${tr('Manche', 'Round')} ${vue.round}</h2>
      <p>${tr(`${boss ? boss.name : 'Le Boss'} coupe le paquet — on ne mélange pas entre deux manches.`,
        `${boss ? boss.name : 'The Boss'} cuts the deck — cards are not shuffled between rounds.`)}</p>
    `);
    return;
  }

  // Ne pas reconstruire le panneau sous les doigts du joueur.
  if (document.getElementById('coupe-position')) return;

  const taille = vue.coupe.taille;
  const milieu = Math.floor(taille / 2);

  montrerVoile(`
    <h2>${tr('À vous de couper', 'Your cut')}</h2>
    <p>${tr(`Les cartes n'ont pas été mélangées : elles sont dans l'ordre où elles sont
       tombées la manche dernière. Coupez où vous le sentez — vous retournerez la
       première carte, et vous la garderez.`,
    `The cards have not been shuffled: they are in the order they fell last round.
       Cut wherever you like — you will turn over the first card, and keep it.`)}</p>
    <label class="champ">${tr('Couper après', 'Cut after')} <b id="coupe-compte">${milieu}</b> ${tr('cartes', 'cards')}
      <input id="coupe-position" type="range" min="1" max="${taille - 1}" value="${milieu}">
    </label>
    <button class="action primaire" id="couper" type="button">${tr('Couper ici', 'Cut here')}</button>
  `);

  const curseur = $('coupe-position') as HTMLInputElement;
  curseur.addEventListener('input', () => {
    $('coupe-compte').textContent = curseur.value;
  });
  $('couper').addEventListener('click', () => {
    cacherVoile();
    agir({ type: 'couper', player: vue.me.id, position: Number(curseur.value) });
  });
}

/**
 * Le récapitulatif de début de manche ne montre que vos propres échanges :
 * ce qui passe entre deux autres joueurs ne vous regarde pas.
 */
function voileDebutDeManche(vue: PlayerView): void {
  mancheAnnoncee = vue.round;
  // Sans ça, le premier coup du Boss refermerait le panneau avant qu'on ait eu
  // le temps de lire ce qui a changé de main.
  suspendre(true);
  const boss = [vue.me, ...vue.others].find((p) => p.role === 'boss');
  const bossCestMoi = boss?.id === vue.me.id;
  const ouvre = !boss ? '' : bossCestMoi
    ? tr('Vous ouvrez la manche.', 'You open the round.')
    : tr(`${boss.name} ouvre la manche.`, `${boss.name} opens the round.`);

  const phrases = vue.mesEchanges.map((m) => {
    const jeCede = m.de === vue.me.id;
    const autre = joueur(vue, jeCede ? m.vers : m.de).nom;
    const cartes = m.cartes.map((c) => `${hauteur(c.rank)}${c.suit}`).join(' ');
    if (m.sens === 'donner') {
      return jeCede ? tr(`Vous cédez ${cartes} à ${autre}.`, `You give ${cartes} to ${autre}.`)
        : tr(`${autre} vous cède ${cartes}.`, `${autre} gives you ${cartes}.`);
    }
    return jeCede ? tr(`Vous rendez ${cartes} à ${autre}.`, `You hand back ${cartes} to ${autre}.`)
      : tr(`${autre} vous rend ${cartes}.`, `${autre} hands you back ${cartes}.`);
  });

  const coupee = vue.carteMontree;
  const montree = coupee ? `${hauteur(coupee.rank)}${coupee.suit}` : '';
  const laCoupe = !coupee ? '' : `<p>${bossCestMoi
    ? tr(`Vous coupez et montrez ${montree} — elle vous revient.`, `You cut and show ${montree} — it is yours.`)
    : tr(`${boss?.name} coupe et montre ${montree} — elle lui revient.`, `${boss?.name} cuts and shows ${montree} — it is theirs.`)}</p>`;

  montrerVoile(`
    <h2>${tr('Manche', 'Round')} ${vue.round}</h2>
    ${laCoupe}
    ${phrases.length ? `<p>${phrases.map((p) => `• ${p}`).join('<br>')}</p>` : ''}
    <p>${ouvre}</p>
    <button class="action primaire" id="commencer" type="button">${tr('Jouer', 'Play')}</button>
  `);
  $('commencer').addEventListener('click', () => {
    suspendre(false);
    cacherVoile();
    boucle();
  });
}

function lignesDuClassement(vue: PlayerView): string {
  const n = vue.classement.length;
  return vue.classement.map((id, i) => {
    const p = joueur(vue, id);
    const deux = p.finishedOnTwo ? ` <span class="sur-un-deux">${tr('fini sur un 2', 'finished on a 2')}</span>` : '';
    return `<li>
      <span class="place">${rang(i + 1)}</span>
      <span><span class="avatar">${avatarDe(id)}</span>${p.nom}${deux}</span>
      <span class="gain">+${n - 1 - i} → ${p.points}</span>
      <span class="role ${p.role}">${TITRES[p.role!]}</span>
    </li>`;
  }).join('');
}

function voileFinDeManche(vue: PlayerView): void {
  if (vue.me.role) {
    noterManche(vue.partie, vue.round, vue.me.role, vue.me.finishedOnTwo);
    annoncerSucces(succesApresManche(vue.partie, vue.round, vue.me.role, vue.me.finishedOnTwo));
    synchroniserBientot();
  }

  // Le défi du jour s'arrête à sa dernière manche : place au score.
  if (table instanceof TableDefi && vue.me.role) {
    const { bilan, acheve } = table.noterManche(vue.round, vue.me.role, vue.me.points);
    if (acheve) compter('defi-fini');
    if (bilan.fini) {
      voileDefiFini(bilan, revenirAccueil);
      return;
    }
  }

  const verdict = vue.me.role === 'boss' ? tr('Vous êtes le Boss.', 'You are the Boss.')
    : vue.me.role === 'larbin' ? tr('Vous voilà Larbin. La prochaine manche va piquer.', 'You are the Lackey. Next round is going to sting.')
    : tr(`Vous finissez ${TITRES[vue.me.role!]}.`, `You finish as ${TITRES[vue.me.role!]}.`);

  const tous = [{ id: vue.me.id, points: vue.me.points }, ...vue.others];
  const meneur = [...tous].sort((a, b) => b.points - a.points)[0];
  const restant = vue.objectif - meneur.points;
  const moiEnTete = meneur.id === vue.me.id;
  const pts = pluriel(restant, ['point', 'points'], ['point', 'points']);
  const course = restant > 3 ? '' : ` ${tr(
    `${moiEnTete ? 'Vous êtes' : `${joueur(vue, meneur.id).nom} est`} à ${pts} de la partie.`,
    `${moiEnTete ? 'You are' : `${joueur(vue, meneur.id).nom} is`} ${pts} away from winning the game.`,
  )}`;

  montrerVoile(`
    <h2>${tr(`Fin de la manche ${vue.round}`, `End of round ${vue.round}`)}</h2>
    <p>${verdict}${course}</p>
    <ul class="classement">${lignesDuClassement(vue)}</ul>
    <button class="action primaire" id="suivante" type="button">${tr('Manche suivante', 'Next round')}</button>
  `);
  $('suivante').addEventListener('click', () => {
    cacherVoile();
    annonce = '';
    agir({ type: 'manche-suivante' });
  });
}

/** Ce que le défi du jour demande, dit avant de commencer : trois lignes, pas plus. */
function voileDefi(bilan: BilanDuDefi): void {
  const entame = bilan.roles.length > 0;
  montrerVoile(`
    <h2>🗓️ ${titreDuDefi(bilan.jour)}</h2>
    <ul class="vite">${tr(`
      <li><b>La même donne pour tout le monde</b>, aujourd’hui : comparez vos scores.</li>
      <li><b>${DEFI_MANCHES} manches</b> contre les bots. Le Boss prend 3 points, le Larbin rien :
          ${DEFI_MAXIMUM} au mieux.</li>
      <li><b>Un seul essai.</b> Un nouveau défi chaque jour à minuit.</li>`, `
      <li><b>The same deal for everyone</b> today: compare your scores.</li>
      <li><b>${DEFI_MANCHES} rounds</b> against the bots. The Boss scores 3 points, the Lackey nothing:
          ${DEFI_MAXIMUM} at best.</li>
      <li><b>One try only.</b> A new challenge every day at midnight (Paris time).</li>`)}
    </ul>
    <button class="action primaire" id="defi-go" type="button">${entame
      ? tr('Reprendre le défi', 'Resume the challenge') : tr('C’est parti', 'Let’s go')}</button>
    <button class="action" id="defi-retour" type="button">${tr('Revenir', 'Back')}</button>
  `);
  $('defi-go').addEventListener('click', () => {
    if (!entame) compter('defi-lance');
    cacherVoile();
    installer(new TableDefi(bilan.jour));
  });
  $('defi-retour').addEventListener('click', voileAccueil);
}

/** Le score du défi : les rôles en émojis, à comparer — et à envoyer. */
function voileDefiFini(bilan: BilanDuDefi, retour: () => void): void {
  const horsLigne = location.protocol === 'file:';
  const stats = statsDuDefi(noterDansLHistorique(bilan), bilan.jour);
  const s = (n: number) => (n > 1 ? 's' : '');
  montrerVoile(`
    <h2>🗓️ ${titreDuDefi(bilan.jour)}</h2>
    <p class="score-defi"><b>${bilan.points}</b>/${DEFI_MAXIMUM}</p>
    <p class="roles-defi" aria-label="${bilan.roles.map((r) => TITRES[r]).join(', ')}">${emojisDuDefi(bilan)}</p>
    <div class="compteurs stats-defi">
      <div><b>${stats.serie >= 2 ? '🔥 ' : ''}${stats.serie}</b><span>${tr(`jour${s(stats.serie)} de suite`, `day${stats.serie === 1 ? '' : 's'} in a row`)}</span></div>
      <div><b>${stats.record}</b><span>record</span></div>
      <div><b>${stats.joues}</b><span>${tr(`défi${s(stats.joues)} joué${s(stats.joues)}`, `challenge${stats.joues === 1 ? '' : 's'} played`)}</span></div>
      <div><b>${stats.moyenne.toLocaleString(tr('fr-FR', 'en-GB'))}</b><span>${tr('points en moyenne', 'average points')}</span></div>
    </div>
    ${horsLigne ? '' : `<div id="classement-defi"><p class="mention">${tr('On compare les scores du jour…', 'Comparing today’s scores…')}</p></div>`}
    <p class="mention">${tr('Même donne pour tout le monde : défiez vos proches. Prochain défi à minuit.',
      'Same deal for everyone: challenge your friends. Next challenge at midnight (Paris time).')}</p>
    <button class="action primaire" id="defi-partager" type="button">${tr('Partager mon score', 'Share my score')}</button>
    <button class="action" id="defi-fin" type="button">${tr('Revenir à l’accueil', 'Back to home')}</button>
  `);
  $('defi-partager').addEventListener('click', (e) => {
    // Le lien mène droit au défi du jour, et se reconnaît aux compteurs.
    void partager(e.currentTarget as HTMLElement, texteDuDefi(bilan, stats.serie), lienDuSite('defi'));
  });
  $('defi-fin').addEventListener('click', retour);
  if (!horsLigne) void afficherLeClassementDuDefi(bilan);
}

/**
 * Envoie le score s'il ne l'est pas encore — le serveur le vérifie en rejouant
 * la partie — puis montre les meilleurs du jour.
 */
async function afficherLeClassementDuDefi(bilan: BilanDuDefi): Promise<void> {
  const nom = sessionOuverte()?.pseudo || localStorage.getItem('larbin.nom') || nomPropose();
  const envoye = await envoyerLeDefi(bilan, nom);
  const classement = await classementDuDefi(bilan.jour);
  const cadre = document.getElementById('classement-defi');
  if (!cadre) return;   // le joueur est passé à autre chose
  if (!classement) {
    cadre.innerHTML = `<p class="mention">${tr('Le classement du jour ne répond pas. Il sera là à la prochaine ouverture.',
      'Today’s leaderboard is not responding. It will be there next time you open this.')}</p>`;
    return;
  }
  if (classement.total === 0) {
    cadre.innerHTML = `<p class="mention">${tr('Personne n’est encore classé aujourd’hui.', 'Nobody is ranked yet today.')}</p>`;
    return;
  }
  const joueurs = pluriel(classement.total, ['joueur', 'joueurs'], ['player', 'players']);
  const ma = envoye.place
    ? `<p class="ma-place">${tr(`Vous êtes <b>${rang(envoye.place)}</b> sur ${joueurs} aujourd’hui.`,
      `You are <b>${rang(envoye.place)}</b> of ${joueurs} today.`)}</p>`
    : `<p class="ma-place">${tr(`${joueurs} aujourd’hui.`, `${joueurs} today.`)}</p>`;
  cadre.innerHTML = `${ma}
    <ol class="classement-general defi-du-jour">${classement.lignes.map((l, i) => `<li>
      <span class="rang">${i + 1}</span>
      <span class="qui">${attribut(l.nom)}${marqueDeCompte(l)}</span>
      <span class="roles">${emojisDeLaLigne(l)}</span>
      <b class="points">${l.points}</b>
    </li>`).join('')}</ol>`;
}

/** Les parties solo déjà comptées : réafficher l'écran de fin ne les recompte pas. */
const partiesComptees = new Set<string>();

function voileFinDePartie(vue: PlayerView): void {
  const tous = [
    { id: vue.me.id, nom: tr('Vous', 'You'), points: vue.me.points },
    ...vue.others.map((o) => ({ id: o.id, nom: o.name, points: o.points })),
  ].sort((a, b) => b.points - a.points);
  const vainqueur = tous[0];

  const verdict = vainqueur.id === vue.me.id
    ? tr(`Vous remportez la partie avec ${vue.me.points} points.`, `You win the game with ${vue.me.points} points.`)
    : tr(`${vainqueur.nom} remporte la partie avec ${vainqueur.points} points. Vous en avez ${vue.me.points}.`,
      `${vainqueur.nom} wins the game with ${vainqueur.points} points. You have ${vue.me.points}.`);

  const lignes = tous.map((p, i) => `<li>
      <span class="place">${rang(i + 1)}</span>
      <span><span class="avatar">${avatarDe(p.id)}</span>${p.nom}</span>
      <span class="gain">${p.points} pt${p.points > 1 ? 's' : ''}</span>
    </li>`).join('');

  // Remettre les scores à zéro engage toute la table : en ligne, c'est à l'hôte.
  const enLigne = table instanceof TableEnLigne ? table : null;

  const b = bilan(noterPartie(vue.partie, {
    date: new Date().toISOString(),
    mode: enLigne ? 'en-ligne' : 'solo',
    joueurs: tous.length,
    place: tous.findIndex((p) => p.id === vue.me.id) + 1,
    points: vue.me.points,
    gagnant: vainqueur.id === vue.me.id ? 'Vous' : vainqueur.nom,
    manches: vue.round,
  }));
  // « Premier contact » veut un autre humain en face : seul avec des bots, une
  // table en ligne vaut une partie solo.
  const autresHumains = (enLigne?.salon()?.sieges.filter((s) => !s.estBot).length ?? 0) >= 2;
  annoncerSucces(succesApresPartie(vue.partie, {
    gagne: vainqueur.id === vue.me.id,
    enLigne: autresHumains,
    manches: vue.round,
    parties: b.parties,
    serie: b.serie,
  }));
  synchroniserBientot();
  if (!enLigne && !partiesComptees.has(vue.partie)) {
    partiesComptees.add(vue.partie);
    compter('solo-finie');
  }
  // Le moment où l'on referme une partie est celui où l'on décide d'en relancer
  // une : c'est là, et pas ailleurs, que le compteur a une chance d'être lu.
  const trace = b.serie >= 2 ? tr(`${b.serie} victoires d'affilée.`, `${b.serie} wins in a row.`)
    : b.parties === 1 ? tr('Première partie enregistrée.', 'First game recorded.')
    : tr(`${pluriel(b.victoires, ['victoire', 'victoires'], ['win', 'wins'])} en ${b.parties} parties.`,
      `${pluriel(b.victoires, ['victoire', 'victoires'], ['win', 'wins'])} in ${b.parties} games.`);
  // Une table publique n'a pas d'hôte : tout joueur assis peut relancer.
  const jeRelance = !enLigne
    || (enLigne.salon()?.publique ?? false)
    || (enLigne.salon()?.sieges.find((s) => s.id === enLigne.moi)?.hote ?? false);

  // Le jeu plaît assez pour qu'on y revienne : c'est le moment de proposer
  // l'icône sur l'écran d'accueil.
  const moyen = moyenDInstaller();
  const proposer = !SUR_PORTAIL && moyen !== null && proposerInstallation(b.parties, refusGarde());

  montrerVoile(`
    <h2>${tr('Partie terminée', 'Game over')}</h2>
    <p>${verdict}</p>
    <ul class="classement">${lignes}</ul>
    <p class="trace">${trace} <button class="lien" id="parcours-fin" type="button">${tr('Votre parcours', 'Your record')}</button></p>
    ${proposer ? `<div class="installer" id="installer">
      <p>📲 ${tr('<b>Le Larbin sur votre écran d’accueil</b>, comme une appli : on le retrouve d’un geste.',
        '<b>Le Larbin on your home screen</b>, like an app: one tap away.')}</p>
      <div class="rangee">
        <button class="action" id="installer-oui" type="button">${moyen === 'iphone'
          ? tr('Comment faire ?', 'How?') : tr('Installer', 'Install')}</button>
        <button class="lien" id="installer-non" type="button">${tr('Plus tard', 'Later')}</button>
      </div>
    </div>` : ''}
    <button class="action" id="partager" type="button">${tr('Partager le résultat', 'Share the result')}</button>
    ${jeRelance
      ? `<button class="action primaire" id="rejouer" type="button">${tr('Nouvelle partie', 'New game')}</button>`
      : `<p class="mention">${tr('L’hôte relancera une partie quand vous voudrez.', 'The host will start a new game when you are ready.')}</p>`}
    <button class="action" id="accueil-fin" type="button">${tr('Revenir à l’accueil', 'Back to home')}</button>
  `);

  $('parcours-fin').addEventListener('click', () => voileParcours(() => boucle()));

  $('installer-non')?.addEventListener('click', () => {
    refuser(b.parties);
    $('installer').remove();
  });
  $('installer-oui')?.addEventListener('click', () => {
    if (moyen === 'iphone') {
      // Safari n'a pas de fenêtre d'installation : on dit le geste.
      $('installer').innerHTML = `<p>${tr(`Touchez <b>Partager</b> (le carré avec une flèche vers le haut),
        puis <b>« Sur l’écran d’accueil »</b>. L’icône du Larbin apparaît avec vos applis.`,
      `Tap <b>Share</b> (the square with an arrow pointing up), then <b>“Add to Home Screen”</b>.
        The Larbin icon appears with your apps.`)}</p>`;
      return;
    }
    $('installer').remove();
    void installerLeJeu();
  });

  // Sans lui, la seule issue d'une partie finie était d'en recommencer une.
  $('accueil-fin').addEventListener('click', revenirAccueil);

  // Le message se raconte tout seul : la place, les points, les manches. Perdre
  // se partage aussi bien que gagner — mieux, même, quand c'est pour lancer un défi.
  const maPlace = tous.findIndex((p) => p.id === vue.me.id) + 1;
  const autres = tous.slice(1).map((p) => p.nom).join(', ');
  const recit = maPlace === 1
    ? tr(`J'ai gagné au Larbin : ${vue.me.points} points en ${vue.round} manches, devant ${autres}.`,
      `I won at Le Larbin: ${vue.me.points} points in ${vue.round} rounds, ahead of ${autres}.`)
    : tr(`Le Larbin m'a laissé ${rang(maPlace)} sur ${tous.length} — ${vue.me.points} points `
      + `en ${vue.round} manches. ${vainqueur.nom} a gagné. À vous de faire mieux.`,
    `Le Larbin left me ${rang(maPlace)} of ${tous.length} — ${vue.me.points} points `
      + `in ${vue.round} rounds. ${vainqueur.nom} won. Your turn to do better.`);
  $('partager').addEventListener('click', (e) => {
    void partager(e.currentTarget as HTMLElement, recit, lienDuSite('via=partage'));
  });

  $('rejouer')?.addEventListener('click', () => {
    if (table instanceof TableSolo) {
      cacherVoile();
      mancheAnnoncee = 0;
      poseAffichee = '';
      table.recommencer();
    } else {
      agir({ type: 'nouvelle-partie' });
    }
  });
}

/* ------------------------------------------------- accueil et salon */

/** La marque du jeu : la dame de cœur, et la couronne qu'on se dispute. */
const EMBLEME = `<svg class="embleme" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M18 24V13l7.5 6L32 9l6.5 10L46 13v11z" fill="var(--laiton)"/>
  <path d="M32 54C12 41 14 27 24 27c4.2 0 7 3.2 8 5.4 1-2.2 3.8-5.4 8-5.4 10 0 12 14-8 27z"
        fill="var(--rouge-embleme)"/>
</svg>`;

/**
 * Ce qu'il fallait retenir de la leçon. On ne félicite pas pour féliciter : le
 * texte dit ce que le coup vient de démontrer, et pourquoi la règle est ainsi.
 */
function voileMorale(cours: TableDidacticiel, morale: Morale): void {
  montrerVoile(`
    <h2>${morale.rate ? tr('Le piège s’est refermé', 'The trap snapped shut') : tr('C’est cela', 'That’s it')}</h2>
    <p>${morale.texte}</p>
    ${morale.rate
      ? `<button class="action primaire" id="refaire" type="button">${tr('Réessayer', 'Try again')}</button>`
      : ''}
    <button class="action ${morale.rate ? '' : 'primaire'}" id="suite" type="button">${morale.derniere
      ? tr('Terminer', 'Finish') : tr('Leçon suivante', 'Next lesson')}</button>
  `);

  $('refaire')?.addEventListener('click', () => cours.refaire());
  $('suite').addEventListener('click', () => {
    if (!morale.derniere) {
      cours.suivante();
      return;
    }
    try {
      localStorage.setItem(CLE_DIDACTICIEL, 'fini');
    } catch { /* on le reproposera, ce n'est pas grave */ }
    compter('didacticiel-fini');
    annoncerSucces(succesDidacticiel());
    table = null;
    $('lecon').hidden = true;
    $('table').hidden = true;
    voileAccueil();
  });
}

const CLE_ACCUEILLI = 'larbin.regles-vues';
const CLE_DIDACTICIEL = 'larbin.didacticiel';

/** Le didacticiel a-t-il été suivi jusqu'au bout sur ce navigateur ? */
function didacticielFini(): boolean {
  try {
    return localStorage.getItem(CLE_DIDACTICIEL) === 'fini';
  } catch {
    return false;
  }
}

/** A-t-on déjà expliqué le jeu à ce navigateur ? */
function dejaExplique(): boolean {
  try {
    return localStorage.getItem(CLE_ACCUEILLI) === 'oui';
  } catch {
    return false;   // stockage indisponible : mieux vaut expliquer deux fois que jamais
  }
}

/**
 * Ce qu'il faut savoir pour jouer, et rien de plus.
 *
 * Un visiteur qui ne connaît pas le Président n'avait aucune explication : il
 * tombait sur un tapis, treize cartes et deux boutons, et le jeu lui disait
 * « vous passez » avant qu'il ait rien compris. Cinq lignes suffisent à jouer ;
 * la page des règles est là pour le reste.
 */
function voileBienvenue(suite: () => void, libelle = tr('Revenir', 'Back')): void {
  suspendre(true);
  montrerVoile(`${tr(`
    <h2>Comment on joue</h2>
    <p>Se débarrasser de toutes ses cartes avant les autres.</p>
    <ul class="vite">
      <li><b>Le 2 est la carte la plus forte</b>, devant l’as — et il coupe net :
          dès qu’il tombe, la série s’arrête.</li>
      <li><b>Une série ne fait qu’un tour de table.</b> Chacun ne parle qu’une
          fois ; c’est ce qui sépare le Larbin du Président.</li>
      <li>À votre tour, posez <b>autant de cartes que le joueur précédent</b>,
          d’une hauteur strictement supérieure. Sinon, vous passez.</li>
      <li>Les couleurs ne comptent pas : un 6 de cœur vaut un 6 de trèfle.</li>
      <li>En fin de manche, le premier sorti devient <b>Boss</b> et le dernier
          <b>Larbin</b> — qui lui donnera ses deux meilleures cartes.</li>
    </ul>
    <p class="mention">Un piège à connaître : <b>finir sur un 2 rend Larbin
       d’office</b>. <span class="hors-portail">Pour le détail,
       <a href="${LIEN_REGLES}" target="_blank" rel="noopener">toutes les règles</a>.</span></p>`, `
    <h2>How to play</h2>
    <p>Get rid of all your cards before the others.</p>
    <ul class="vite">
      <li><b>The 2 is the highest card</b>, above the ace — and it cuts:
          as soon as it lands, the trick ends.</li>
      <li><b>A trick goes around the table only once.</b> Everyone speaks just
          once; that is what sets Le Larbin apart from classic President.</li>
      <li>On your turn, play <b>as many cards as the previous player</b>,
          of a strictly higher rank. Otherwise, you pass.</li>
      <li>Suits don’t matter: a 6 of hearts is worth a 6 of clubs.</li>
      <li>At the end of the round, the first one out becomes <b>Boss</b> and the last
          one <b>Lackey</b> — who must hand over their two best cards.</li>
    </ul>
    <p class="mention">One trap to know: <b>finishing on a 2 makes you Lackey
       by default</b>. <span class="hors-portail">For the details,
       <a href="${LIEN_REGLES}" target="_blank" rel="noopener">the full rules</a>.</span></p>`)}
    <button class="action primaire" id="compris" type="button">${libelle}</button>
    <button class="action" id="apprendre" type="button">${tr('Apprendre en jouant — quatre leçons', 'Learn by playing — four lessons')}</button>
  `);

  const noter = () => {
    try {
      localStorage.setItem(CLE_ACCUEILLI, 'oui');
    } catch { /* on réexpliquera, ce n'est pas grave */ }
    suspendre(false);
  };
  $('compris').addEventListener('click', () => {
    noter();
    suite();
  });
  $('apprendre').addEventListener('click', () => {
    noter();
    cacherVoile();
    installer(new TableDidacticiel());
  });
}

/**
 * D'où vient le jeu. Rangé derrière un lien : qui veut lire lit, les autres
 * jouent sans avoir eu à contourner un pavé de texte.
 */
function voileHistoire(retour: () => void): void {
  suspendre(true);
  montrerVoile(enAnglais ? `
    <h2>Where Le Larbin comes from</h2>
    <p>The game belongs to a family born in Asia: <b>climbing games</b>, where you
       go higher, then higher again, and the first player to empty their hand wins.
       It has two famous grandparents — in Japan <b>Dai Hin Min</b>, “the very poor”,
       and its mirror <b>Daifugō</b>, “the very rich”; in China <b>Zheng Shangyou</b>,
       “the race to the top”.</p>
    <p>What makes the family is not the card mechanics. It is the <b>social
       reversal</b>: the last serves the first, and everything is replayed in the
       next round. The Japanese names say it better than ours.</p>
    <p>The game reached the West in the second half of the 20th century and took on
       table names — President, Scum${SUR_PORTAIL ? '' : ', Asshole'}, and in France ${SUR_PORTAIL ? '' : 'Trou du cul or '}Larbin
       (“the lackey”) — each with its house rules, passed on by word of mouth and
       never written down.</p>
    <p>These are ours: a trick goes around only once, the 2 cuts, cards are not
       shuffled between rounds, and the queen of hearts opens the very first game.</p>
    <p class="mention hors-portail"><a href="${LIEN_REGLES}" target="_blank" rel="noopener">The full rules</a>
       — classic President and our variant.</p>
    <button class="action primaire" id="fermer-histoire" type="button">Back</button>
  ` : `
    <h2>D'où vient le Larbin</h2>
    <p>Le jeu appartient à une famille née en Asie : les <b>jeux d'escalade</b>,
       où l'on monte, où l'on monte encore, et où le premier débarrassé l'emporte.
       On lui reconnaît deux grands parents — au Japon le <b>Dai Hin Min</b>,
       « le grand pauvre », et son miroir le <b>Daifugō</b>, « le grand riche » ;
       en Chine le <b>Zheng Shangyou</b>, « la course vers le haut ».</p>
    <p>Ce qui fait la famille, ce n'est pas la mécanique des cartes. C'est
       l'<b>inversion sociale</b> : le dernier sert le premier, et tout se rejoue
       à la manche suivante. Les noms japonais le disent mieux que les nôtres.</p>
    <p>Le jeu gagne l'Occident dans la seconde moitié du XX<sup>e</sup> siècle et
       prend chez nous des noms de table — Président, ${SUR_PORTAIL ? '' : 'Trou du cul, '}Larbin —
       chacun avec ses règles maison, transmises de bouche à oreille sans jamais
       être écrites.</p>
    <p>Celles-ci sont les vôtres : une série ne fait qu'un tour, le 2 coupe net,
       on ne mélange pas entre deux manches, et c'est la dame de cœur qui ouvre
       la toute première partie.</p>
    <p class="mention hors-portail"><a href="${LIEN_REGLES}" target="_blank"
       rel="noopener">Les règles, en entier</a> — celles du Président comme celles
       d'ici.</p>
    <button class="action primaire" id="fermer-histoire" type="button">Revenir</button>
  `);
  $('fermer-histoire').addEventListener('click', () => {
    suspendre(false);
    retour();
  });
}

/**
 * Faire sortir quelque chose de cet écran-ci.
 *
 * Sur téléphone — là où le jeu se joue — le navigateur ouvre la feuille de
 * partage du système, et le message part dans la conversation où il a sa place.
 * Ailleurs, on se rabat sur le presse-papiers. Dans les deux cas l'adresse
 * voyage avec le texte : c'est tout l'intérêt de l'affaire.
 */
async function partager(bouton: HTMLElement, texte: string, url: string): Promise<void> {
  compter('partage');
  const repondre = (mot: string) => {
    const avant = bouton.textContent;
    bouton.textContent = mot;
    setTimeout(() => { bouton.textContent = avant; }, 2200);
  };

  if (navigator.share) {
    try {
      await navigator.share({ text: texte, url });
      return;
    } catch (err) {
      // Partage refusé par le joueur : ce n'est pas un échec, on n'insiste pas.
      if ((err as Error)?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${texte} ${url}`);
    repondre(tr('Copié', 'Copied'));
  } catch {
    repondre(tr('Copie impossible', 'Could not copy'));
  }
}

/** « 12 sept. », sans l'année tant qu'on reste dans celle qui court. */
function jourCourt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(tr('fr-FR', 'en-GB'), {
    day: 'numeric', month: 'short', ...(memeAnnee ? {} : { year: 'numeric' }),
  });
}

/**
 * Ce qu'on a laissé derrière soi. Les rôles obtenus disent bien plus que le
 * nombre de victoires : c'est là qu'on voit qu'on a été Larbin trois fois de
 * suite, et c'est ce qui donne envie de rejouer.
 */
function voileParcours(retour: () => void): void {
  suspendre(true);
  const p: Parcours = parcours();
  const b = bilan(p);

  const roles = Object.entries(TITRES) as Array<[Role, string]>;
  const barres = b.manches === 0 ? '' : `
    <div class="roles">${roles.map(([cle, nom]) => {
      const part = Math.round((p.roles[cle] / b.manches) * 100);
      return `<div class="part">
        <span class="nom">${nom}</span>
        <span class="jauge"><i class="${cle}" style="width:${part}%"></i></span>
        <span class="chiffre">${part} %</span>
      </div>`;
    }).join('')}</div>`;

  const dernieres = p.parties.slice(0, 6).map((x) => `<li>
      <span class="place">${rang(x.place)}</span>
      <span>${jourCourt(x.date)}${x.mode === 'en-ligne' ? tr(' · en ligne', ' · online') : ''}</span>
      <span class="gain">${x.points} pt${x.points > 1 ? 's' : ''}</span>
    </li>`).join('');

  const s = (n: number) => (n > 1 ? 's' : '');
  const corps = b.parties === 0
    ? `<p>${tr(`Rien encore. Terminez une partie et elle s'inscrira ici — vos
         victoires, et surtout les rôles que la table vous a réservés.`,
      `Nothing yet. Finish a game and it will show up here — your wins, and above
         all the roles the table handed you.`)}</p>`
    : `<div class="compteurs">
         <div><b>${b.parties}</b><span>${tr(`partie${s(b.parties)}`, `game${s(b.parties)}`)}</span></div>
         <div><b>${b.victoires}</b><span>${tr(`victoire${s(b.victoires)}`, `win${b.victoires === 1 ? '' : 's'}`)}</span></div>
         <div><b>${b.taux} %</b><span>${tr('de réussite', 'win rate')}</span></div>
         <div><b>${b.meilleureSerie}</b><span>${tr('d\'affilée, au mieux', 'best streak')}</span></div>
       </div>
       ${barres}
       ${p.deuxFatals > 0
         ? `<p class="mention">${tr(`Vous avez fini ${p.deuxFatals} manche${s(p.deuxFatals)}
            sur un 2 — et payé le prix fort à chaque fois.`,
           `You finished ${p.deuxFatals} round${s(p.deuxFatals)} on a 2 — and paid the price every time.`)}</p>`
         : ''}
       <h3>${tr('Vos dernières parties', 'Your latest games')}</h3>
       <ul class="classement parties">${dernieres}</ul>`;

  montrerVoile(`
    <h2>${tr('Votre parcours', 'Your record')}</h2>
    ${corps}
    <button class="action" id="voir-succes" type="button">🏆 ${tr('Vos succès', 'Your achievements')} — ${nombreDeSucces()} ${tr('sur', 'of')} ${SUCCES.length}</button>
    <button class="action primaire" id="fermer-parcours" type="button">${tr('Revenir', 'Back')}</button>
  `);
  $('voir-succes').addEventListener('click', () => voileSucces(() => voileParcours(retour)));
  $('fermer-parcours').addEventListener('click', () => {
    suspendre(false);
    retour();
  });
}

/*
 * Le signe de vie et le podium de l'accueil. On garde la dernière réponse :
 * revenir d'un panneau réaffiche tout de suite ce qu'on savait, sans que la
 * page saute le temps que le serveur réponde.
 */
let derniereActivite: Activite | null = null;
let dernierPodium: LigneClassement[] = [];
let minuteurVie: ReturnType<typeof setTimeout> | undefined;
let tourDeVie = 0;
const RAFRAICHIR_VIE = 20_000;
const MEDAILLES = ['🥇', '🥈', '🥉'];

const htmlDeVie = (s: SigneDeVie | null) =>
  s ? `<span class="vie${s.vivant ? ' vivant' : ''}">${s.texte}${
    s.detail ? `<span class="detail"> · ${s.detail}</span>` : ''}</span>` : '';

const htmlDuPodium = (lignes: LigneClassement[]) => lignes.length === 0 ? '' : `
  <button class="podium" type="button" title="${tr('Voir le classement', 'See the leaderboard')}">${lignes.map((l, i) => `
    <span title="${attribut(`${l.pseudo} — ${pluriel(l.victoires, ['victoire', 'victoires'], ['win', 'wins'])}`)}">
      ${MEDAILLES[i]}<b>${attribut(l.pseudo)}</b>
    </span>`).join('')}
  </button>`;

/**
 * Tant que l'accueil reste affiché, on redemande qui est là toutes les vingt
 * secondes : c'est ce qui fait voir que le site vit. Dès qu'on l'a quitté, la
 * boucle s'arrête d'elle-même ; et revenir à l'accueil n'en lance jamais une
 * seconde, puisque seul le dernier tour a le droit de continuer.
 */
function suivreLaVie(): void {
  clearTimeout(minuteurVie);
  const tour = ++tourDeVie;
  void Promise.all([activite(), classementPublic()]).then(([a, lignes]) => {
    if (tour !== tourDeVie || !document.getElementById('vie')) return;
    derniereActivite = a;
    if (lignes) dernierPodium = podium(lignes);
    $('vie').innerHTML = htmlDeVie(signeDeVie(a));
    $('publique').textContent = texteDuBoutonPublic(a);
    $('podium').innerHTML = htmlDuPodium(dernierPodium);
    minuteurVie = setTimeout(suivreLaVie, RAFRAICHIR_VIE);
  });
}

/**
 * L'éventail de l'accueil : quatre cartes qui montent jusqu'au 2, la plus forte
 * du jeu — on reconnaît d'un coup d'œil un jeu de cartes, et celui-ci. Du
 * décor seulement : ni bouton, ni focus, et les mêmes cartes qu'à la table.
 */
const EVENTAIL = `<div class="eventail" aria-hidden="true">${
  ([['9', '♣', 9], [tr('V', 'J'), '♦', 11], [tr('D', 'Q'), '♥', 12], ['2', '♠', 15]] as const).map(([valeur, couleur, rang]) => {
    const rouge = couleur === '♥' || couleur === '♦' ? ' rouge' : '';
    return `<span class="carte${rouge}"><span class="coin">${valeur}<i>${couleur}</i></span>`
      + `${dessinDeCarte(rang, couleur)}</span>`;
  }).join('')}</div>`;

function voileAccueil(): void {
  const horsLigne = location.protocol === 'file:';
  direAuPortail();
  // Un nom tiré au sort attend dans le champ : on peut jouer sans rien taper.
  const nomConnu = localStorage.getItem('larbin.nom') || nomPropose();
  // Rien à afficher au premier passage : l'accueil d'un inconnu doit rester net.
  const b = bilan(parcours());
  const defi = bilanDuJour();
  // La série du défi : on la montre tant qu'elle est vivante, pour qu'on ait
  // envie de la prolonger aujourd'hui.
  const serieDuDefi = statsDuDefi(noterDansLHistorique(defi), defi.jour).serie;
  const moi = sessionOuverte();

  // Ce qui se consulte sans jouer tient sur une rangée d'icônes, en bas : les
  // trois façons de jouer gardent toute la place.
  const raccourci = (id: string, icone: string, texte: string, titre = texte) =>
    `<button class="raccourci" id="${id}" type="button" title="${attribut(titre)}">
      <span aria-hidden="true">${icone}</span>${texte}
    </button>`;

  // Sur PC, la vitrine et les raccourcis prennent la colonne de gauche, le jeu
  // celle de droite ; sur téléphone, tout s'empile dans cet ordre.
  montrerVoile(`
    <div class="vitrine">
    <div class="entete">
      ${EMBLEME}
      <h1>Le Larbin</h1>
      <button class="reglage" id="tapis-accueil" type="button" title="${tr('Tapis et musique', 'Table and music')}"
              aria-label="${tr('Tapis et musique', 'Table and music')}">🎨</button>
    </div>
    <div class="affiche">${tr(`
      <p class="accroche"><b>Le Président, en plus nerveux.</b>
        <span class="court">Une série ne fait qu’un tour de table. Sur téléphone ou PC.</span>
        <span class="long">Le jeu de cartes du Président${GROS_MOT_FR} en ligne et gratuit,
          sur téléphone ou PC.</span></p>`, `
      <p class="accroche"><b>President, but faster.</b>
        <span class="court">A trick goes around the table only once. On phone or PC.</span>
        <span class="long">The President card game — also known as Scum${GROS_MOT_EN} — online and free,
          on phone or PC.</span></p>`)}
      ${EVENTAIL}
    </div>
    <!-- Sur PC seulement : ce qui change du Président classique, lu en cinq secondes. -->
    <ul class="trois-regles">${tr(`
      <li><b>Un seul tour de table</b> par série : chacun ne parle qu’une fois.</li>
      <li><b>Le 2 coupe net</b> : plus fort que l’as, il clôt la série dès qu’il tombe.</li>
      <li><b>Finir sur un 2</b> rend Larbin d’office.</li>`, `
      <li><b>One trip around the table</b> per trick: everyone speaks only once.</li>
      <li><b>The 2 cuts</b>: higher than the ace, it ends the trick as soon as it lands.</li>
      <li><b>Finishing on a 2</b> makes you Lackey by default.</li>`)}
    </ul>
    </div>
    <div class="jeu">
    <div class="identite">
      <button class="avatar-choix" id="avatar-accueil" type="button" title="${tr('Changer d’avatar', 'Change avatar')}">${avatarChoisi()}</button>
      ${moi
    ? `<div class="champ connecte">${tr('Connecté', 'Signed in')}
        <b>✓ ${attribut(moi.pseudo)}</b>
        <input id="nom" type="hidden" value="${attribut(moi.pseudo)}">
      </div>`
    : `<input id="nom" type="text" maxlength="14" placeholder="${tr('Votre prénom', 'Your name')}" aria-label="${tr('Votre nom', 'Your name')}"
              value="${attribut(nomConnu)}">`}
      ${horsLigne ? '' : `<button class="compte-choix" id="compte" type="button"
              title="${moi ? tr('Mon compte', 'My account') : tr('Créer un compte ou se connecter', 'Create an account or sign in')}">🔑<span> ${tr('Compte', 'Account')}</span></button>`}
    </div>
    ${horsLigne ? `<p class="mention">${tr(`Ce fichier joue en solo, hors ligne.
       Pour une partie à plusieurs, ouvrez`, 'This file plays solo, offline. To play with others, open')}
       <a href="https://${ADRESSE_PUBLIQUE}${PREFIXE}" target="_blank" rel="noopener">${ADRESSE_PUBLIQUE}${PREFIXE}</a>
       ${tr('— ou lancez <b>Serveur.cmd</b> pour jouer sur votre wifi.', '— or run <b>Serveur.cmd</b> to play over your Wi-Fi.')}</p>` : `
      <section class="bloc">
        <h3>🌍 ${tr('En ligne', 'Online')} <span id="vie">${htmlDeVie(signeDeVie(derniereActivite))}</span></h3>
        <button class="action primaire" id="publique" type="button">${texteDuBoutonPublic(derniereActivite)}</button>
        <div id="podium">${htmlDuPodium(dernierPodium)}</div>
      </section>
      <section class="bloc">
        <h3>👥 ${tr('Entre amis', 'With friends')}</h3>
        <button class="action" id="creer" type="button">${tr('Créer un salon', 'Create a room')}</button>
        <div class="rejoindre">
          <input id="code" type="text" maxlength="4" placeholder="CODE" aria-label="${tr('Code du salon', 'Room code')}"
                 autocapitalize="characters">
          <button class="action" id="rejoindre" type="button">${tr('Rejoindre', 'Join')}</button>
        </div>
      </section>`}
    <section class="bloc">
      <h3>🤖 Solo</h3>
      <div class="deux">
        <button class="action${horsLigne ? ' primaire' : ''}" id="solo" type="button">${tr('Contre les bots', 'Against bots')}</button>
        <button class="action defi" id="defi" type="button">${defi.fini
          ? `${tr('Défi du jour', 'Daily challenge')} <small>✓ ${defi.points}/${DEFI_MAXIMUM}</small>`
          : serieDuDefi > 0
            ? `${tr('Défi du jour', 'Daily challenge')} <small title="${tr('Jours de suite', 'Days in a row')}">🔥 ${serieDuDefi}</small>`
            : `🗓️ ${tr('Défi du jour', 'Daily challenge')}`}</button>
      </div>
      ${didacticielFini() ? '' : `<button class="action lecon" id="lecon-accueil" type="button">
        <span>♥ ${tr('Apprendre en jouant', 'Learn by playing')}</span>
        <small>${tr('4 petites leçons · 2 minutes', '4 short lessons · 2 minutes')}</small>
      </button>`}
    </section>
    <button class="lien" id="faire-decouvrir" type="button">📣 ${tr('Faire découvrir le jeu à un proche', 'Share the game with a friend')}</button>
    </div>
    <div class="bas">
    <nav class="raccourcis">
      ${raccourci('succes', '🏆', tr('Succès', 'Awards'),
        `${tr('Vos succès', 'Your achievements')} — ${nombreDeSucces()} ${tr('sur', 'of')} ${SUCCES.length}`)}
      ${horsLigne ? '' : raccourci('classement', '🏅', tr('Classement', 'Ranking'))}
      ${b.parties > 0 ? raccourci('parcours', '📊', tr('Parcours', 'Record'),
        tr(`Votre parcours — ${pluriel(b.victoires, ['victoire', 'victoires'], ['win', 'wins'])} en ${pluriel(b.parties, ['partie', 'parties'], ['game', 'games'])}`,
          `Your record — ${pluriel(b.victoires, ['victoire', 'victoires'], ['win', 'wins'])} in ${pluriel(b.parties, ['partie', 'parties'], ['game', 'games'])}`)) : ''}
      ${raccourci('regles', '📖', tr('Règles', 'Rules'), tr('Comment on joue ?', 'How to play?'))}
      ${raccourci('histoire', '📜', tr('Histoire', 'History'), tr('D’où vient ce jeu ?', 'Where does this game come from?'))}
    </nav>
    <p class="pied">
      <span class="hors-portail"><a href="${LIEN_REGLES}" target="_blank" rel="noopener">${tr('Toutes les règles', 'Full rules')}</a>
      · </span><a href="${lienConfidentialite()}" target="_blank" rel="noopener">${tr('Confidentialité', 'Privacy')}</a>
      <span class="hors-portail">· <a href="mailto:mickagames1@outlook.fr">Contact</a>
      · <a href="${horsLigne ? 'https://' + ADRESSE_PUBLIQUE : ''}${tr('/en', '/')}" hreflang="${tr('en', 'fr')}" lang="${tr('en', 'fr')}">${tr('English', 'Français')}</a></span>
    </p>
    </div>
  `, 'accueil');

  const nom = () => {
    const valeur = ($('nom') as HTMLInputElement).value.trim();
    try {
      localStorage.setItem('larbin.nom', valeur);
    } catch { /* peu importe */ }
    return valeur || nomPropose();
  };

  $('tapis-accueil').addEventListener('click', () => voileTapis(voileAccueil));
  $('parcours')?.addEventListener('click', () => voileParcours(voileAccueil));
  $('succes').addEventListener('click', () => voileSucces(voileAccueil));
  $('compte')?.addEventListener('click', () => voileCompte(voileAccueil));
  $('classement')?.addEventListener('click', () => void voileClassement(voileAccueil));
  $('avatar-accueil').addEventListener('click', () => {
    nom();   // le nom tapé ne doit pas se perdre en chemin
    voileAvatar(voileAccueil);
  });
  $('regles').addEventListener('click', () => voileBienvenue(voileAccueil));
  // Le bouche-à-oreille, tant que le site est jeune, c'est ce qui fait venir du
  // monde : le lien part dans la conversation où il a sa place.
  $('faire-decouvrir').addEventListener('click', (e) => {
    void partager(e.currentTarget as HTMLElement,
      tr('Je joue au Larbin : le Président (Trou du cul) en plus nerveux, en ligne et gratuit. Une partie ?',
        'I’m playing Le Larbin: the President card game, but faster — online and free. Fancy a game?'),
      lienDuSite('via=partage'));
  });
  $('histoire').addEventListener('click', () => voileHistoire(voileAccueil));

  // La première fois, on explique avant de lancer : cinq lignes, puis on joue.
  const enPassantParLesRegles = (jouer: () => void) => {
    if (dejaExplique()) jouer();
    else voileBienvenue(jouer, tr('Jouer', 'Play'));
  };

  $('solo').addEventListener('click', () => enPassantParLesRegles(() => {
    compter('solo-lancee');
    cacherVoile();
    installer(new TableSolo());
  }));

  $('defi').addEventListener('click', () => {
    nom();   // c'est sous ce nom que le score entrera au classement du jour
    const bilan = bilanDuJour();
    if (bilan.fini) voileDefiFini(bilan, voileAccueil);
    else enPassantParLesRegles(() => voileDefi(bilan));
  });

  // Tant que les leçons n'ont pas été suivies, elles passent juste après le
  // bouton de jeu : c'est ce qui manque le plus à qui découvre le jeu. Une fois
  // finies, elles restent à portée derrière « Comment on joue ? ».
  $('lecon-accueil')?.addEventListener('click', () => {
    try {
      localStorage.setItem(CLE_ACCUEILLI, 'oui');
    } catch { /* on réexpliquera, ce n'est pas grave */ }
    cacherVoile();
    installer(new TableDidacticiel());
  });

  if (horsLigne) return;
  // On passe par la liste plutôt que d'asseoir d'office : voir les tables, c'est
  // voir que le site vit, et pouvoir choisir la sienne.
  $('publique').addEventListener('click', () => {
    // Le nom se lit avant de remplacer l'écran : le champ n'existera plus après.
    const choisi = nom();
    enPassantParLesRegles(() => voileTables(choisi));
  });
  $('creer').addEventListener('click', () => installer(new TableEnLigne(nom(), '')));

  // S'il y a du monde en ligne, autant le dire : c'est ce qui donne envie de
  // pousser la porte. Le serveur endormi ne fait attendre personne : la
  // réponse arrive quand elle arrive.
  $('podium').addEventListener('click', () => void voileClassement(voileAccueil));
  suivreLaVie();
  $('rejoindre').addEventListener('click', () => {
    const code = ($('code') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length === 4) installer(new TableEnLigne(nom(), code));
  });
}

/**
 * Les tables publiques du moment. Les montrer, c'est dire que le site vit —
 * et permettre à un arrivant de s'asseoir là où il y a du monde, voire de
 * reprendre la place d'un bot dans une partie déjà commencée.
 */
async function voileTables(nom: string): Promise<void> {
  clearTimeout(minuteurTables);

  const rendre = (liste: ResumeTable[], cherche: boolean) => {
    const joueurs = (n: number) => pluriel(n, ['joueur', 'joueurs'], ['player', 'players']);
    const bots = (n: number) => pluriel(n, ['bot', 'bots'], ['bot', 'bots']);
    const ligne = (t: ResumeTable) => `<li>
      <span>${t.commencee
    ? tr(`${joueurs(t.joueurs)}${t.bots ? ` et ${bots(t.bots)}` : ''} — manche ${t.manche}`,
      `${joueurs(t.joueurs)}${t.bots ? ` and ${bots(t.bots)}` : ''} — round ${t.manche}`)
    : tr(`${t.joueurs} sur ${t.taille} joueurs, ${t.prets} prêt${t.prets > 1 ? 's' : ''}`,
      `${t.joueurs} of ${t.taille} players, ${t.prets} ready`)}</span>
      ${t.libre
    ? `<button class="mini mot" data-table="${t.code}" type="button">${t.commencee ? tr('Entrer', 'Enter') : tr('Rejoindre', 'Join')}</button>`
    : `<span class="gain">${tr('complète', 'full')}</span>`}
    </li>`;

    const attente = liste.filter((t) => !t.commencee);
    const enCours = liste.filter((t) => t.commencee);
    const vide = cherche
      ? `<p class="mention">${tr('On regarde qui est là…', 'Checking who’s around…')}</p>`
      : `<p>${tr(`Aucune table ouverte pour l’instant. Asseyez-vous : les visiteurs
         suivants verront la vôtre, et pourront s’y joindre.`,
        'No open table right now. Take a seat: the next visitors will see yours and can join you.')}</p>`;

    montrerVoile(`
      <h2>${tr('Tables publiques', 'Public tables')}</h2>
      ${liste.length === 0 ? vide : ''}
      ${attente.length ? `<h3>${tr('En attente', 'Waiting')}</h3><ul class="classement">${attente.map(ligne).join('')}</ul>` : ''}
      ${enCours.length ? `<h3>${tr('Parties en cours', 'Games in progress')}</h3>
         <p class="mention">${tr('On y prend la place d’un bot, et l’on joue à la manche en cours.',
           'You take a bot’s seat and play in the current round.')}</p>
         <ul class="classement">${enCours.map(ligne).join('')}</ul>` : ''}
      <button class="action primaire" id="asseoir" type="button">${tr('M’asseoir à une table', 'Take a seat')}</button>
      <button class="action" id="retour" type="button">${tr('Retour', 'Back')}</button>
    `);

    const aller = (code: string) => {
      clearTimeout(minuteurTables);
      installer(new TableEnLigne(nom, code));
    };
    $('asseoir').addEventListener('click', () => aller(TABLE_PUBLIQUE));
    $('retour').addEventListener('click', () => {
      clearTimeout(minuteurTables);
      voileAccueil();
    });
    $('voile').querySelectorAll('[data-table]').forEach((b) => {
      b.addEventListener('click', () => aller((b as HTMLElement).dataset.table!));
    });
  };

  // On affiche tout de suite, quitte à n'avoir rien à montrer : le serveur peut
  // être endormi, et il ne doit pas laisser le joueur devant un écran figé.
  rendre([], true);
  const liste = await tablesPubliques();
  // Le joueur a pu partir ailleurs pendant que le serveur se réveillait.
  if (!document.getElementById('asseoir')) return;
  rendre(liste, false);
  minuteurTables = setTimeout(() => {
    if (document.getElementById('asseoir')) void voileTables(nom);
  }, 4000);
}

/**
 * Une table publique avant son lancement : qui est assis, et dans combien de
 * temps on commence. Rien à régler, rien à décider — quelques secondes, puis
 * les bots comblent les places vides.
 */
function voileTablePublique(
  en: TableEnLigne,
  salon: NonNullable<ReturnType<TableEnLigne['salon']>>,
): void {
  const assis = salon.sieges.length;
  const moi = salon.sieges.find((s) => s.id === en.moi);
  // Avant le départ, tous les sièges occupés le sont par des humains : les bots
  // n'arrivent qu'au dernier moment. Les places encore libres sont montrées
  // telles quelles, pour qu'on voie d'un coup d'œil ce qui manque.
  const libres = Math.max(0, salon.taille - assis);
  const places = [
    ...salon.sieges.map((s) => `<li>
      <span>${avatarDuSiege(s)}${s.id === en.moi ? `${s.nom} (${tr('vous', 'you')})` : s.nom}${marqueDeCompte(s)}</span>
      <span class="gain">${s.estBot ? 'bot'
    : !s.connecte ? tr('parti', 'left')
    : s.pret ? tr('prêt', 'ready') : tr('pas prêt', 'not ready')}</span>
    </li>`),
    ...Array.from({ length: libres }, () => `<li class="libre">
      <span>${tr('Place libre', 'Free seat')}</span><span class="gain">${tr('un bot, si personne', 'a bot, if nobody comes')}</span>
    </li>`),
  ].join('');

  const humains = salon.sieges.filter((s) => !s.estBot);
  const prets = humains.filter((s) => s.pret).length;
  const secondes = en.departDans();

  // Le compte à rebours ne part que lorsque tout le monde s'est dit prêt. Il
  // s'arrête si quelqu'un se dédit, ou si un nouveau venu s'assoit.
  const entete = secondes !== null
    ? (secondes > 0
      ? tr(`Tout le monde est prêt — départ dans <b>${secondes} s</b>.`, `Everyone is ready — starting in <b>${secondes} s</b>.`)
      : tr('C’est parti…', 'Here we go…'))
    : assis > 1
      ? tr(`<b>${prets} sur ${humains.length}</b> se sont dits prêts.`, `<b>${prets} of ${humains.length}</b> are ready.`)
      : tr('<b>Vous êtes seul</b> à cette table pour l’instant.', '<b>You are alone</b> at this table for now.');

  const conseil = secondes !== null
    ? tr('Les places encore libres iront à des bots.', 'Any free seats will go to bots.')
    : assis > 1
      ? tr(`Le départ se fait à l’accord de tous : il suffit qu’un joueur se dédise, ou
         qu’un nouveau venu s’assoie, pour que le compte à rebours s’arrête. Changer
         la taille de la table remet aussi chacun « pas prêt ».`,
      `The game starts when everyone agrees: if one player changes their mind, or a
         newcomer sits down, the countdown stops. Changing the table size also sets
         everyone back to “not ready”.`)
      : tr(`Attendez aussi longtemps que vous voulez ; les autres visiteurs voient votre
         table. Dites-vous prêt pour lancer le compte à rebours, ou commencez tout de
         suite avec des bots.`,
      `Wait as long as you like; other visitors can see your table. Say you’re ready
         to start the countdown, or start right away with bots.`);

  // À cinq il y a un Neutre, à six il y en a deux : la table n'a pas le même
  // goût selon sa taille, autant laisser choisir.
  const tailles = [4, 5, 6].map((n) => `<button
      class="mini mot ${n === salon.taille ? 'choisi' : ''}"
      data-taille="${n}" type="button" ${n < assis ? 'disabled' : ''}>${n}</button>`).join('');

  montrerVoile(`
    <h2>${tr('Table publique', 'Public table')}</h2>
    <p>${entete}</p>
    <ul class="classement">${places}</ul>
    <p class="taille">${tr('Joueurs à cette table :', 'Players at this table:')} ${tailles}</p>
    <p class="mention">${conseil}</p>
    <button class="action ${moi?.pret ? '' : 'primaire'}" id="pret" type="button">${moi?.pret
      ? tr('Je ne suis plus prêt', 'I’m not ready anymore') : tr('Je suis prêt', 'I’m ready')}</button>
    <button class="action" id="maintenant" type="button">${tr('Commencer avec des bots', 'Start with bots')}</button>
    <button class="action" id="quitter" type="button">${tr('Quitter', 'Leave')}</button>
    ${interrupteurSons()}
  `);

  brancherInterrupteurSons();
  $('pret').addEventListener('click', () => en.pret(!moi?.pret));
  $('voile').querySelectorAll('[data-taille]').forEach((b) => {
    b.addEventListener('click', () => en.taille(Number((b as HTMLElement).dataset.taille)));
  });

  // Sans ce bouton, il faudrait l'accord de tous même quand on sait très bien
  // que le voisin s'est absenté sans rien dire.
  $('maintenant').addEventListener('click', () => en.demarrer());

  $('quitter').addEventListener('click', () => {
    revenirAccueil();
  });

  // Le compte à rebours se redessine chaque seconde ; boucle() annule ce rappel
  // dès que quelque chose d'autre change.
  if (secondes !== null) minuteur = setTimeout(boucle, 1000);
}

function voileSalon(en: TableEnLigne): void {
  const salon = en.salon();
  if (!salon) {
    // Refus du serveur avant même d'être assis : le dire, et proposer de revenir,
    // plutôt que de laisser le joueur devant « Connexion… » pour toujours.
    const refus = en.erreur();
    if (refus) {
      montrerVoile(`<h2>${tr('Impossible d\'entrer', 'Could not join')}</h2><p>${messageDuServeur(refus)}</p>
        <button class="action primaire" id="retour" type="button">${tr('Revenir à l\'accueil', 'Back to home')}</button>`);
      $('retour').addEventListener('click', () => {
        revenirAccueil();
      });
      return;
    }
    // Le serveur s'endort après un moment sans visite. Mieux vaut le dire que
    // de laisser le joueur devant un écran qui ne bouge pas.
    const secondes = en.attente();
    const explication = secondes < 4
      ? tr('On frappe à la porte du salon.', 'Knocking on the room’s door.')
      : tr(`Le serveur se réveille — il fait la sieste quand personne ne joue.
         Comptez une trentaine de secondes. (${secondes} s)`,
      `The server is waking up — it naps when nobody plays. Allow about thirty seconds. (${secondes} s)`);
    montrerVoile(`<h2>${tr('Connexion…', 'Connecting…')}</h2><p>${explication}</p>`);
    return;
  }

  if (salon.publique) return voileTablePublique(en, salon);

  const jeSuisHote = salon.sieges.find((s) => s.id === en.moi)?.hote ?? false;
  // Chez un portail, la page n'a pas d'adresse à nous : le lien d'invitation
  // est celui qu'il fabrique. S'il n'en donne pas, seul le code voyage.
  const lien = SUR_PORTAIL ? lienDInvitation(salon.code) ?? ''
    : `${location.origin}${enAnglais ? '/en?' : '/?'}salon=${salon.code}`;
  const sansLien = lien === '';
  const manque = salon.minJoueurs - salon.sieges.length;

  const sieges = salon.sieges.map((s) => `<li>
      <span>${avatarDuSiege(s)}${s.nom}${marqueDeCompte(s)}${s.hote ? ` <span class="gain">${tr('hôte', 'host')}</span>` : ''}</span>
      <span class="gain">${s.estBot ? 'bot' : s.connecte ? tr('en ligne', 'online') : tr('déconnecté', 'offline')}</span>
      ${jeSuisHote && s.id !== en.moi ? `<button class="mini" data-retirer="${s.id}" type="button">✕</button>` : ''}
    </li>`).join('');

  const erreur = en.erreur();
  montrerVoile(`
    <h2>${tr('Salon', 'Room')} ${salon.code}</h2>
    <p>${sansLien
    ? tr('Donnez ce code à vos amis — ils le tapent sous « Entre amis » :', 'Give this code to your friends — they type it under “With friends”:')
    : tr('Partagez ce lien, ou dictez le code :', 'Share this link, or read out the code:')} <b>${salon.code}</b>.</p>
    <div class="rejoindre"${sansLien ? ' hidden' : ''}>
      <input id="lien" type="text" readonly value="${lien}">
      <button class="action" id="copier" type="button">${navigator.share && !SUR_PORTAIL ? tr('Envoyer', 'Send') : tr('Copier', 'Copy')}</button>
    </div>
    <ul class="classement">${sieges}</ul>
    ${erreur ? `<p class="mention alerte">${messageDuServeur(erreur)}</p>` : ''}
    ${manque > 0 ? `<p class="mention">${tr(`Encore ${manque} joueur${manque > 1 ? 's' : ''} — ou autant de bots.`,
      `${manque} more player${manque > 1 ? 's' : ''} needed — or as many bots.`)}</p>` : ''}
    ${jeSuisHote ? `
      <button class="action" id="bot" type="button">${tr('Ajouter un bot', 'Add a bot')}</button>
      <button class="action primaire" id="lancer" type="button" ${manque > 0 ? 'disabled' : ''}>
        ${tr('Commencer la partie', 'Start the game')}
      </button>` : `<p class="mention">${tr('L’hôte lancera la partie.', 'The host will start the game.')}</p>`}
    <button class="action" id="quitter" type="button">${tr('Quitter', 'Leave')}</button>
    ${interrupteurSons()}
  `);

  en.oublierErreur();
  brancherInterrupteurSons();

  $('copier').addEventListener('click', async () => {
    // Dans le cadre d'un portail, la feuille de partage du téléphone est refusée : on copie.
    if (navigator.share && !SUR_PORTAIL) {
      await partager($('copier'), tr(`Une partie de Larbin ? Le code du salon est ${salon.code}.`,
        `Fancy a game of Le Larbin? The room code is ${salon.code}.`), lien);
      return;
    }
    try {
      await navigator.clipboard.writeText(lien);
      $('copier').textContent = tr('Copié', 'Copied');
    } catch {
      ($('lien') as HTMLInputElement).select();
    }
  });
  $('quitter').addEventListener('click', () => {
    revenirAccueil();
  });
  $('bot')?.addEventListener('click', () => en.ajouterBot());
  $('lancer')?.addEventListener('click', () => en.demarrer());
  $('voile').querySelectorAll('[data-retirer]').forEach((b) => {
    b.addEventListener('click', () => en.retirer((b as HTMLElement).dataset.retirer!));
  });
}

/* ------------------------------------------------------------- démarrage */

function installer(nouvelle: Table): void {
  table = nouvelle;
  // Le défi n'a qu'un essai : pas de « nouvelle partie » dans la barre.
  $('recommencer').hidden = nouvelle instanceof TableDefi;
  selection = [];
  mancheAnnoncee = 0;
  poseAffichee = '';
  annonce = '';
  // Une nouvelle table n'a pas de passé : sa première image ne sonne pas.
  entendu = RIEN;
  paletteOuverte = false;
  derniereBulleEntendue = 0;
  table.abonner(surChangement);
  surChangement();
}

$('ma-main').addEventListener('click', (e) => {
  const cible = (e.target as HTMLElement).closest('.carte') as HTMLElement | null;
  if (cible) choisirCarte(cible.dataset.id!);
});

// La palette vit dans #ma-ligne, redessinée à chaque changement : on écoute le
// conteneur plutôt que ses boutons.
$('ma-ligne').addEventListener('click', (e) => {
  if (!(table instanceof TableEnLigne)) return;
  const cible = e.target as HTMLElement;
  if (cible.closest('#reagir')) {
    paletteOuverte = !paletteOuverte;
    rendre();
    return;
  }
  const choix = (cible.closest('[data-reaction]') as HTMLElement | null)?.dataset.reaction;
  const reaction = REACTIONS.find((r) => r === choix);
  if (!reaction) return;
  table.reagir(reaction);
  paletteOuverte = false;
  rendre();
});

$('poser').addEventListener('click', () => {
  const vue = table?.vue();
  const coup = vue && coupChoisi(vue);
  if (vue && coup) agir({ type: 'poser', player: vue.me.id, cards: coup.map((c) => c.id) });
});

$('passer').addEventListener('click', () => {
  const vue = table?.vue();
  if (vue?.canPass) agir({ type: 'passer', player: vue.me.id });
});

/**
 * Le choix du tapis : pur habillage, sans effet sur le jeu ni sur ce qu'on voit.
 * `retour` dit ce qu'il faut réafficher en refermant — on peut y venir depuis
 * l'accueil comme depuis une partie en cours.
 */
function voileTapis(retour: () => void): void {
  suspendre(true);
  const actuel = themeCourant();
  const choix = THEMES.map((t) => `
    <button data-theme="${t.cle}" class="${t.cle === actuel.cle ? 'actif' : ''}" type="button">
      <span class="apercu" style="background:${t.couleurs['--feutre']}">
        <i style="background:${t.couleurs['--dos']}"></i>
      </span>
      ${tr(t.nom, ({ feutre: 'Green felt', bordeaux: 'Burgundy', ardoise: 'Slate' } as Record<string, string>)[t.cle] ?? t.nom)}
    </button>`).join('');

  const morceau = musiqueChoisie();
  montrerVoile(`
    <h2>${tr('Le tapis', 'The table')}</h2>
    <p>${tr('Choisissez votre table. Ça ne change que l\'ambiance.', 'Pick your table. It only changes the mood.')}</p>
    <div class="tapis-liste">${choix}</div>
    <button class="action" id="musique" type="button">🎵 ${tr('Musique', 'Music')} : ${morceau
      ? nomDuMorceau(morceau) : tr('aucune', 'none')} — ${tr('changer', 'change')}</button>
    <button class="action primaire" id="fermer-tapis" type="button">${tr('Revenir au jeu', 'Back to the game')}</button>
  `);

  $('musique').addEventListener('click', () => voileMusique(() => voileTapis(retour)));

  $('voile').querySelectorAll('[data-theme]').forEach((b) => {
    b.addEventListener('click', () => {
      const theme = THEMES.find((t) => t.cle === (b as HTMLElement).dataset.theme);
      if (!theme) return;
      appliquerTheme(theme);
      voileTapis(retour);
    });
  });
  $('fermer-tapis').addEventListener('click', () => {
    suspendre(false);
    retour();
  });
}

/**
 * Quitte la table pour l'accueil. En solo, la partie en cours est gardée et
 * reprendra au prochain « Jouer contre les bots » ; une partie finie, non.
 */
function revenirAccueil(): void {
  // Sur le site, on recharge : l'adresse perd son ?salon. Chez un portail, la
  // page doit garder la sienne — c'est par elle que son module se reconnaît.
  if (table instanceof TableEnLigne && !SUR_PORTAIL) {
    table.quitter();
    table = null;
    location.href = location.pathname;
    return;
  }
  table?.quitter?.();
  table = null;
  clearTimeout(minuteur);
  paletteOuverte = false;
  suspendre(false);
  $('lecon').hidden = true;
  $('table').hidden = true;
  voileAccueil();
}

/**
 * En ligne, partir engage les autres : la table continue sans vous. On le dit
 * avant, plutôt que de faire disparaître quelqu'un sur un geste malheureux.
 */
function voileQuitterLaTable(): void {
  suspendre(true);
  montrerVoile(`
    <h2>${tr('Quitter la partie ?', 'Leave the game?')}</h2>
    <p>${tr('La table continue sans vous : elle jouera à votre place.', 'The table carries on without you: it will play in your place.')}</p>
    <button class="action primaire" id="rester" type="button">${tr('Rester', 'Stay')}</button>
    <button class="action" id="partir" type="button">${tr('Revenir à l’accueil', 'Back to home')}</button>
  `);
  $('rester').addEventListener('click', () => {
    suspendre(false);
    cacherVoile();
    boucle();
  });
  $('partir').addEventListener('click', revenirAccueil);
}

$('accueil').addEventListener('click', () => {
  const vue = table?.vue();
  if (table instanceof TableEnLigne && vue && vue.phase !== 'fin-de-partie') voileQuitterLaTable();
  else revenirAccueil();
});

/* ------------------------------------------------------------- succès */

const nombreDeSucces = () => Object.keys(succesObtenus()).length;

/** Les succès attendent leur tour : deux débloqués d'un coup s'affichent l'un après l'autre. */
const succesAAnnoncer: Succes[] = [];
let annonceDeSucces: ReturnType<typeof setTimeout> | undefined;

function annoncerSucces(nouveaux: Succes[]): void {
  if (nouveaux.length > 0) synchroniserBientot();
  succesAAnnoncer.push(...nouveaux);
  if (!annonceDeSucces) succesSuivant();
}

function succesSuivant(): void {
  const toast = $('toast-succes');
  const s = succesAAnnoncer.shift();
  toast.hidden = true;
  if (!s) {
    annonceDeSucces = undefined;
    return;
  }
  const offert = avatarDebloquePar(s.id);
  toast.innerHTML = `<span class="icone">${s.icone}</span><span><small>${tr('Succès débloqué', 'Achievement unlocked')}</small>${nomDuSucces(s)}`
    + `${offert ? ` <span class="offert">· ${tr(`avatar ${offert} offert`, `${offert} avatar unlocked`)}</span>` : ''}</span>`;
  // Cacher puis montrer relance l'animation d'entrée, même d'un succès à l'autre.
  void toast.offsetWidth;
  toast.hidden = false;
  jouerSons(['succes']);
  annonceDeSucces = setTimeout(succesSuivant, 3800);
}

/**
 * Tous les succès, obtenus ou non. Ceux qui restent à décrocher sont montrés
 * aussi, avec leur consigne : un défi qu'on ne connaît pas ne donne envie à
 * personne.
 */
function voileSucces(retour: () => void): void {
  suspendre(true);
  const obtenus = succesObtenus();
  const liste = SUCCES.map((s) => {
    const date = obtenus[s.id];
    return `<li class="${date ? 'obtenu' : 'verrouille'}">
      <span class="icone">${s.icone}</span>
      <span class="texte"><b>${nomDuSucces(s)}</b><small>${consigneDuSucces(s)}${date ? ` · ${jourCourt(date)}` : ''}${
        avatarDebloquePar(s.id) ? ` · avatar ${avatarDebloquePar(s.id)}` : ''}</small></span>
    </li>`;
  }).join('');

  montrerVoile(`
    <h2>${tr('Vos succès', 'Your achievements')}</h2>
    <p>${tr(`<b>${nombreDeSucces()}</b> sur ${SUCCES.length}. Ils restent dans ce navigateur.`,
      `<b>${nombreDeSucces()}</b> of ${SUCCES.length}. They are kept in this browser.`)}</p>
    <ul class="succes">${liste}</ul>
    <button class="action primaire" id="fermer-succes" type="button">${tr('Revenir', 'Back')}</button>
  `);
  $('fermer-succes').addEventListener('click', () => {
    suspendre(false);
    retour();
  });
}

/**
 * Le choix de l'avatar. Ceux qui se gagnent sont montrés avec le succès qui les
 * débloque : c'est le plus sûr moyen de donner envie de le chercher.
 */
function voileAvatar(retour: () => void): void {
  suspendre(true);
  const actuel = avatarChoisi();
  const obtenus = succesObtenus();
  const bouton = (avatar: string, permis: boolean, titre: string) => `<button data-avatar="${avatar}"
      class="${avatar === actuel ? 'actif' : ''}" type="button" title="${attribut(titre)}"
      ${permis ? '' : 'disabled'}>${avatar}</button>`;

  const libres = AVATARS_LIBRES.map((a) => bouton(a, true, a)).join('');
  const aGagner = AVATARS_A_GAGNER.map(({ avatar, succes }) => {
    const s = SUCCES.find((x) => x.id === succes)!;
    const obtenu = Boolean(obtenus[succes]);
    return `<li class="${obtenu ? 'obtenu' : 'verrouille'}">
      ${bouton(avatar, obtenu, nomDuSucces(s))}
      <span><b>${nomDuSucces(s)}</b><small>${obtenu ? tr('Débloqué', 'Unlocked') : consigneDuSucces(s)}</small></span>
    </li>`;
  }).join('');

  montrerVoile(`
    <h2>${tr('Votre avatar', 'Your avatar')}</h2>
    <p>${tr('Il s’affiche à côté de votre nom — et les autres le voient, en ligne.',
      'It appears next to your name — and others see it when you play online.')}</p>
    <div class="avatars">${libres}</div>
    <h3>${tr('À gagner avec les succès', 'Earned with achievements')}</h3>
    <ul class="avatars-a-gagner">${aGagner}</ul>
    <button class="action primaire" id="fermer-avatar" type="button">${tr('Revenir', 'Back')}</button>
  `);

  $('voile').querySelectorAll('[data-avatar]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!choisirAvatar((b as HTMLElement).dataset.avatar!)) return;
      synchroniserBientot();
      voileAvatar(retour);
    });
  });
  $('fermer-avatar').addEventListener('click', () => {
    suspendre(false);
    retour();
  });
}

/* ------------------------------------------------------------- comptes */

const lienConfidentialite = () => {
  const page = enAnglais ? '/en/privacy' : '/confidentialite';
  return location.protocol === 'file:' || SUR_PORTAIL ? `https://${ADRESSE_PUBLIQUE}${page}` : page;
};

/** Le panneau peut avoir été remplacé pendant qu'on attendait le serveur. */
const encoreLa = (id: string) => document.getElementById(id) as HTMLButtonElement | null;

/**
 * Le compte : facultatif. Sans lui on joue en invité ; avec, les succès, le
 * parcours et l'avatar suivent sur tous ses appareils, le pseudo est réservé,
 * et l'on entre au classement.
 */
function voileCompte(retour: () => void): void {
  suspendre(true);
  const fermer = () => {
    suspendre(false);
    retour();
  };
  const moi = sessionOuverte();
  if (moi) {
    void voileMonCompte(moi.pseudo, retour, fermer);
    return;
  }

  montrerVoile(`
    <h2>${tr('Un compte ?', 'An account?')}</h2>
    <p>${tr(`C’est facultatif : sans compte, vous jouez en invité, comme avant. Avec, vos succès,
       votre parcours et votre avatar vous suivent sur tous vos appareils, votre pseudo vous
       est réservé, et vous entrez au classement.`,
    `It’s optional: without an account you play as a guest, as before. With one, your achievements,
       record and avatar follow you on all your devices, your username is reserved for you, and
       you enter the leaderboard.`)}</p>
    <h3>${tr('Créer un compte', 'Create an account')}</h3>
    <label class="champ">${tr('Votre pseudo', 'Your username')}
      <input id="pseudo-creer" type="text" maxlength="14" autocomplete="nickname"
        value="${attribut(localStorage.getItem('larbin.nom') ?? '')}">
    </label>
    <button class="action primaire" id="creer-compte" type="button">${tr('Créer mon compte', 'Create my account')}</button>
    <h3>${tr('J’ai déjà un compte', 'I already have an account')}</h3>
    <label class="champ">${tr('Pseudo', 'Username')}
      <input id="pseudo-connexion" type="text" maxlength="14" autocomplete="username">
    </label>
    <label class="champ">${tr('Code secret', 'Secret code')}
      <input id="code-connexion" type="text" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX"
        autocapitalize="characters" autocomplete="off" spellcheck="false">
    </label>
    <button class="action" id="se-connecter" type="button">${tr('Se connecter', 'Sign in')}</button>
    <p class="mention alerte" id="erreur-compte" hidden></p>
    <p class="mention">${tr('Ni adresse e-mail, ni mot de passe.', 'No e-mail address, no password.')}
       <a href="${lienConfidentialite()}" target="_blank" rel="noopener">${tr('Ce que nous gardons', 'What we keep')}</a>.</p>
    <button class="action" id="fermer-compte" type="button">${tr('Revenir', 'Back')}</button>
  `);

  const signaler = (texte: string) => {
    const p = document.getElementById('erreur-compte');
    if (!p) return;
    p.textContent = messageDuServeur(texte);
    p.hidden = false;
  };

  $('creer-compte').addEventListener('click', async () => {
    $('creer-compte').setAttribute('disabled', '');
    const r = await creerCompte(($('pseudo-creer') as HTMLInputElement).value);
    const bouton = encoreLa('creer-compte');
    if (!bouton) return;
    bouton.disabled = false;
    if ('erreur' in r) {
      signaler(r.erreur);
      return;
    }
    voileCodeSecret(r.code, tr('Votre compte est créé', 'Your account is ready'), '', fermer);
  });

  $('se-connecter').addEventListener('click', async () => {
    $('se-connecter').setAttribute('disabled', '');
    const r = await seConnecter(
      ($('pseudo-connexion') as HTMLInputElement).value,
      ($('code-connexion') as HTMLInputElement).value,
    );
    const bouton = encoreLa('se-connecter');
    if (!bouton) return;
    if (r) {
      bouton.disabled = false;
      signaler(r.erreur);
      return;
    }
    fermer();
  });

  $('fermer-compte').addEventListener('click', fermer);
}

/** Le code secret, montré une seule fois : on insiste pour qu'il soit noté. */
function voileCodeSecret(code: string, titre: string, note: string, suite: () => void): void {
  montrerVoile(`
    <h2>${titre}</h2>
    <p>${tr(`Voici votre <b>code secret</b>. Notez-le, ou gardez-en une capture d’écran : c’est la
       seule façon de retrouver votre compte sur un autre appareil. Personne ne pourra vous le
       renvoyer.`,
    `Here is your <b>secret code</b>. Write it down, or keep a screenshot: it is the only way to
       get your account back on another device. Nobody can send it to you again.`)}</p>
    <p class="code-secret">${code}</p>
    ${note ? `<p class="mention">${note}</p>` : ''}
    <button class="action" id="copier-code" type="button">${tr('Copier le code', 'Copy the code')}</button>
    <button class="action primaire" id="code-note" type="button">${tr('J’ai noté mon code', 'I’ve saved my code')}</button>
  `);
  $('copier-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      $('copier-code').textContent = tr('Copié', 'Copied');
    } catch {
      $('copier-code').textContent = tr('Recopiez-le à la main', 'Copy it by hand');
    }
  });
  $('code-note').addEventListener('click', suite);
}

async function voileMonCompte(pseudo: string, retour: () => void, fermer: () => void): Promise<void> {
  montrerVoile(`<h2>${attribut(pseudo)}</h2><p class="mention">${tr('On regarde votre compte…', 'Loading your account…')}</p>`);
  const infos = await monCompte();
  if (infos === null) {
    // La session a expiré, ou le compte a été supprimé ailleurs.
    voileCompte(retour);
    return;
  }
  if (infos === 'indisponible') {
    montrerVoile(`
      <h2>${attribut(pseudo)}</h2>
      <p>${tr(`Le serveur ne répond pas pour l’instant. Vos succès et votre parcours restent dans ce
         navigateur ; ils rejoindront votre compte à la prochaine occasion.`,
      `The server isn’t responding right now. Your achievements and record stay in this browser;
         they will join your account next time.`)}</p>
      <button class="action primaire" id="fermer-compte" type="button">${tr('Revenir', 'Back')}</button>
    `);
    $('fermer-compte').addEventListener('click', fermer);
    return;
  }

  const b = bilan(parcours());
  montrerVoile(`
    <h2><span class="avatar">${avatarChoisi()}</span>${attribut(infos.compte.pseudo)}</h2>
    <p>${tr('Vos succès, votre parcours et votre avatar suivent ce pseudo sur tous vos appareils.',
      'Your achievements, record and avatar follow this username on all your devices.')}</p>
    <p class="mention">${tr('Compte ouvert le', 'Account opened on')} ${jourCourt(infos.compte.creeLe)}</p>
    <div class="compteurs">
      <div><b>${nombreDeSucces()}</b><span>${tr('succès', 'achievements')}</span></div>
      <div><b>${infos.verifies}</b><span>${tr('vérifiés en ligne', 'verified online')}</span></div>
      <div><b>${b.parties}</b><span>${tr(`partie${b.parties > 1 ? 's' : ''}`, `game${b.parties === 1 ? '' : 's'}`)}</span></div>
    </div>
    <button class="action" id="nouveau-code" type="button">${tr('Obtenir un nouveau code secret', 'Get a new secret code')}</button>
    <button class="action" id="deconnexion" type="button">${tr('Se déconnecter de cet appareil', 'Sign out of this device')}</button>
    <button class="action alerte" id="supprimer-compte" type="button">${tr('Supprimer mon compte', 'Delete my account')}</button>
    <p class="mention"><a href="${lienConfidentialite()}" target="_blank" rel="noopener">${tr('Ce que nous gardons', 'What we keep')}</a></p>
    <button class="action primaire" id="fermer-compte" type="button">${tr('Revenir', 'Back')}</button>
  `);

  $('nouveau-code').addEventListener('click', async () => {
    $('nouveau-code').setAttribute('disabled', '');
    const code = await nouveauCodeSecret();
    if (!encoreLa('nouveau-code')) return;
    if (!code) {
      $('nouveau-code').textContent = tr('Le serveur ne répond pas — réessayez', 'The server isn’t responding — try again');
      $('nouveau-code').removeAttribute('disabled');
      return;
    }
    voileCodeSecret(code, tr('Nouveau code secret', 'New secret code'),
      tr('L’ancien code ne marche plus, et vos autres appareils devront se reconnecter.',
        'The old code no longer works, and your other devices will need to sign in again.'), fermer);
  });
  $('deconnexion').addEventListener('click', async () => {
    await seDeconnecter();
    fermer();
  });
  $('supprimer-compte').addEventListener('click', () => voileSupprimerCompte(infos.compte.pseudo, retour, fermer));
  $('fermer-compte').addEventListener('click', fermer);
}

function voileSupprimerCompte(pseudo: string, retour: () => void, fermer: () => void): void {
  montrerVoile(`
    <h2>${tr(`Supprimer « ${attribut(pseudo)} » ?`, `Delete “${attribut(pseudo)}”?`)}</h2>
    <p>${tr(`Le compte, ses succès, son parcours et ses résultats seront effacés du serveur, et le pseudo
       redeviendra libre. Ce qui est déjà dans ce navigateur y reste.`,
    `The account, its achievements, record and results will be erased from the server, and the
       username will be free again. What is already in this browser stays there.`)}</p>
    <p class="mention alerte" id="erreur-compte" hidden></p>
    <button class="action primaire" id="garder-compte" type="button">${tr('Garder mon compte', 'Keep my account')}</button>
    <button class="action alerte" id="confirmer-suppression" type="button">${tr('Supprimer définitivement', 'Delete for good')}</button>
  `);
  $('garder-compte').addEventListener('click', () => voileCompte(retour));
  $('confirmer-suppression').addEventListener('click', async () => {
    $('confirmer-suppression').setAttribute('disabled', '');
    const ok = await supprimerMonCompte();
    if (ok) {
      fermer();
      return;
    }
    const p = document.getElementById('erreur-compte');
    if (p) {
      p.textContent = tr('Le serveur ne répond pas. Réessayez dans un instant.', 'The server isn’t responding. Try again in a moment.');
      p.hidden = false;
    }
    encoreLa('confirmer-suppression')?.removeAttribute('disabled');
  });
}

/** Le classement public : les victoires en ligne, vérifiées par le serveur. */
async function voileClassement(retour: () => void): Promise<void> {
  suspendre(true);
  const fermer = () => {
    suspendre(false);
    retour();
  };
  montrerVoile(`
    <h2>${tr('Classement', 'Leaderboard')}</h2>
    <p class="mention">${tr('On compte les victoires…', 'Counting the wins…')}</p>
    <button class="action primaire" id="fermer-classement" type="button">${tr('Revenir', 'Back')}</button>
  `);
  $('fermer-classement').addEventListener('click', fermer);

  const lignes = await classementPublic();
  if (!encoreLa('fermer-classement')) return;
  const moi = sessionOuverte()?.pseudo;
  const corps = lignes === null
    ? `<p>${tr('Le classement ne répond pas pour l’instant. Réessayez dans un moment.',
      'The leaderboard isn’t responding right now. Try again in a moment.')}</p>`
    : lignes.length === 0
      ? `<p>${tr('Personne encore. Créez un compte et gagnez une partie en ligne : la première place est à prendre.',
        'Nobody yet. Create an account and win an online game: first place is up for grabs.')}</p>`
      : `<ol class="classement-general">${lignes.map((l, i) => `<li class="${l.pseudo === moi ? 'moi' : ''}">
          <span class="rang">${i + 1}</span>
          <span class="avatar">${attribut(l.avatar ?? '🙂')}</span>
          <span class="qui">${attribut(l.pseudo)}</span>
          <span class="gain">${pluriel(l.victoires, ['victoire', 'victoires'], ['win', 'wins'])} · ${
            pluriel(l.parties, ['partie', 'parties'], ['game', 'games'])}</span>
        </li>`).join('')}</ol>`;

  montrerVoile(`
    <h2>${tr('Classement', 'Leaderboard')}</h2>
    <p>${tr(`Les victoires en ligne des joueurs avec un compte — comptées par le serveur, qui a vu
       chaque partie.`, 'Online wins of players with an account — counted by the server, which saw every game.')}</p>
    ${corps}
    <button class="action primaire" id="fermer-classement" type="button">${tr('Revenir', 'Back')}</button>
  `);
  $('fermer-classement').addEventListener('click', fermer);
}

$('sons').addEventListener('click', () => {
  reglerSons(!sonsActifs());
  afficherClochette();
});

$('musique-choix').addEventListener('click', () => voileMusique(() => {
  cacherVoile();
  boucle();
}));

$('tapis-choix').addEventListener('click', () => voileTapis(() => {
  cacherVoile();
  boucle();
}));

$('voir-restantes').addEventListener('click', () => {
  restantesVisibles = !restantesVisibles;
  $('voir-restantes').classList.toggle('actif', restantesVisibles);
  rendre();
});

$('recommencer').addEventListener('click', () => {
  if (table instanceof TableSolo) {
    if (!table.entamee || confirm(tr('Abandonner la partie en cours et tout remettre à zéro ?',
      'Abandon the current game and start over?'))) {
      cacherVoile();
      mancheAnnoncee = 0;
      poseAffichee = '';
      table.recommencer();
    }
    return;
  }
  if (confirm(tr('Quitter la table ?', 'Leave the table?'))) location.href = location.pathname;
});

window.addEventListener('resize', () => {
  const vue = table?.vue();
  if (vue) ajusterChevauchement(vue.me.hand.length);
});

// Le texte en clair de la page (pour les moteurs et les aperçus de lien) cède
// la place au vrai accueil.
document.getElementById('presentation')?.remove();

// Les pictogrammes de la barre : la page porte des caractères de secours, pour
// l'instant d'avant le script ; la cloche, elle, se redessine avec son état.
$('musique-choix').innerHTML = icone('musique');
$('tapis-choix').innerHTML = icone('tapis');
$('voir-restantes').innerHTML = icone('oeil');
$('recommencer').innerHTML = icone('recommencer');
$('accueil').innerHTML = icone('maison');

// Les boutons fixes de la table sont écrits en français dans la page : en
// anglais, on les renomme une fois pour toutes.
if (enAnglais) {
  $('tapis-choix').title = 'Change the table';
  $('voir-restantes').title = 'What the others may still hold';
  $('recommencer').title = 'New game';
  $('accueil').title = 'Back to home';
  $('passer').textContent = 'Pass';
  $('poser').textContent = 'Play';
}
// Chez un portail, la page ne sait sa langue qu'ici : on la dit aux lecteurs d'écran.
if (SUR_PORTAIL) document.documentElement.lang = enAnglais ? 'en' : 'fr';
appliquerTheme(themeCourant());
afficherClochette();
ouvrirAuPremierGeste();
musiqueAuPremierGeste();
// Un compte a pu avancer sur un autre appareil : on reprend ses succès et son parcours.
if (sessionOuverte()) void monCompte();

// On cherche le serveur de parties dès le premier instant : s'il dort ailleurs,
// il se réveille pendant que le joueur entre son nom.
void hoteDuJeu();
const demandes = new URLSearchParams(location.search);
const comptage = reglerLeComptage(demandes);
compterLaVisite(jourDeParis(), demandes);
ecouterInstallation(() => compter('installation'));

// Une copie du jeu pour jouer sans réseau (voir sw.js). Après le chargement :
// elle ne doit rien retarder, et le fichier seul n'en a pas l'usage.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !SUR_PORTAIL) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sans elle, le jeu marche en ligne */ });
  });
}

// Chez un portail, les invitations arrivent par son module (voir plus bas), pas par l'adresse.
const salonDemande = SUR_PORTAIL ? null : demandes.get('salon');
if (salonDemande && location.protocol !== 'file:') {
  const nom = localStorage.getItem('larbin.nom') ?? '';
  if (nom) installer(new TableEnLigne(nom, salonDemande));
  else voileAccueilPourRejoindre(salonDemande);
} else if (comptage) {
  montrerVoile(`
    <h2>${comptage === 'retire' ? tr('Appareil hors des compteurs', 'Device excluded from stats')
      : tr('Appareil de nouveau compté', 'Device counted again')}</h2>
    <p>${comptage === 'retire'
      ? tr('Vos visites et vos parties sur cet appareil ne comptent plus dans les statistiques du site. Pour annuler, ouvrez l’adresse /?moi=non.',
        'Your visits and games on this device no longer count in the site’s statistics. To undo, open /?moi=non.')
      : tr('Vos visites et vos parties sur cet appareil comptent de nouveau dans les statistiques du site.',
        'Your visits and games on this device count again in the site’s statistics.')}</p>
    <button class="action primaire" id="compris-moi" type="button">${tr('Compris', 'Got it')}</button>
  `);
  $('compris-moi').addEventListener('click', voileAccueil);
} else {
  voileAccueil();
  // Un lien partagé du défi mène droit au défi : celui qui reçoit « Tu fais
  // mieux ? » n'a pas à chercher le bouton.
  if (demandes.has('defi')) document.getElementById('defi')?.click();
}

// Les marques de nos liens ont servi : l'adresse redevient propre, et un
// rechargement ne rejoue pas l'arrivée.
if (['defi', 'via', 'moi'].some((cle) => demandes.has(cle))) {
  history.replaceState(null, '', salonDemande ? `${location.pathname}?salon=${encodeURIComponent(salonDemande)}` : location.pathname);
}

// Chez un portail, les invitations passent par lui : un ami nous appelle dans
// son salon, ou le joueur a demandé une partie entre amis sur-le-champ.
if (SUR_PORTAIL) {
  /** S'assoit dans le salon `code` — ou en ouvre un, si le code est vide. */
  const allerAuSalon = (code: string) => {
    if (table instanceof TableEnLigne && code !== '' && table.salon()?.code === code) return;
    table?.quitter?.();
    let nom = '';
    try {
      nom = localStorage.getItem('larbin.nom') ?? '';
    } catch { /* un nom tiré au sort fera l'affaire */ }
    installer(new TableEnLigne(nom || nomPropose(), code));
  };
  void portailPret().then((pret) => {
    if (!pret) return;
    ecouterLesInvitations(allerAuSalon);
    // Le joueur a pu ouvrir un salon avant que le module réponde : on le redessine, avec son lien.
    if (table) surChangement();
    // Chez un portail, quitter une table ne recharge pas la page (voir
    // revenirAccueil) : l'invitation ne se suit donc qu'à l'arrivée, et un
    // redémarrage demandé par le portail la suit de nouveau, comme il l'attend.
    if (table !== null) return;
    const invitation = invitationRecue();
    if (invitation) allerAuSalon(invitation);
    else if (multijoueurImmediat()) allerAuSalon('');
  });
}

/** Arrivée par un lien d'invitation : on ne demande que le nom. */
function voileAccueilPourRejoindre(code: string): void {
  montrerVoile(`
    <h2>${tr('Salon', 'Room')} ${code.toUpperCase()}</h2>
    <p>${tr('On vous attend à cette table. Sous quel nom ?', 'They’re waiting for you at this table. Under what name?')}</p>
    <label class="champ">${tr('Votre nom', 'Your name')}
      <input id="nom" type="text" maxlength="14" placeholder="${tr('Votre prénom', 'Your name')}" value="${attribut(nomPropose())}">
    </label>
    <button class="action primaire" id="entrer" type="button">${tr('Rejoindre', 'Join')}</button>
  `);
  $('entrer').addEventListener('click', () => {
    const valeur = ($('nom') as HTMLInputElement).value.trim() || nomPropose();
    try {
      localStorage.setItem('larbin.nom', valeur);
    } catch { /* peu importe */ }
    installer(new TableEnLigne(valeur, code));
  });
}
