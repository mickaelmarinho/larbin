/**
 * L'interface du Larbin. Le moteur de `src/engine/` est seul juge : cette
 * couche ne fait que montrer un état et lui envoyer des actions.
 *
 * Pour l'instant les adversaires sont des bots dans le même onglet. Le jour du
 * multijoueur, `etat` viendra du serveur et `envoyer()` partira sur le réseau ;
 * tout le reste de ce fichier ne bougera pas.
 */
import type { Action, Card, GameState, Rank, Role } from '../engine/types.ts';
import {
  apply, createGame, joueursEnAttente, viewFor, type PlayerView,
} from '../engine/game.ts';
import { botAction } from '../engine/bot.ts';
import { rankLabel, sortHand } from '../engine/cards.ts';

const MOI = 'moi';
const ADVERSAIRES = [
  { id: 'gina', name: 'Gina' },
  { id: 'hugo', name: 'Hugo' },
  { id: 'lila', name: 'Lila' },
];

/** Temps de réflexion des bots : sans ça, la table va trop vite pour être suivie. */
const REFLEXION = 750;
const REFLEXION_ECHANGE = 450;

let etat: GameState = nouvellePartie();
let selection: string[] = [];
let annonce = '';
let mancheAnnoncee = 0;
let minuteur: number | undefined;

const $ = (id: string) => document.getElementById(id)!;

function nouvellePartie(): GameState {
  return createGame([
    { id: MOI, name: 'Vous' },
    ...ADVERSAIRES.map((a) => ({ ...a, isBot: true })),
  ]);
}

/* ---------------------------------------------------------------- rendu */

const EST_ROUGE = (c: Card) => c.suit === '♥' || c.suit === '♦';

function carteHTML(c: Card, classes = ''): string {
  const teinte = EST_ROUGE(c) ? 'rouge' : '';
  return `<button class="carte ${teinte} ${classes}" data-id="${c.id}" type="button">`
    + `<span class="coin">${rankLabel(c.rank)}<i>${c.suit}</i></span>`
    + `<span class="centre">${c.suit}</span></button>`;
}

/**
 * Le moteur écrit ses lignes à la troisième personne (« Hugo pose 7♠ »). Quand
 * le joueur c'est vous, il faut conjuguer : « Vous posez 7♠ ».
 */
const VERBES: Record<string, string> = {
  donne: 'donnez',
  rend: 'rendez',
  pose: 'posez',
  passe: 'passez',
  ouvre: 'ouvrez',
  termine: 'terminez',
};

function franciser(ligne: string): string {
  return ligne
    .replace(/ à Vous\b/g, ' à vous')
    // « Hugo rend 3♦ à vous » se dit « Hugo vous rend 3♦ ».
    .replace(/^(.+?) (donne|rend) (.+) à vous\.$/, '$1 vous $2 $3.')
    .replace(/^Vous a fini\b/, 'Vous avez fini')
    .replace(
      /^Vous( \([^)]+\))? (donne|rend|pose|passe|ouvre|termine)\b/,
      (_, role: string | undefined, verbe: string) => `Vous${role ?? ''} ${VERBES[verbe]}`,
    );
}

function rendreAdversaires(vue: PlayerView): void {
  $('adversaires').innerHTML = vue.others.map((o) => {
    const actif = vue.turnPlayer === o.id && vue.phase === 'jeu';
    const dos = Math.min(3, o.count);
    const etatTexte = o.count === 0
      ? `sorti ${o.finishedAt! + 1}${o.finishedAt === 0 ? 'er' : 'e'}`
      : o.passed ? 'a passé' : '';
    return `<div class="joueur ${actif ? 'actif' : ''} ${o.count === 0 ? 'sorti' : ''}">
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

/** Signature du coup affiché sur le tapis, pour ne pas rejouer l'animation à chaque redessin. */
let poseAffichee = '';

function rendreTapis(vue: PlayerView): void {
  const dernier = vue.pile[vue.pile.length - 1];
  const signature = dernier ? `${dernier.player}:${dernier.cards.map((c) => c.id).join(',')}` : '';
  if (signature !== poseAffichee) {
    poseAffichee = signature;
    $('pose').innerHTML = dernier ? sortHand(dernier.cards).map((c) => carteHTML(c)).join('') : '';
  }

  const exigence = $('exigence');
  if (vue.requirement) {
    const { count, rank } = vue.requirement;
    const quoi = count === 1 ? 'une carte' : `${count} cartes`;
    exigence.textContent = `Il faut ${quoi} au-dessus du ${rankLabel(rank)}`;
    exigence.classList.remove('vide');
  } else {
    exigence.textContent = 'Tapis libre — posez ce que vous voulez';
    exigence.classList.add('vide');
  }

  $('annonce').textContent = franciser(annonce);
}

function rendreMaMain(vue: PlayerView): void {
  const rangs = rangsJouables(vue);
  const monTour = vue.turnPlayer === MOI && vue.phase === 'jeu';

  $('ma-main').innerHTML = sortHand(vue.me.hand).map((c) => {
    const jouable = rangs.has(c.rank);
    const classes = [
      selection.includes(c.id) ? 'choisie' : '',
      monTour && jouable ? 'jouable' : '',
      monTour && !jouable ? 'morte' : '',
    ].join(' ');
    return carteHTML(c, classes);
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

/** Les cartes doivent tenir dans la largeur : on les fait se chevaucher juste ce qu'il faut. */
function ajusterChevauchement(n: number): void {
  const zone = $('ma-main');
  const carte = zone.querySelector('.carte') as HTMLElement | null;
  if (!carte || n < 2) {
    zone.style.setProperty('--chevauchement', '0px');
    return;
  }
  const largeur = carte.offsetWidth;
  const dispo = zone.clientWidth - 12;
  const debord = n * largeur - dispo;
  zone.style.setProperty('--chevauchement', debord > 0 ? `${debord / (n - 1) + 0.5}px` : '0px');
}

function rendre(): void {
  const vue = viewFor(etat, MOI);
  rendreAdversaires(vue);
  rendreTapis(vue);
  rendreMaMain(vue);
}

/* ------------------------------------------------------------- décisions */

/**
 * Les hauteurs qui mènent à un coup possible. On raisonne en hauteurs, pas en
 * cartes : le moteur ne regarde que la hauteur et le nombre, donc avec trois 2
 * en main, les trois sont bons pour en poser deux — à vous de choisir lesquels.
 */
function rangsJouables(vue: PlayerView): Set<Rank> {
  return new Set(vue.legal.map((play) => play[0].rank));
}

/** Combien de cartes la sélection peut compter au maximum. */
function tailleMax(vue: PlayerView, rank: Rank): number {
  if (vue.requirement) return vue.requirement.count;
  return vue.me.hand.filter((c) => c.rank === rank).length;
}

/** La sélection forme-t-elle un coup jouable ? Si oui, les cartes à envoyer. */
function coupChoisi(vue: PlayerView): Card[] | null {
  if (selection.length === 0 || vue.turnPlayer !== MOI || vue.phase !== 'jeu') return null;

  const cartes = selection
    .map((id) => vue.me.hand.find((c) => c.id === id))
    .filter((c): c is Card => Boolean(c));
  if (cartes.length !== selection.length) return null;

  const rank = cartes[0].rank;
  if (cartes.some((c) => c.rank !== rank)) return null;

  const possible = vue.legal.some((play) => play[0].rank === rank && play.length === cartes.length);
  return possible ? cartes : null;
}

function choisirCarte(id: string): void {
  const vue = viewFor(etat, MOI);
  if (vue.phase !== 'jeu' || vue.turnPlayer !== MOI) return;

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
  const courante = memeHauteur ? selection : [];

  // Au-delà du nombre exigé, la plus ancienne carte choisie laisse sa place.
  const max = tailleMax(vue, carte.rank);
  selection = [...courante, id].slice(-max);
  rendre();
}

function envoyer(action: Action): void {
  etat = apply(etat, action);
  selection = [];
  annonce = etat.log[etat.log.length - 1] ?? '';
  rendre();
  boucle();
}

/* ---------------------------------------------------------- la boucle */

function planifier(delai: number, suite: () => void): void {
  clearTimeout(minuteur);
  minuteur = setTimeout(suite, delai) as unknown as number;
}

/** Fait avancer la partie : chaque appel traite le prochain acteur non humain. */
function boucle(): void {
  clearTimeout(minuteur);

  if (etat.phase === 'fin-de-manche') {
    voileFinDeManche();
    return;
  }

  if (etat.phase === 'echange') {
    const attente = joueursEnAttente(etat);
    if (attente.includes(MOI)) {
      voileEchange();
      return;
    }
    const bot = attente[0];
    planifier(REFLEXION_ECHANGE, () => {
      const action = botAction(viewFor(etat, bot));
      if (action) envoyer(action);
    });
    return;
  }

  // Phase de jeu.
  if (etat.round > mancheAnnoncee && etat.round > 1) {
    voileDebutDeManche();
    return;
  }

  const acteur = etat.order[etat.turn];
  if (acteur !== MOI) {
    planifier(REFLEXION, () => {
      const action = botAction(viewFor(etat, acteur));
      if (action) envoyer(action);
    });
    return;
  }

  // À nous : si aucun coup n'est possible, la règle impose de passer.
  const vue = viewFor(etat, MOI);
  if (vue.legal.length === 0 && vue.canPass) {
    annonce = 'Vous ne pouvez pas monter.';
    rendre();
    planifier(1100, () => envoyer({ type: 'passer', player: MOI }));
  }
}

/* ------------------------------------------------------------- les voiles */

const TITRES: Record<Role, string> = {
  boss: 'Boss',
  'sous-boss': 'Sous-Boss',
  neutre: 'Neutre',
  'sur-larbin': 'Sur-Larbin',
  larbin: 'Larbin',
};

function montrerVoile(html: string): void {
  $('voile').innerHTML = `<div class="panneau">${html}</div>`;
  $('voile').hidden = false;
}

function cacherVoile(): void {
  $('voile').hidden = true;
  $('voile').innerHTML = '';
}

/**
 * Le tribut est imposé dans les deux sens : on rend ses cartes les plus basses.
 * Ce panneau ne s'ouvre donc que lorsqu'il reste une couleur à départager —
 * sinon le moteur a déjà tout réglé et la manche démarre directement.
 */
function voileEchange(): void {
  const vue = viewFor(etat, MOI);
  const { sens, avec, count, recues, choix: impose } = vue.echange!;
  const { forcees, candidats, aChoisir } = impose;
  const autre = vue.others.find((o) => o.id === avec)!;
  const seule = count === 1;
  const hauteur = rankLabel(candidats[0].rank);

  // « Vous avez 2 6 » se lit mal : les petits nombres s'écrivent en toutes lettres.
  const enLettres = ['zéro', 'une', 'deux', 'trois', 'quatre'];
  const consigne = aChoisir === 1
    ? `Vous avez ${enLettres[candidats.length]} ${hauteur} : choisissez la couleur.`
    : `Vous avez ${enLettres[candidats.length]} ${hauteur} : choisissez-en ${enLettres[aChoisir]}.`;

  const titre = sens === 'donner'
    ? `Le tribut du ${TITRES[vue.me.role!]}`
    : 'Ce que vous rendez';

  const explication = sens === 'donner'
    ? `Vous cédez à ${autre.name} ${seule ? 'votre meilleure carte' : `vos ${enLettres[count]} meilleures cartes`}
       — la règle l'impose, seule la couleur vous appartient.`
    : `${autre.name} vous a cédé ${seule ? 'sa meilleure carte' : 'ses deux meilleures cartes'}.
       En retour vous lui rendez ${seule ? 'votre plus basse' : `vos ${enLettres[count]} plus basses`}
       — là encore, seule la couleur vous appartient.`;

  const recuesHTML = sens === 'rendre'
    ? `<p class="mention">Vous recevez :</p>
       <div class="cartes-recues">${sortHand(recues).map((c) => carteHTML(c)).join('')}</div>`
    : '';

  montrerVoile(`
    <h2>${titre}</h2>
    <p>${explication}</p>
    ${recuesHTML}
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
    if (tranche.includes(id)) tranche = tranche.filter((x) => x !== id);
    else tranche = [...tranche, id].slice(-aChoisir);

    $('choix-rendu').querySelectorAll('.carte').forEach((el) => {
      el.classList.toggle('choisie', tranche.includes((el as HTMLElement).dataset.id!));
    });
    bouton.disabled = tranche.length !== aChoisir;
  });

  bouton.addEventListener('click', () => {
    cacherVoile();
    envoyer({
      type: 'echanger', player: MOI, cards: [...forcees.map((c) => c.id), ...tranche],
    });
  });
}

function voileDebutDeManche(): void {
  mancheAnnoncee = etat.round;
  const debut = etat.log.lastIndexOf(`--- Manche ${etat.round} ---`);
  const mouvements = etat.log.slice(debut + 1).filter((l) => / donne | rend /.test(l));

  if (mouvements.length === 0) {
    boucle();
    return;
  }

  const boss = etat.players.find((p) => p.role === 'boss')!;
  montrerVoile(`
    <h2>Manche ${etat.round}</h2>
    <p>${mouvements.map((m) => '• ' + franciser(m)).join('<br>')}</p>
    <p>${boss.id === MOI ? 'Vous ouvrez' : `${boss.name} ouvre`} la manche.</p>
    <button class="action primaire" id="commencer" type="button">Jouer</button>
  `);
  $('commencer').addEventListener('click', () => {
    cacherVoile();
    boucle();
  });
}

function voileFinDeManche(): void {
  const lignes = etat.finishOrder.map((id, i) => {
    const p = etat.players.find((x) => x.id === id)!;
    const nom = id === MOI ? 'Vous' : p.name;
    const deux = p.finishedOnTwo ? '<span class="sur-un-deux">fini sur un 2</span>' : '';
    return `<li>
      <span class="place">${i + 1}${i === 0 ? 'er' : 'e'}</span>
      <span>${nom} ${deux}</span>
      <span class="role ${p.role}">${TITRES[p.role!]}</span>
    </li>`;
  }).join('');

  const moi = etat.players.find((p) => p.id === MOI)!;
  const verdict = moi.role === 'boss' ? 'Vous êtes le Boss.'
    : moi.role === 'larbin' ? 'Vous voilà Larbin. La prochaine manche va piquer.'
    : `Vous finissez ${TITRES[moi.role!]}.`;

  montrerVoile(`
    <h2>Fin de la manche ${etat.round}</h2>
    <p>${verdict}</p>
    <ul class="classement">${lignes}</ul>
    <button class="action primaire" id="suivante" type="button">Manche suivante</button>
  `);
  $('suivante').addEventListener('click', () => {
    cacherVoile();
    annonce = '';
    envoyer({ type: 'manche-suivante' });
  });
}

/* ------------------------------------------------------------- démarrage */

$('ma-main').addEventListener('click', (e) => {
  const cible = (e.target as HTMLElement).closest('.carte') as HTMLElement | null;
  if (cible) choisirCarte(cible.dataset.id!);
});

$('poser').addEventListener('click', () => {
  const coup = coupChoisi(viewFor(etat, MOI));
  if (coup) envoyer({ type: 'poser', player: MOI, cards: coup.map((c) => c.id) });
});

$('passer').addEventListener('click', () => {
  if (viewFor(etat, MOI).canPass) envoyer({ type: 'passer', player: MOI });
});

window.addEventListener('resize', () => ajusterChevauchement(
  etat.players.find((p) => p.id === MOI)!.hand.length,
));

rendre();
boucle();

