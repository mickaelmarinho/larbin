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
  ADRESSE_PUBLIQUE, TableEnLigne, TableSolo, hoteDuJeu, type Table,
} from './table.ts';
import { THEMES, appliquerTheme, themeCourant } from './themes.ts';

const $ = (id: string) => document.getElementById(id)!;

let table: Table | null = null;
let selection: string[] = [];
let mancheAnnoncee = 0;
let restantesVisibles = false;
let poseAffichee = '';
let minuteur: ReturnType<typeof setTimeout> | undefined;
let annonce = '';
/** Un panneau ouvert par le joueur ne doit pas être balayé par le coup suivant. */
let voileManuel = false;

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
      <span class="nom">${o.name}</span>
      ${o.role ? `<span class="role ${o.role}">${o.role}</span>` : ''}
      <span class="etat">${etatTexte}</span>
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
  $('ma-ligne').innerHTML = `${role}<span>Manche ${vue.round} — ${vue.me.hand.length} cartes</span>`;

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
  rendre();
  boucle();
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

  if (vue.phase === 'fin-de-partie') return voileFinDePartie(vue);
  if (vue.phase === 'fin-de-manche') return voileFinDeManche(vue);
  if (vue.phase === 'echange' && vue.echange) return voileEchange(vue);
  if (vue.phase === 'echange') return cacherVoile();

  if (vue.round > mancheAnnoncee && vue.round > 1 && vue.mesEchanges.length > 0) {
    return voileDebutDeManche(vue);
  }
  mancheAnnoncee = Math.max(mancheAnnoncee, vue.round);
  cacherVoile();

  // Aucun coup possible : la règle impose de passer, autant le faire pour vous.
  if (vue.turnPlayer === vue.me.id && vue.legal.length === 0 && vue.canPass) {
    annonce = 'Vous ne pouvez pas monter.';
    $('annonce').textContent = annonce;
    minuteur = setTimeout(() => agir({ type: 'passer', player: vue.me.id }), 1100);
  }
}

/* ------------------------------------------------------------- les voiles */

function montrerVoile(html: string): void {
  $('voile').innerHTML = `<div class="panneau">${html}</div>`;
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
function voileDebutDeManche(vue: PlayerView): void {
  mancheAnnoncee = vue.round;
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

  montrerVoile(`
    <h2>Manche ${vue.round}</h2>
    <p>${phrases.map((p) => `• ${p}`).join('<br>')}</p>
    <p>${nomBoss} la manche.</p>
    <button class="action primaire" id="commencer" type="button">Jouer</button>
  `);
  $('commencer').addEventListener('click', () => {
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
      <span>${p.nom}${deux}</span>
      <span class="gain">+${n - 1 - i} → ${p.points}</span>
      <span class="role ${p.role}">${TITRES[p.role!]}</span>
    </li>`;
  }).join('');
}

function voileFinDeManche(vue: PlayerView): void {
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
      <span>${p.nom}</span>
      <span class="gain">${p.points} pt${p.points > 1 ? 's' : ''}</span>
    </li>`).join('');

  // Remettre les scores à zéro engage toute la table : en ligne, c'est à l'hôte.
  const enLigne = table instanceof TableEnLigne ? table : null;
  const jeRelance = !enLigne
    || (enLigne.salon()?.sieges.find((s) => s.id === enLigne.moi)?.hote ?? false);

  montrerVoile(`
    <h2>Partie terminée</h2>
    <p>${verdict}</p>
    <ul class="classement">${lignes}</ul>
    ${jeRelance
      ? '<button class="action primaire" id="rejouer" type="button">Nouvelle partie</button>'
      : '<p class="mention">L’hôte relancera une partie quand vous voudrez.</p>'}
  `);

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

function voileAccueil(): void {
  const horsLigne = location.protocol === 'file:';
  const nomConnu = localStorage.getItem('larbin.nom') ?? '';

  montrerVoile(`
    <h2>Le Larbin</h2>
    <p>Contre trois bots, ou avec vos proches — chacun sur son téléphone.</p>
    <label class="champ">Votre nom
      <input id="nom" type="text" maxlength="14" placeholder="Mickaël" value="${nomConnu}">
    </label>
    <button class="action primaire" id="solo" type="button">Jouer contre les bots</button>
    ${horsLigne ? `<p class="mention">Ce fichier joue en solo, hors ligne.
       Pour une partie à plusieurs, ouvrez
       <a href="https://${ADRESSE_PUBLIQUE}" target="_blank" rel="noopener">${ADRESSE_PUBLIQUE}</a>
       — ou lancez <b>Serveur.cmd</b> pour jouer sur votre wifi.</p>` : `
      <button class="action" id="creer" type="button">Créer un salon</button>
      <div class="rejoindre">
        <input id="code" type="text" maxlength="4" placeholder="CODE" autocapitalize="characters">
        <button class="action" id="rejoindre" type="button">Rejoindre</button>
      </div>`}
    <button class="action" id="tapis-accueil" type="button">Choisir le tapis</button>
  `);

  const nom = () => {
    const valeur = ($('nom') as HTMLInputElement).value.trim();
    try {
      localStorage.setItem('larbin.nom', valeur);
    } catch { /* peu importe */ }
    return valeur || 'Joueur';
  };

  $('tapis-accueil').addEventListener('click', () => voileTapis(voileAccueil));

  $('solo').addEventListener('click', () => {
    cacherVoile();
    installer(new TableSolo());
  });

  if (horsLigne) return;
  $('creer').addEventListener('click', () => installer(new TableEnLigne(nom(), '')));
  $('rejoindre').addEventListener('click', () => {
    const code = ($('code') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length === 4) installer(new TableEnLigne(nom(), code));
  });
}

function voileSalon(en: TableEnLigne): void {
  const salon = en.salon();
  if (!salon) {
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

  const jeSuisHote = salon.sieges.find((s) => s.id === en.moi)?.hote ?? false;
  const lien = `${location.origin}/?salon=${salon.code}`;
  const manque = salon.minJoueurs - salon.sieges.length;

  const sieges = salon.sieges.map((s) => `<li>
      <span>${s.nom}${s.hote ? ' <span class="gain">hôte</span>' : ''}</span>
      <span class="gain">${s.estBot ? 'bot' : s.connecte ? 'en ligne' : 'déconnecté'}</span>
      ${jeSuisHote && s.id !== en.moi ? `<button class="mini" data-retirer="${s.id}" type="button">✕</button>` : ''}
    </li>`).join('');

  const erreur = en.erreur();
  montrerVoile(`
    <h2>Salon ${salon.code}</h2>
    <p>Partagez ce lien, ou dictez le code : <b>${salon.code}</b>.</p>
    <div class="rejoindre">
      <input id="lien" type="text" readonly value="${lien}">
      <button class="action" id="copier" type="button">Copier</button>
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
  `);

  en.oublierErreur();

  $('copier').addEventListener('click', async () => {
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
  table.abonner(surChangement);
  surChangement();
}

$('ma-main').addEventListener('click', (e) => {
  const cible = (e.target as HTMLElement).closest('.carte') as HTMLElement | null;
  if (cible) choisirCarte(cible.dataset.id!);
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
  voileManuel = true;
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
    <p>Choisissez votre table. Ça ne change que l'allure.</p>
    <div class="tapis-liste">${choix}</div>
    <button class="action primaire" id="fermer-tapis" type="button">Revenir au jeu</button>
  `);

  $('voile').querySelectorAll('[data-theme]').forEach((b) => {
    b.addEventListener('click', () => {
      const theme = THEMES.find((t) => t.cle === (b as HTMLElement).dataset.theme);
      if (!theme) return;
      appliquerTheme(theme);
      voileTapis(retour);
    });
  });
  $('fermer-tapis').addEventListener('click', () => {
    voileManuel = false;
    retour();
  });
}

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

appliquerTheme(themeCourant());

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
      <input id="nom" type="text" maxlength="14" placeholder="Mickaël">
    </label>
    <button class="action primaire" id="entrer" type="button">Rejoindre</button>
  `);
  $('entrer').addEventListener('click', () => {
    const valeur = ($('nom') as HTMLInputElement).value.trim() || 'Joueur';
    try {
      localStorage.setItem('larbin.nom', valeur);
    } catch { /* peu importe */ }
    installer(new TableEnLigne(valeur, code));
  });
}
