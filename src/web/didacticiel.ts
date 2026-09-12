/**
 * Le didacticiel : apprendre en jouant, pas en lisant.
 *
 * C'est une troisième sorte de table. Elle répond aux mêmes questions que les
 * autres — « que vois-je ? », « comment j'agis ? » — si bien que tout
 * l'affichage fonctionne sans rien savoir d'elle. Seule s'ajoute une bande de
 * consigne au-dessus du tapis.
 *
 * Quatre situations, une idée chacune, avec des mains choisies pour que le
 * geste à faire soit clair. La dernière laisse délibérément le joueur tomber
 * dans le piège du 2 s'il choisit le mauvais ordre : on retient mieux une
 * erreur qu'un avertissement.
 */
import type { Action, Card, GameState, Rank } from '../engine/types.ts';
import { apply, createGame, viewFor, type PlayerView } from '../engine/game.ts';
import { botAction } from '../engine/bot.ts';
import { sortHand } from '../engine/cards.ts';
import type { Table } from './table.ts';

const MOI = 'moi';
const ORDRE = [MOI, 'gina', 'hugo', 'lila'];
const NOMS: Record<string, string> = { moi: 'Vous', gina: 'Gina', hugo: 'Hugo', lila: 'Lila' };

/** Le temps qu'un adversaire prend pour répondre : la table doit rester lisible. */
const REFLEXION = 650;

const RANG: Record<string, Rank> = {
  3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, V: 11, D: 12, R: 13, A: 14, 2: 15,
};

/** « D♠ » → la dame de pique. Même écriture que dans les épreuves du moteur. */
function carte(label: string): Card {
  const suit = label.slice(-1) as Card['suit'];
  const rank = RANG[label.slice(0, -1)];
  return { id: `${rank}${suit}`, rank, suit };
}

const idDe = (label: string) => carte(label).id;
const enMain = (vue: PlayerView, label: string) => vue.me.hand.some((c) => c.id === idDe(label));

interface Lecon {
  consigne: string;
  mains: Record<string, string[]>;
  /** Un coup déjà posé sur le tapis quand la leçon commence. */
  pose?: { joueur: string; cartes: string[] };
  /** Ceux qui ont déjà parlé dans la série : ils ne reviendront pas. */
  ontPasse?: string[];
  /** La leçon est acquise quand ceci devient vrai. */
  acquise: (vue: PlayerView) => boolean;
  /** Le joueur est tombé dans le piège : on lui proposera de refaire. */
  rate?: (vue: PlayerView) => boolean;
  morale: (rate: boolean) => string;
}

const LECONS: Lecon[] = [
  {
    consigne: 'Hugo a posé un 8. Pour rester dans la série, posez une carte plus '
      + 'forte : votre 9. Touchez-la, puis « Poser ».',
    mains: { moi: ['9♥', '4♠', 'R♦'], gina: ['3♥'], hugo: ['8♦', '3♣'], lila: ['3♠'] },
    pose: { joueur: 'hugo', cartes: ['8♦'] },
    ontPasse: ['gina', 'lila'],
    acquise: (vue) => !enMain(vue, '9♥'),
    morale: () => 'On pose toujours <b>le même nombre de cartes</b>, et d’une hauteur '
      + '<b>strictement supérieure</b>. Quand on ne peut pas — ou qu’on ne veut pas —, on passe.',
  },
  {
    consigne: 'Le tapis est libre : à vous d’ouvrir. Posez votre 7, et regardez '
      + 'ce que font les autres.',
    mains: { moi: ['7♠', 'R♦'], gina: ['9♥'], hugo: ['D♣'], lila: ['3♦'] },
    acquise: (vue) => vue.requirement === null && vue.pile.length > 0,
    morale: () => 'Le tour est fini, et votre Roi n’a servi à rien : <b>une série ne fait '
      + 'qu’un tour de table</b>. Au Président vous auriez pu repasser ; ici, chacun ne '
      + 'parle qu’une fois. Une grosse carte se sort au bon tour, ou se garde pour la suite.',
  },
  {
    consigne: 'Lila a posé un as. Une seule carte le bat : le 2. Posez-le.',
    mains: { moi: ['2♥', '6♣'], gina: ['3♥'], hugo: ['3♠'], lila: ['A♠', '3♦'] },
    pose: { joueur: 'lila', cartes: ['A♠'] },
    ontPasse: ['gina', 'hugo'],
    acquise: (vue) => !enMain(vue, '2♥'),
    morale: () => 'Le <b>2 est la carte la plus forte</b> du jeu, et il <b>coupe net</b> : '
      + 'la série s’arrête là, les autres n’ont même pas à passer. Et c’est vous qui rouvrez.',
  },
  {
    consigne: 'Deux cartes en main, un 8 et un 2, et le tapis est libre. Attention : '
      + 'finir sur un 2 rend Larbin d’office. Dans quel ordre les jouer ?',
    mains: { moi: ['2♦', '8♠'], gina: ['3♥'], hugo: ['3♠'], lila: ['3♣'] },
    acquise: (vue) => vue.me.hand.length === 0,
    rate: (vue) => vue.me.finishedOnTwo,
    morale: (rate) => (rate
      ? 'Vous sortez premier… et Larbin quand même, parce que votre dernière carte était '
        + 'un 2. Il fallait le jouer <b>d’abord</b> : il coupe la série, vous rend la main, '
        + 'et vous sortez ensuite proprement avec le 8.'
      : 'Exactement. Le 2 joué d’abord coupe la série et vous rend la main ; le 8 vous fait '
        + 'sortir proprement. Gardé pour la fin, ce même 2 vous aurait rendu Larbin.'),
  },
];

/** Plante le décor d'une leçon : les mains, le tapis, et à qui de parler. */
function monter(lecon: Lecon): GameState {
  let etat = createGame(ORDRE.map((id) => ({ id, name: NOMS[id], isBot: id !== MOI })), 1);

  for (const p of etat.players) {
    p.hand = sortHand((lecon.mains[p.id] ?? []).map(carte));
    p.role = null;
    p.aAgi = false;
    p.passed = false;
    p.finishedAt = null;
    p.finishedOnTwo = false;
    p.points = 0;
  }
  etat.phase = 'jeu';
  etat.pile = [];
  etat.requirement = null;
  etat.lastPlayer = null;
  etat.finishOrder = [];
  etat.classement = [];
  etat.mouvements = [];
  etat.passees = [];
  etat.paquet = [];
  etat.carteMontree = null;
  etat.log = [];

  // Le coup déjà sur le tapis passe par le moteur : lui seul sait tenir
  // l'exigence, la pile et le reste à jour.
  if (lecon.pose) {
    etat.turn = ORDRE.indexOf(lecon.pose.joueur);
    etat = apply(etat, {
      type: 'poser',
      player: lecon.pose.joueur,
      cards: lecon.pose.cartes.map(idDe),
    });
  }
  for (const id of lecon.ontPasse ?? []) {
    const p = etat.players.find((x) => x.id === id)!;
    p.aAgi = true;
    p.passed = true;
  }
  etat.turn = ORDRE.indexOf(MOI);
  return etat;
}

export interface Morale {
  texte: string;
  rate: boolean;
  derniere: boolean;
}

export class TableDidacticiel implements Table {
  readonly mode = 'didacticiel';
  readonly moi = MOI;

  private etat: GameState;
  private index = 0;
  /** La leçon est acquise : on attend que le joueur lise la morale. */
  private lue = false;
  private ecouteurs: Array<() => void> = [];
  private minuteur: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.etat = monter(LECONS[0]);
  }

  vue(): PlayerView {
    return viewFor(this.etat, MOI);
  }

  abonner(surChangement: () => void): void {
    this.ecouteurs.push(surChangement);
    this.prevenir();
    this.avancer();
  }

  envoyer(action: Action): void {
    if (this.lue) return;           // la leçon est finie : on lit, on ne joue plus
    this.etat = apply(this.etat, action);
    this.verifier();
  }

  /* ------------------------------------------------------------ leçons */

  consigne(): string {
    return LECONS[this.index].consigne;
  }

  numero(): string {
    return `${this.index + 1}/${LECONS.length}`;
  }

  /** Ce qu'il y a à retenir, une fois la leçon acquise. Null tant qu'on joue. */
  morale(): Morale | null {
    if (!this.lue) return null;
    const lecon = LECONS[this.index];
    const rate = lecon.rate?.(this.vue()) ?? false;
    return { texte: lecon.morale(rate), rate, derniere: this.index === LECONS.length - 1 };
  }

  suivante(): void {
    this.index = Math.min(this.index + 1, LECONS.length - 1);
    this.refaire();
  }

  refaire(): void {
    clearTimeout(this.minuteur);
    this.etat = monter(LECONS[this.index]);
    this.lue = false;
    this.prevenir();
    this.avancer();
  }

  /* ------------------------------------------------------------ moteur */

  private verifier(): void {
    if (LECONS[this.index].acquise(this.vue())) {
      clearTimeout(this.minuteur);
      this.lue = true;
      this.prevenir();
      return;
    }
    this.prevenir();
    this.avancer();
  }

  /** Fait répondre les adversaires, l'un après l'autre. */
  private avancer(): void {
    clearTimeout(this.minuteur);
    if (this.lue || this.etat.phase !== 'jeu') return;
    const acteur = this.etat.order[this.etat.turn];
    if (acteur === MOI) return;

    this.minuteur = setTimeout(() => {
      const coup = botAction(viewFor(this.etat, acteur));
      if (!coup) return;
      this.etat = apply(this.etat, coup);
      this.verifier();
    }, REFLEXION);
  }

  private prevenir(): void {
    for (const cb of this.ecouteurs) cb();
  }
}
