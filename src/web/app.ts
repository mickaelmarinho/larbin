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
  ADRESSE_PUBLIQUE, DUREE_REACTION, TABLE_PUBLIQUE, TableEnLigne, TableSolo, activite, hoteDuJeu,
  tablesPubliques, type ResumeTable, type Table,
} from './table.ts';
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
import type { Activite } from './table.ts';
import type { LigneClassement } from './compte.ts';
import { adopterSucces } from './succes.ts';
import { jouerSons, ouvrirAuPremierGeste, reglerSons, sonsActifs } from './sons.ts';
import {
  MUSIQUES, ORDRE_MUSIQUES, choisirMusique, musiqueAuPremierGeste, musiqueChoisie,
} from './musique.ts';

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

const TITRES: Record<Role, string> = {
  boss: 'Boss',
  'sous-boss': 'Sous-Boss',
  neutre: 'Neutre',
  'sur-larbin': 'Sur-Larbin',
  larbin: 'Larbin',
};

/* ---------------------------------------------------------------- cartes */

const EST_ROUGE = (c: Card) => c.suit === '♥' || c.suit === '♦';

function carteHTML(c: Card, classes = ''): string {
  const teinte = EST_ROUGE(c) ? 'rouge' : '';
  return `<button class="carte ${teinte} ${classes}" data-id="${c.id}" type="button">`
    + `<span class="coin">${rankLabel(c.rank)}<i>${c.suit}</i></span>`
    + `<span class="centre">${c.suit}</span></button>`;
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
      nom: 'Vous', role: vue.me.role, points: vue.me.points,
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
    `<span class="marque moi">Vous <b>${vue.me.points}</b></span>`,
    ...vue.others.map((o) => `<span class="marque">${o.name} <b>${o.points}</b></span>`),
  ];
  $('tableau-scores').innerHTML = `${marques.join('')}<span class="objectif">objectif ${vue.objectif}</span>`;
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
  (s.compte ? '<span class="verifie" title="Joueur avec un compte">✓</span>' : '');

function rendreAdversaires(vue: PlayerView): void {
  $('adversaires').innerHTML = vue.others.map((o) => {
    const actif = vue.turnPlayer === o.id && vue.phase === 'jeu';
    const dos = Math.min(3, o.count);
    // Une série ne fait qu'un tour : savoir qui a déjà parlé change tout.
    // Et quand la table attend quelqu'un qui a décroché, il faut le dire.
    const etatTexte = !o.connecte ? 'déconnecté'
      : o.count === 0 ? `sorti ${o.finishedAt! + 1}${o.finishedAt === 0 ? 'er' : 'e'}`
      : o.passed ? 'a passé'
      : o.aAgi ? 'a joué' : '';
    const classes = [
      actif ? 'actif' : '',
      o.count === 0 ? 'sorti' : '',
      o.connecte ? '' : 'absent',
    ].join(' ');
    return `<div class="joueur ${classes}">
      <div class="dos-pile">
        ${'<div class="dos"></div>'.repeat(dos)}
        ${o.count > 0 ? `<span class="compte">${o.count}</span>` : ''}
      </div>
      <span class="nom"><span class="avatar">${avatarDe(o.id)}</span>${o.name}</span>
      ${o.role ? `<span class="role ${o.role}">${o.role}</span>` : ''}
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
    return coupe ? `${ligne.replace(/\.$/, '')} — le 2 coupe.` : ligne;
  }
  return vue.log[vue.log.length - 1] ?? '';
}

function rendreTapis(vue: PlayerView): void {
  const dernier = vue.pile[vue.pile.length - 1];
  const signature = dernier ? `${dernier.player}:${dernier.cards.map((c) => c.id).join(',')}` : '';
  if (signature !== poseAffichee) {
    poseAffichee = signature;
    $('pose').classList.toggle('de-moi', dernier?.player === vue.me.id);
    $('pose').innerHTML = dernier ? sortHand(dernier.cards).map((c) => carteHTML(c)).join('') : '';
  }
  // Série close : les cartes restent visibles, mais elles ne comptent plus.
  $('pose').classList.toggle('finie', vue.requirement === null && vue.pile.length > 0);

  const exigence = $('exigence');
  if (vue.requirement) {
    const { count, rank } = vue.requirement;
    exigence.textContent = `Il faut ${count === 1 ? 'une carte' : `${count} cartes`} au-dessus du ${rankLabel(rank)}`;
    exigence.classList.remove('vide');
  } else {
    exigence.textContent = 'Tapis libre — posez ce que vous voulez';
    exigence.classList.add('vide');
  }

  $('annonce').textContent = franciser(annonce, vue.me.name);
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
      + `${rankLabel(rang)} <b>${reste}</b></span>`)
    .join('');
}

function rendreMaMain(vue: PlayerView): void {
  const rangs = rangsJouables(vue);
  const monTour = vue.turnPlayer === vue.me.id && vue.phase === 'jeu';

  $('ma-main').innerHTML = sortHand(vue.me.hand).map((c) => {
    const jouable = rangs.has(c.rank);
    return carteHTML(c, [
      selection.includes(c.id) ? 'choisie' : '',
      monTour && jouable ? 'jouable' : '',
      monTour && !jouable ? 'morte' : '',
    ].join(' '));
  }).join('');

  ajusterChevauchement(vue.me.hand.length);

  const role = vue.me.role ? `<span class="role ${vue.me.role}">${vue.me.role}</span>` : '';
  // En ligne, de quoi réagir : un bouton, et la palette quand on l'ouvre.
  const reagir = table instanceof TableEnLigne
    ? `${bulle(vue.me.id)}<button id="reagir" class="${paletteOuverte ? 'actif' : ''}" type="button"
         title="Réagir">😊</button>${paletteOuverte ? `<div class="palette">${REACTIONS
      .map((r) => `<button data-reaction="${r}" type="button">${r}</button>`).join('')}</div>` : ''}`
    : '';
  $('ma-ligne').innerHTML = `<span class="avatar">${avatarDe(vue.me.id)}</span>${role}`
    + `<span>Manche ${vue.round} — ${vue.me.hand.length} cartes</span>${reagir}`;

  const poser = $('poser') as HTMLButtonElement;
  const passer = $('passer') as HTMLButtonElement;
  const coup = coupChoisi(vue);
  const manquantes = vue.requirement ? vue.requirement.count - selection.length : 0;
  poser.disabled = !coup;
  poser.textContent = !coup && selection.length > 0 && manquantes > 0
    ? `Encore ${manquantes} carte${manquantes > 1 ? 's' : ''}`
    : 'Poser';
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
  rendre();
  boucle();
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
  $('sons').textContent = actifs ? '🔔' : '🔕';
  $('sons').title = actifs ? 'Couper les sons' : 'Remettre les sons';
  $('sons').classList.toggle('coupes', !actifs);
  // La note de musique, pâlie tant qu'aucun morceau ne joue.
  const musique = musiqueChoisie();
  $('musique-choix').classList.toggle('coupes', !musique);
  $('musique-choix').title = musique ? `Musique : ${MUSIQUES[musique].nom}` : 'Mettre de la musique';
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
      <b>${MUSIQUES[cle].nom}</b><small>${MUSIQUES[cle].resume}</small>
    </button>`).join('');

  montrerVoile(`
    <h2>La musique</h2>
    <p>Touchez un morceau pour l’écouter : il continue pendant la partie.</p>
    <div class="musiques">
      ${choix}
      <button data-musique="" class="${actuelle ? '' : 'actif'}" type="button"><b>🔇 Pas de musique</b></button>
    </div>
    <button class="action primaire" id="fermer-musique" type="button">Revenir</button>
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
  ? '🔔 Sons activés — couper' : '🔕 Sons coupés — remettre'}</button>`;

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
          ? `À vous — la table jouera pour vous dans ${reste} s.`
          : 'La table joue pour vous…';
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
    annonce = 'Vous ne pouvez pas monter.';
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

const EN_LETTRES = ['zéro', 'une', 'deux', 'trois', 'quatre'];

function voileEchange(vue: PlayerView): void {
  const { sens, avec, count, recues, choix } = vue.echange!;
  const { forcees, candidats, aChoisir } = choix;
  const autre = vue.others.find((o) => o.id === avec)!;
  const seule = count === 1;
  const hauteur = rankLabel(candidats[0].rank);

  const consigne = aChoisir === 1
    ? `Vous avez ${EN_LETTRES[candidats.length]} ${hauteur} : choisissez la couleur.`
    : `Vous avez ${EN_LETTRES[candidats.length]} ${hauteur} : choisissez-en ${EN_LETTRES[aChoisir]}.`;

  const titre = sens === 'donner' ? `Le tribut du ${TITRES[vue.me.role!]}` : 'Ce que vous rendez';
  const explication = sens === 'donner'
    ? `Vous cédez à ${autre.name} ${seule ? 'votre meilleure carte' : `vos ${EN_LETTRES[count]} meilleures cartes`}
       — la règle l'impose, seule la couleur vous appartient.`
    : `${autre.name} vous a cédé ${seule ? 'sa meilleure carte' : 'ses deux meilleures cartes'}.
       En retour vous lui rendez ${seule ? 'votre plus basse' : `vos ${EN_LETTRES[count]} plus basses`}
       — là encore, seule la couleur vous appartient.`;

  montrerVoile(`
    <h2>${titre}</h2>
    <p>${explication}</p>
    ${sens === 'rendre' ? `<p class="mention">Vous recevez :</p>
      <div class="cartes-recues">${sortHand(recues).map((c) => carteHTML(c)).join('')}</div>` : ''}
    ${forcees.length > 0 ? `<p class="mention">Part d'office :</p>
      <div class="cartes-recues">${sortHand(forcees).map((c) => carteHTML(c)).join('')}</div>` : ''}
    <p class="mention">${consigne}</p>
    <div id="choix-rendu">${sortHand(candidats).map((c) => carteHTML(c)).join('')}</div>
    <button class="action primaire" id="valider-rendu" disabled type="button">
      ${sens === 'donner' ? 'Donner' : 'Rendre'} ${seule ? 'la carte' : `les ${count} cartes`}
    </button>
  `);

  let tranche: string[] = [];
  const bouton = $('valider-rendu') as HTMLButtonElement;

  $('choix-rendu').addEventListener('click', (e) => {
    const cible = (e.target as HTMLElement).closest('.carte') as HTMLElement | null;
    if (!cible) return;
    const id = cible.dataset.id!;
    tranche = tranche.includes(id)
      ? tranche.filter((x) => x !== id)
      : [...tranche, id].slice(-aChoisir);
    $('choix-rendu').querySelectorAll('.carte').forEach((el) => {
      el.classList.toggle('choisie', tranche.includes((el as HTMLElement).dataset.id!));
    });
    bouton.disabled = tranche.length !== aChoisir;
  });

  bouton.addEventListener('click', () => {
    cacherVoile();
    agir({ type: 'echanger', player: vue.me.id, cards: [...forcees.map((c) => c.id), ...tranche] });
  });
}

/**
 * Le récapitulatif de début de manche ne montre que vos propres échanges :
 * ce qui passe entre deux autres joueurs ne vous regarde pas.
 */
/**
 * La coupe du Boss. On ne mélange pas entre deux manches : couper est le seul
 * hasard qui reste, et c'est son privilège.
 */
function voileCoupe(vue: PlayerView): void {
  const boss = [vue.me, ...vue.others].find((p) => p.role === 'boss');

  if (!vue.coupe) {
    // Les autres attendent, et méritent de savoir pourquoi.
    montrerVoile(`
      <h2>Manche ${vue.round}</h2>
      <p>${boss ? boss.name : 'Le Boss'} coupe le paquet — on ne mélange pas
         entre deux manches.</p>
    `);
    return;
  }

  // Ne pas reconstruire le panneau sous les doigts du joueur.
  if (document.getElementById('coupe-position')) return;

  const taille = vue.coupe.taille;
  const milieu = Math.floor(taille / 2);

  montrerVoile(`
    <h2>À vous de couper</h2>
    <p>Les cartes n'ont pas été mélangées : elles sont dans l'ordre où elles sont
       tombées la manche dernière. Coupez où vous le sentez — vous retournerez la
       première carte, et vous la garderez.</p>
    <label class="champ">Couper après <b id="coupe-compte">${milieu}</b> cartes
      <input id="coupe-position" type="range" min="1" max="${taille - 1}" value="${milieu}">
    </label>
    <button class="action primaire" id="couper" type="button">Couper ici</button>
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

function voileDebutDeManche(vue: PlayerView): void {
  mancheAnnoncee = vue.round;
  // Sans ça, le premier coup du Boss refermerait le panneau avant qu'on ait eu
  // le temps de lire ce qui a changé de main.
  suspendre(true);
  const boss = [vue.me, ...vue.others].find((p) => p.role === 'boss');
  const nomBoss = !boss ? '' : boss.id === vue.me.id ? 'Vous ouvrez' : `${boss.name} ouvre`;

  const phrases = vue.mesEchanges.map((m) => {
    const jeCede = m.de === vue.me.id;
    const autre = joueur(vue, jeCede ? m.vers : m.de).nom;
    const cartes = m.cartes.map((c) => `${rankLabel(c.rank)}${c.suit}`).join(' ');
    if (m.sens === 'donner') {
      return jeCede ? `Vous cédez ${cartes} à ${autre}.` : `${autre} vous cède ${cartes}.`;
    }
    return jeCede ? `Vous rendez ${cartes} à ${autre}.` : `${autre} vous rend ${cartes}.`;
  });

  const coupee = vue.carteMontree;
  const quiCoupe = boss?.id === vue.me.id ? 'Vous coupez et montrez' : `${boss?.name} coupe et montre`;
  const laCoupe = coupee
    ? `<p>${quiCoupe} ${rankLabel(coupee.rank)}${coupee.suit} — elle lui revient.</p>`
        .replace('elle lui revient', boss?.id === vue.me.id ? 'elle vous revient' : 'elle lui revient')
    : '';

  montrerVoile(`
    <h2>Manche ${vue.round}</h2>
    ${laCoupe}
    ${phrases.length ? `<p>${phrases.map((p) => `• ${p}`).join('<br>')}</p>` : ''}
    <p>${nomBoss} la manche.</p>
    <button class="action primaire" id="commencer" type="button">Jouer</button>
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
    const deux = p.finishedOnTwo ? ' <span class="sur-un-deux">fini sur un 2</span>' : '';
    return `<li>
      <span class="place">${i + 1}${i === 0 ? 'er' : 'e'}</span>
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

  const verdict = vue.me.role === 'boss' ? 'Vous êtes le Boss.'
    : vue.me.role === 'larbin' ? 'Vous voilà Larbin. La prochaine manche va piquer.'
    : `Vous finissez ${TITRES[vue.me.role!]}.`;

  const tous = [{ id: vue.me.id, points: vue.me.points }, ...vue.others];
  const meneur = [...tous].sort((a, b) => b.points - a.points)[0];
  const restant = vue.objectif - meneur.points;
  const course = restant <= 3
    ? ` ${meneur.id === vue.me.id ? 'Vous êtes' : `${joueur(vue, meneur.id).nom} est`} à ${restant} point${restant > 1 ? 's' : ''} de la partie.`
    : '';

  montrerVoile(`
    <h2>Fin de la manche ${vue.round}</h2>
    <p>${verdict}${course}</p>
    <ul class="classement">${lignesDuClassement(vue)}</ul>
    <button class="action primaire" id="suivante" type="button">Manche suivante</button>
  `);
  $('suivante').addEventListener('click', () => {
    cacherVoile();
    annonce = '';
    agir({ type: 'manche-suivante' });
  });
}

function voileFinDePartie(vue: PlayerView): void {
  const tous = [
    { id: vue.me.id, nom: 'Vous', points: vue.me.points },
    ...vue.others.map((o) => ({ id: o.id, nom: o.name, points: o.points })),
  ].sort((a, b) => b.points - a.points);
  const vainqueur = tous[0];

  const verdict = vainqueur.id === vue.me.id
    ? `Vous remportez la partie avec ${vue.me.points} points.`
    : `${vainqueur.nom} remporte la partie avec ${vainqueur.points} points. Vous en avez ${vue.me.points}.`;

  const lignes = tous.map((p, i) => `<li>
      <span class="place">${i + 1}${i === 0 ? 'er' : 'e'}</span>
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
  // Le moment où l'on referme une partie est celui où l'on décide d'en relancer
  // une : c'est là, et pas ailleurs, que le compteur a une chance d'être lu.
  const trace = b.serie >= 2 ? `${b.serie} victoires d'affilée.`
    : b.parties === 1 ? 'Première partie enregistrée.'
    : `${b.victoires} victoire${b.victoires > 1 ? 's' : ''} en ${b.parties} parties.`;
  // Une table publique n'a pas d'hôte : tout joueur assis peut relancer.
  const jeRelance = !enLigne
    || (enLigne.salon()?.publique ?? false)
    || (enLigne.salon()?.sieges.find((s) => s.id === enLigne.moi)?.hote ?? false);

  montrerVoile(`
    <h2>Partie terminée</h2>
    <p>${verdict}</p>
    <ul class="classement">${lignes}</ul>
    <p class="trace">${trace} <button class="lien" id="parcours-fin" type="button">Votre parcours</button></p>
    <button class="action" id="partager" type="button">Partager le résultat</button>
    ${jeRelance
      ? '<button class="action primaire" id="rejouer" type="button">Nouvelle partie</button>'
      : '<p class="mention">L’hôte relancera une partie quand vous voudrez.</p>'}
    <button class="action" id="accueil-fin" type="button">Revenir à l’accueil</button>
  `);

  $('parcours-fin').addEventListener('click', () => voileParcours(() => boucle()));

  // Sans lui, la seule issue d'une partie finie était d'en recommencer une.
  $('accueil-fin').addEventListener('click', revenirAccueil);

  // Le message se raconte tout seul : la place, les points, les manches. Perdre
  // se partage aussi bien que gagner — mieux, même, quand c'est pour lancer un défi.
  const maPlace = tous.findIndex((p) => p.id === vue.me.id) + 1;
  const recit = maPlace === 1
    ? `J'ai gagné au Larbin : ${vue.me.points} points en ${vue.round} manches, devant `
      + `${tous.slice(1).map((p) => p.nom).join(', ')}.`
    : `Le Larbin m'a laissé ${maPlace}e sur ${tous.length} — ${vue.me.points} points `
      + `en ${vue.round} manches. ${vainqueur.nom} a gagné. À vous de faire mieux.`;
  $('partager').addEventListener('click', (e) => {
    void partager(e.currentTarget as HTMLElement, recit, `https://${ADRESSE_PUBLIQUE}`);
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
    <h2>${morale.rate ? 'Le piège s’est refermé' : 'C’est cela'}</h2>
    <p>${morale.texte}</p>
    ${morale.rate
      ? '<button class="action primaire" id="refaire" type="button">Réessayer</button>'
      : ''}
    <button class="action ${morale.rate ? '' : 'primaire'}" id="suite" type="button">${morale.derniere
      ? 'Terminer' : 'Leçon suivante'}</button>
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
function voileBienvenue(suite: () => void, libelle = 'Revenir'): void {
  suspendre(true);
  montrerVoile(`
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
       d’office</b>. Pour le détail,
       <a href="https://${ADRESSE_PUBLIQUE}/regles" target="_blank" rel="noopener">toutes les règles</a>.</p>
    <button class="action primaire" id="compris" type="button">${libelle}</button>
    <button class="action" id="apprendre" type="button">Apprendre en jouant — quatre leçons</button>
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
  montrerVoile(`
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
       prend chez nous des noms de table — Président, Trou du cul, Larbin —
       chacun avec ses règles maison, transmises de bouche à oreille sans jamais
       être écrites.</p>
    <p>Celles-ci sont les vôtres : une série ne fait qu'un tour, le 2 coupe net,
       on ne mélange pas entre deux manches, et c'est la dame de cœur qui ouvre
       la toute première partie.</p>
    <p class="mention"><a href="https://${ADRESSE_PUBLIQUE}/regles" target="_blank"
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
    repondre('Copié');
  } catch {
    repondre('Copie impossible');
  }
}

/** « 12 sept. », sans l'année tant qu'on reste dans celle qui court. */
function jourCourt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('fr-FR', {
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

  const roles: Array<[Role, string]> = [
    ['boss', 'Boss'], ['sous-boss', 'Sous-Boss'], ['neutre', 'Neutre'],
    ['sur-larbin', 'Sur-Larbin'], ['larbin', 'Larbin'],
  ];
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
      <span class="place">${x.place}${x.place === 1 ? 'er' : 'e'}</span>
      <span>${jourCourt(x.date)}${x.mode === 'en-ligne' ? ' · en ligne' : ''}</span>
      <span class="gain">${x.points} pt${x.points > 1 ? 's' : ''}</span>
    </li>`).join('');

  const corps = b.parties === 0
    ? `<p>Rien encore. Terminez une partie et elle s'inscrira ici — vos
         victoires, et surtout les rôles que la table vous a réservés.</p>`
    : `<div class="compteurs">
         <div><b>${b.parties}</b><span>partie${b.parties > 1 ? 's' : ''}</span></div>
         <div><b>${b.victoires}</b><span>victoire${b.victoires > 1 ? 's' : ''}</span></div>
         <div><b>${b.taux} %</b><span>de réussite</span></div>
         <div><b>${b.meilleureSerie}</b><span>d'affilée, au mieux</span></div>
       </div>
       ${barres}
       ${p.deuxFatals > 0
         ? `<p class="mention">Vous avez fini ${p.deuxFatals} manche${p.deuxFatals > 1 ? 's' : ''}
            sur un 2 — et payé le prix fort à chaque fois.</p>`
         : ''}
       <h3>Vos dernières parties</h3>
       <ul class="classement parties">${dernieres}</ul>`;

  montrerVoile(`
    <h2>Votre parcours</h2>
    ${corps}
    <button class="action" id="voir-succes" type="button">🏆 Vos succès — ${nombreDeSucces()} sur ${SUCCES.length}</button>
    <button class="action primaire" id="fermer-parcours" type="button">Revenir</button>
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
  <button class="podium" type="button" title="Voir le classement">${lignes.map((l, i) => `
    <span title="${attribut(`${l.pseudo} — ${l.victoires} victoire${l.victoires > 1 ? 's' : ''}`)}">
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
  ([['9', '♣'], ['V', '♦'], ['D', '♥'], ['2', '♠']] as const).map(([valeur, couleur]) => {
    const rouge = couleur === '♥' || couleur === '♦' ? ' rouge' : '';
    return `<span class="carte${rouge}"><span class="coin">${valeur}<i>${couleur}</i></span>`
      + `<span class="centre">${couleur}</span></span>`;
  }).join('')}</div>`;

function voileAccueil(): void {
  const horsLigne = location.protocol === 'file:';
  // Un nom tiré au sort attend dans le champ : on peut jouer sans rien taper.
  const nomConnu = localStorage.getItem('larbin.nom') || nomPropose();
  // Rien à afficher au premier passage : l'accueil d'un inconnu doit rester net.
  const b = bilan(parcours());
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
      <button class="reglage" id="tapis-accueil" type="button" title="Tapis et musique"
              aria-label="Tapis et musique">🎨</button>
    </div>
    <div class="affiche">
      <p class="accroche"><b>Le Président, en plus nerveux.</b>
        <span class="court">Une série ne fait qu’un tour de table. Sur téléphone ou PC.</span>
        <span class="long">Le jeu de cartes du Président — ou Trou du cul — en ligne et gratuit,
          sur téléphone ou PC.</span></p>
      ${EVENTAIL}
    </div>
    <!-- Sur PC seulement : ce qui change du Président classique, lu en cinq secondes. -->
    <ul class="trois-regles">
      <li><b>Un seul tour de table</b> par série : chacun ne parle qu’une fois.</li>
      <li><b>Le 2 coupe net</b> : plus fort que l’as, il clôt la série dès qu’il tombe.</li>
      <li><b>Finir sur un 2</b> rend Larbin d’office.</li>
    </ul>
    </div>
    <div class="jeu">
    <div class="identite">
      <button class="avatar-choix" id="avatar-accueil" type="button" title="Changer d’avatar">${avatarChoisi()}</button>
      ${moi
    ? `<div class="champ connecte">Connecté
        <b>✓ ${attribut(moi.pseudo)}</b>
        <input id="nom" type="hidden" value="${attribut(moi.pseudo)}">
      </div>`
    : `<input id="nom" type="text" maxlength="14" placeholder="Votre prénom" aria-label="Votre nom"
              value="${attribut(nomConnu)}">`}
      ${horsLigne ? '' : `<button class="compte-choix" id="compte" type="button"
              title="${moi ? 'Mon compte' : 'Créer un compte ou se connecter'}">🔑<span> Compte</span></button>`}
    </div>
    ${horsLigne ? `<p class="mention">Ce fichier joue en solo, hors ligne.
       Pour une partie à plusieurs, ouvrez
       <a href="https://${ADRESSE_PUBLIQUE}" target="_blank" rel="noopener">${ADRESSE_PUBLIQUE}</a>
       — ou lancez <b>Serveur.cmd</b> pour jouer sur votre wifi.</p>` : `
      <section class="bloc">
        <h3>🌍 En ligne <span id="vie">${htmlDeVie(signeDeVie(derniereActivite))}</span></h3>
        <button class="action primaire" id="publique" type="button">${texteDuBoutonPublic(derniereActivite)}</button>
        <div id="podium">${htmlDuPodium(dernierPodium)}</div>
      </section>
      <section class="bloc">
        <h3>👥 Entre amis</h3>
        <button class="action" id="creer" type="button">Créer un salon</button>
        <div class="rejoindre">
          <input id="code" type="text" maxlength="4" placeholder="CODE" aria-label="Code du salon"
                 autocapitalize="characters">
          <button class="action" id="rejoindre" type="button">Rejoindre</button>
        </div>
      </section>`}
    <section class="bloc">
      <h3>🤖 Solo</h3>
      <button class="action${horsLigne ? ' primaire' : ''}" id="solo" type="button">Jouer contre les bots</button>
      ${didacticielFini() ? '' : `<button class="action lecon" id="lecon-accueil" type="button">
        <span>♥ Apprendre en jouant</span>
        <small>4 petites leçons · 2 minutes</small>
      </button>`}
    </section>
    <button class="lien" id="faire-decouvrir" type="button">📣 Faire découvrir le jeu à un proche</button>
    </div>
    <nav class="raccourcis">
      ${raccourci('succes', '🏆', 'Succès', `Vos succès — ${nombreDeSucces()} sur ${SUCCES.length}`)}
      ${horsLigne ? '' : raccourci('classement', '🏅', 'Classement')}
      ${b.parties > 0 ? raccourci('parcours', '📊', 'Parcours',
        `Votre parcours — ${b.victoires} victoire${b.victoires > 1 ? 's' : ''} en ${b.parties} partie${b.parties > 1 ? 's' : ''}`) : ''}
      ${raccourci('regles', '📖', 'Règles', 'Comment on joue ?')}
      ${raccourci('histoire', '📜', 'Histoire', 'D’où vient ce jeu ?')}
    </nav>
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
      'Je joue au Larbin : le Président (Trou du cul) en plus nerveux, en ligne et gratuit. Une partie ?',
      `https://${ADRESSE_PUBLIQUE}`);
  });
  $('histoire').addEventListener('click', () => voileHistoire(voileAccueil));

  // La première fois, on explique avant de lancer : cinq lignes, puis on joue.
  const enPassantParLesRegles = (jouer: () => void) => {
    if (dejaExplique()) jouer();
    else voileBienvenue(jouer, 'Jouer');
  };

  $('solo').addEventListener('click', () => enPassantParLesRegles(() => {
    cacherVoile();
    installer(new TableSolo());
  }));

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
    const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    const ligne = (t: ResumeTable) => `<li>
      <span>${t.commencee
    ? `${pluriel(t.joueurs, 'joueur')}${t.bots ? ` et ${pluriel(t.bots, 'bot')}` : ''} — manche ${t.manche}`
    : `${t.joueurs} sur ${t.taille} joueurs, ${t.prets} prêt${t.prets > 1 ? 's' : ''}`}</span>
      ${t.libre
    ? `<button class="mini mot" data-table="${t.code}" type="button">${t.commencee ? 'Entrer' : 'Rejoindre'}</button>`
    : '<span class="gain">complète</span>'}
    </li>`;

    const attente = liste.filter((t) => !t.commencee);
    const enCours = liste.filter((t) => t.commencee);
    const vide = cherche
      ? '<p class="mention">On regarde qui est là…</p>'
      : `<p>Aucune table ouverte pour l’instant. Asseyez-vous : les visiteurs
         suivants verront la vôtre, et pourront s’y joindre.</p>`;

    montrerVoile(`
      <h2>Tables publiques</h2>
      ${liste.length === 0 ? vide : ''}
      ${attente.length ? `<h3>En attente</h3><ul class="classement">${attente.map(ligne).join('')}</ul>` : ''}
      ${enCours.length ? `<h3>Parties en cours</h3>
         <p class="mention">On y prend la place d’un bot, et l’on joue à la manche en cours.</p>
         <ul class="classement">${enCours.map(ligne).join('')}</ul>` : ''}
      <button class="action primaire" id="asseoir" type="button">M’asseoir à une table</button>
      <button class="action" id="retour" type="button">Retour</button>
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
      <span>${avatarDuSiege(s)}${s.id === en.moi ? `${s.nom} (vous)` : s.nom}${marqueDeCompte(s)}</span>
      <span class="gain">${s.estBot ? 'bot'
    : !s.connecte ? 'parti'
    : s.pret ? 'prêt' : 'pas prêt'}</span>
    </li>`),
    ...Array.from({ length: libres }, () => `<li class="libre">
      <span>Place libre</span><span class="gain">un bot, si personne</span>
    </li>`),
  ].join('');

  const humains = salon.sieges.filter((s) => !s.estBot);
  const prets = humains.filter((s) => s.pret).length;
  const secondes = en.departDans();

  // Le compte à rebours ne part que lorsque tout le monde s'est dit prêt. Il
  // s'arrête si quelqu'un se dédit, ou si un nouveau venu s'assoit.
  const entete = secondes !== null
    ? (secondes > 0
      ? `Tout le monde est prêt — départ dans <b>${secondes} s</b>.`
      : 'C’est parti…')
    : assis > 1
      ? `<b>${prets} sur ${humains.length}</b> se sont dits prêts.`
      : '<b>Vous êtes seul</b> à cette table pour l’instant.';

  const conseil = secondes !== null
    ? 'Les places encore libres iront à des bots.'
    : assis > 1
      ? `Le départ se fait à l’accord de tous : il suffit qu’un joueur se dédise, ou
         qu’un nouveau venu s’assoie, pour que le compte à rebours s’arrête. Changer
         la taille de la table remet aussi chacun « pas prêt ».`
      : `Attendez aussi longtemps que vous voulez ; les autres visiteurs voient votre
         table. Dites-vous prêt pour lancer le compte à rebours, ou commencez tout de
         suite avec des bots.`;

  // À cinq il y a un Neutre, à six il y en a deux : la table n'a pas le même
  // goût selon sa taille, autant laisser choisir.
  const tailles = [4, 5, 6].map((n) => `<button
      class="mini mot ${n === salon.taille ? 'choisi' : ''}"
      data-taille="${n}" type="button" ${n < assis ? 'disabled' : ''}>${n}</button>`).join('');

  montrerVoile(`
    <h2>Table publique</h2>
    <p>${entete}</p>
    <ul class="classement">${places}</ul>
    <p class="taille">Joueurs à cette table : ${tailles}</p>
    <p class="mention">${conseil}</p>
    <button class="action ${moi?.pret ? '' : 'primaire'}" id="pret" type="button">${moi?.pret
      ? 'Je ne suis plus prêt' : 'Je suis prêt'}</button>
    <button class="action" id="maintenant" type="button">Commencer avec des bots</button>
    <button class="action" id="quitter" type="button">Quitter</button>
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
    en.quitter();
    table = null;
    location.href = location.pathname;
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
      montrerVoile(`<h2>Impossible d'entrer</h2><p>${refus}</p>
        <button class="action primaire" id="retour" type="button">Revenir à l'accueil</button>`);
      $('retour').addEventListener('click', () => {
        en.quitter();
        table = null;
        location.href = location.pathname;
      });
      return;
    }
    // Le serveur s'endort après un moment sans visite. Mieux vaut le dire que
    // de laisser le joueur devant un écran qui ne bouge pas.
    const secondes = en.attente();
    const explication = secondes < 4
      ? 'On frappe à la porte du salon.'
      : `Le serveur se réveille — il fait la sieste quand personne ne joue.
         Comptez une trentaine de secondes. (${secondes} s)`;
    montrerVoile(`<h2>Connexion…</h2><p>${explication}</p>`);
    return;
  }

  if (salon.publique) return voileTablePublique(en, salon);

  const jeSuisHote = salon.sieges.find((s) => s.id === en.moi)?.hote ?? false;
  const lien = `${location.origin}/?salon=${salon.code}`;
  const manque = salon.minJoueurs - salon.sieges.length;

  const sieges = salon.sieges.map((s) => `<li>
      <span>${avatarDuSiege(s)}${s.nom}${marqueDeCompte(s)}${s.hote ? ' <span class="gain">hôte</span>' : ''}</span>
      <span class="gain">${s.estBot ? 'bot' : s.connecte ? 'en ligne' : 'déconnecté'}</span>
      ${jeSuisHote && s.id !== en.moi ? `<button class="mini" data-retirer="${s.id}" type="button">✕</button>` : ''}
    </li>`).join('');

  const erreur = en.erreur();
  montrerVoile(`
    <h2>Salon ${salon.code}</h2>
    <p>Partagez ce lien, ou dictez le code : <b>${salon.code}</b>.</p>
    <div class="rejoindre">
      <input id="lien" type="text" readonly value="${lien}">
      <button class="action" id="copier" type="button">${navigator.share ? 'Envoyer' : 'Copier'}</button>
    </div>
    <ul class="classement">${sieges}</ul>
    ${erreur ? `<p class="mention alerte">${erreur}</p>` : ''}
    ${manque > 0 ? `<p class="mention">Encore ${manque} joueur${manque > 1 ? 's' : ''} — ou autant de bots.</p>` : ''}
    ${jeSuisHote ? `
      <button class="action" id="bot" type="button">Ajouter un bot</button>
      <button class="action primaire" id="lancer" type="button" ${manque > 0 ? 'disabled' : ''}>
        Commencer la partie
      </button>` : '<p class="mention">L’hôte lancera la partie.</p>'}
    <button class="action" id="quitter" type="button">Quitter</button>
    ${interrupteurSons()}
  `);

  en.oublierErreur();
  brancherInterrupteurSons();

  $('copier').addEventListener('click', async () => {
    if (navigator.share) {
      await partager($('copier'), `Une partie de Larbin ? Le code du salon est ${salon.code}.`, lien);
      return;
    }
    try {
      await navigator.clipboard.writeText(lien);
      $('copier').textContent = 'Copié';
    } catch {
      ($('lien') as HTMLInputElement).select();
    }
  });
  $('quitter').addEventListener('click', () => {
    en.quitter();
    table = null;
    location.href = location.pathname;
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
      ${t.nom}
    </button>`).join('');

  montrerVoile(`
    <h2>Le tapis</h2>
    <p>Choisissez votre table. Ça ne change que l'ambiance.</p>
    <div class="tapis-liste">${choix}</div>
    <button class="action" id="musique" type="button">🎵 Musique : ${(() => {
      const m = musiqueChoisie();
      return m ? MUSIQUES[m].nom : 'aucune';
    })()} — changer</button>
    <button class="action primaire" id="fermer-tapis" type="button">Revenir au jeu</button>
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
  if (table instanceof TableEnLigne) {
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
    <h2>Quitter la partie ?</h2>
    <p>La table continue sans vous : elle jouera à votre place.</p>
    <button class="action primaire" id="rester" type="button">Rester</button>
    <button class="action" id="partir" type="button">Revenir à l’accueil</button>
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
  toast.innerHTML = `<span class="icone">${s.icone}</span><span><small>Succès débloqué</small>${s.nom}`
    + `${offert ? ` <span class="offert">· avatar ${offert} offert</span>` : ''}</span>`;
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
      <span class="texte"><b>${s.nom}</b><small>${s.comment}${date ? ` · ${jourCourt(date)}` : ''}${
        avatarDebloquePar(s.id) ? ` · avatar ${avatarDebloquePar(s.id)}` : ''}</small></span>
    </li>`;
  }).join('');

  montrerVoile(`
    <h2>Vos succès</h2>
    <p><b>${nombreDeSucces()}</b> sur ${SUCCES.length}. Ils restent dans ce navigateur.</p>
    <ul class="succes">${liste}</ul>
    <button class="action primaire" id="fermer-succes" type="button">Revenir</button>
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
      ${bouton(avatar, obtenu, s.nom)}
      <span><b>${s.nom}</b><small>${obtenu ? 'Débloqué' : s.comment}</small></span>
    </li>`;
  }).join('');

  montrerVoile(`
    <h2>Votre avatar</h2>
    <p>Il s’affiche à côté de votre nom — et les autres le voient, en ligne.</p>
    <div class="avatars">${libres}</div>
    <h3>À gagner avec les succès</h3>
    <ul class="avatars-a-gagner">${aGagner}</ul>
    <button class="action primaire" id="fermer-avatar" type="button">Revenir</button>
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

const lienConfidentialite = () =>
  (location.protocol === 'file:' ? `https://${ADRESSE_PUBLIQUE}/confidentialite` : '/confidentialite');

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
    <h2>Un compte ?</h2>
    <p>C’est facultatif : sans compte, vous jouez en invité, comme avant. Avec, vos succès,
       votre parcours et votre avatar vous suivent sur tous vos appareils, votre pseudo vous
       est réservé, et vous entrez au classement.</p>
    <h3>Créer un compte</h3>
    <label class="champ">Votre pseudo
      <input id="pseudo-creer" type="text" maxlength="14" autocomplete="nickname"
        value="${attribut(localStorage.getItem('larbin.nom') ?? '')}">
    </label>
    <button class="action primaire" id="creer-compte" type="button">Créer mon compte</button>
    <h3>J’ai déjà un compte</h3>
    <label class="champ">Pseudo
      <input id="pseudo-connexion" type="text" maxlength="14" autocomplete="username">
    </label>
    <label class="champ">Code secret
      <input id="code-connexion" type="text" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX"
        autocapitalize="characters" autocomplete="off" spellcheck="false">
    </label>
    <button class="action" id="se-connecter" type="button">Se connecter</button>
    <p class="mention alerte" id="erreur-compte" hidden></p>
    <p class="mention">Ni adresse e-mail, ni mot de passe.
       <a href="${lienConfidentialite()}" target="_blank" rel="noopener">Ce que nous gardons</a>.</p>
    <button class="action" id="fermer-compte" type="button">Revenir</button>
  `);

  const signaler = (texte: string) => {
    const p = document.getElementById('erreur-compte');
    if (!p) return;
    p.textContent = texte;
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
    voileCodeSecret(r.code, 'Votre compte est créé', '', fermer);
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
    <p>Voici votre <b>code secret</b>. Notez-le, ou gardez-en une capture d’écran : c’est la
       seule façon de retrouver votre compte sur un autre appareil. Personne ne pourra vous le
       renvoyer.</p>
    <p class="code-secret">${code}</p>
    ${note ? `<p class="mention">${note}</p>` : ''}
    <button class="action" id="copier-code" type="button">Copier le code</button>
    <button class="action primaire" id="code-note" type="button">J’ai noté mon code</button>
  `);
  $('copier-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      $('copier-code').textContent = 'Copié';
    } catch {
      $('copier-code').textContent = 'Recopiez-le à la main';
    }
  });
  $('code-note').addEventListener('click', suite);
}

async function voileMonCompte(pseudo: string, retour: () => void, fermer: () => void): Promise<void> {
  montrerVoile(`<h2>${attribut(pseudo)}</h2><p class="mention">On regarde votre compte…</p>`);
  const infos = await monCompte();
  if (infos === null) {
    // La session a expiré, ou le compte a été supprimé ailleurs.
    voileCompte(retour);
    return;
  }
  if (infos === 'indisponible') {
    montrerVoile(`
      <h2>${attribut(pseudo)}</h2>
      <p>Le serveur ne répond pas pour l’instant. Vos succès et votre parcours restent dans ce
         navigateur ; ils rejoindront votre compte à la prochaine occasion.</p>
      <button class="action primaire" id="fermer-compte" type="button">Revenir</button>
    `);
    $('fermer-compte').addEventListener('click', fermer);
    return;
  }

  const b = bilan(parcours());
  montrerVoile(`
    <h2><span class="avatar">${avatarChoisi()}</span>${attribut(infos.compte.pseudo)}</h2>
    <p>Vos succès, votre parcours et votre avatar suivent ce pseudo sur tous vos appareils.</p>
    <p class="mention">Compte ouvert le ${jourCourt(infos.compte.creeLe)}</p>
    <div class="compteurs">
      <div><b>${nombreDeSucces()}</b><span>succès</span></div>
      <div><b>${infos.verifies}</b><span>vérifiés en ligne</span></div>
      <div><b>${b.parties}</b><span>partie${b.parties > 1 ? 's' : ''}</span></div>
    </div>
    <button class="action" id="nouveau-code" type="button">Obtenir un nouveau code secret</button>
    <button class="action" id="deconnexion" type="button">Se déconnecter de cet appareil</button>
    <button class="action alerte" id="supprimer-compte" type="button">Supprimer mon compte</button>
    <p class="mention"><a href="${lienConfidentialite()}" target="_blank" rel="noopener">Ce que nous gardons</a></p>
    <button class="action primaire" id="fermer-compte" type="button">Revenir</button>
  `);

  $('nouveau-code').addEventListener('click', async () => {
    $('nouveau-code').setAttribute('disabled', '');
    const code = await nouveauCodeSecret();
    if (!encoreLa('nouveau-code')) return;
    if (!code) {
      $('nouveau-code').textContent = 'Le serveur ne répond pas — réessayez';
      $('nouveau-code').removeAttribute('disabled');
      return;
    }
    voileCodeSecret(code, 'Nouveau code secret',
      'L’ancien code ne marche plus, et vos autres appareils devront se reconnecter.', fermer);
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
    <h2>Supprimer « ${attribut(pseudo)} » ?</h2>
    <p>Le compte, ses succès, son parcours et ses résultats seront effacés du serveur, et le pseudo
       redeviendra libre. Ce qui est déjà dans ce navigateur y reste.</p>
    <p class="mention alerte" id="erreur-compte" hidden></p>
    <button class="action primaire" id="garder-compte" type="button">Garder mon compte</button>
    <button class="action alerte" id="confirmer-suppression" type="button">Supprimer définitivement</button>
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
      p.textContent = 'Le serveur ne répond pas. Réessayez dans un instant.';
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
    <h2>Classement</h2>
    <p class="mention">On compte les victoires…</p>
    <button class="action primaire" id="fermer-classement" type="button">Revenir</button>
  `);
  $('fermer-classement').addEventListener('click', fermer);

  const lignes = await classementPublic();
  if (!encoreLa('fermer-classement')) return;
  const moi = sessionOuverte()?.pseudo;
  const corps = lignes === null
    ? '<p>Le classement ne répond pas pour l’instant. Réessayez dans un moment.</p>'
    : lignes.length === 0
      ? '<p>Personne encore. Créez un compte et gagnez une partie en ligne : la première place est à prendre.</p>'
      : `<ol class="classement-general">${lignes.map((l, i) => `<li class="${l.pseudo === moi ? 'moi' : ''}">
          <span class="rang">${i + 1}</span>
          <span class="avatar">${attribut(l.avatar ?? '🙂')}</span>
          <span class="qui">${attribut(l.pseudo)}</span>
          <span class="gain">${l.victoires} victoire${l.victoires > 1 ? 's' : ''} · ${l.parties} partie${l.parties > 1 ? 's' : ''}</span>
        </li>`).join('')}</ol>`;

  montrerVoile(`
    <h2>Classement</h2>
    <p>Les victoires en ligne des joueurs avec un compte — comptées par le serveur, qui a vu
       chaque partie.</p>
    ${corps}
    <button class="action primaire" id="fermer-classement" type="button">Revenir</button>
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
    if (!table.entamee || confirm('Abandonner la partie en cours et tout remettre à zéro ?')) {
      cacherVoile();
      mancheAnnoncee = 0;
      poseAffichee = '';
      table.recommencer();
    }
    return;
  }
  if (confirm('Quitter la table ?')) location.href = location.pathname;
});

window.addEventListener('resize', () => {
  const vue = table?.vue();
  if (vue) ajusterChevauchement(vue.me.hand.length);
});

// Le texte en clair de la page (pour les moteurs et les aperçus de lien) cède
// la place au vrai accueil.
document.getElementById('presentation')?.remove();
appliquerTheme(themeCourant());
afficherClochette();
ouvrirAuPremierGeste();
musiqueAuPremierGeste();
// Un compte a pu avancer sur un autre appareil : on reprend ses succès et son parcours.
if (sessionOuverte()) void monCompte();

// On cherche le serveur de parties dès le premier instant : s'il dort ailleurs,
// il se réveille pendant que le joueur entre son nom.
void hoteDuJeu();

const salonDemande = new URLSearchParams(location.search).get('salon');
if (salonDemande && location.protocol !== 'file:') {
  const nom = localStorage.getItem('larbin.nom') ?? '';
  if (nom) installer(new TableEnLigne(nom, salonDemande));
  else voileAccueilPourRejoindre(salonDemande);
} else {
  voileAccueil();
}

/** Arrivée par un lien d'invitation : on ne demande que le nom. */
function voileAccueilPourRejoindre(code: string): void {
  montrerVoile(`
    <h2>Salon ${code.toUpperCase()}</h2>
    <p>On vous attend à cette table. Sous quel nom ?</p>
    <label class="champ">Votre nom
      <input id="nom" type="text" maxlength="14" placeholder="Votre prénom" value="${attribut(nomPropose())}">
    </label>
    <button class="action primaire" id="entrer" type="button">Rejoindre</button>
  `);
  $('entrer').addEventListener('click', () => {
    const valeur = ($('nom') as HTMLInputElement).value.trim() || nomPropose();
    try {
      localStorage.setItem('larbin.nom', valeur);
    } catch { /* peu importe */ }
    installer(new TableEnLigne(valeur, code));
  });
}
