/**
 * Une table, c'est ce qui répond à deux questions : « que vois-je ? » et
 * « comment j'agis ? ».
 *
 * Deux implémentations : en solo le moteur tourne dans l'onglet, en ligne il
 * tourne sur le serveur. L'interface ne fait pas la différence — elle affiche
 * une PlayerView et envoie des actions, dans les deux cas.
 */
import type { Action, GameState } from '../engine/types.ts';
import { apply, createGame, viewFor, type PlayerView } from '../engine/game.ts';
import { botAction } from '../engine/bot.ts';
import {
  estReaction, type EtatSalon, type Reaction, type VersClient, type VersServeur,
} from '../reseau/protocole.ts';
import { reactionDesBots } from './humeurs.ts';
import { avatarChoisi } from './avatars.ts';
import { jetonDeSession } from './session.ts';
import { TABLEE_SOLO } from './solo.ts';
import {
  bilanDuJour, bilanVierge, garderBilan, hasardDuDefi, lireBilan, noterLaManche, partieDuDefi, type BilanDuDefi,
} from './defi.ts';
import { jourDeParis } from './jour.ts';
import type { Role } from '../engine/types.ts';

/** Les réactions encore à l'écran, par joueur, avec l'instant où elles sont arrivées. */
export type Bulles = Map<string, { reaction: Reaction; recueA: number }>;

export type Mode = 'solo' | 'en-ligne' | 'didacticiel';

export interface Table {
  readonly mode: Mode;
  /** Mon identifiant de joueur. */
  readonly moi: string;
  /** Ce que je vois, ou null tant qu'aucune partie n'est en cours. */
  vue(): PlayerView | null;
  envoyer(action: Action): void;
  abonner(surChangement: () => void): void;
  /** Les réactions à afficher en bulle, pour les tables qui en ont. */
  reactions?(): Bulles;
  /** On part vers l'accueil : la table cesse de s'agiter pour rien. */
  quitter?(): void;
}

/* ------------------------------------------------------------------ solo */

const REFLEXION = 750;
const CLE_SAUVEGARDE = 'larbin.partie.v1';


/**
 * Ce qui distingue une partie solo d'une autre : où elle se garde, comment
 * elle commence, et d'où vient le hasard des bots. La partie libre prend un
 * mélange neuf ; le défi du jour, toujours le même.
 */
export interface ReglagesSolo {
  cle: string;
  creer(): GameState;
  hasard?(etat: GameState): () => number;
}

const PARTIE_LIBRE: ReglagesSolo = {
  cle: CLE_SAUVEGARDE,
  creer: () => createGame(TABLEE_SOLO),
};

export class TableSolo implements Table {
  readonly mode = 'solo';
  readonly moi = 'moi';

  private etat: GameState;
  private minuteur: ReturnType<typeof setTimeout> | undefined;
  private ecouteurs: Array<() => void> = [];
  /** Un panneau est ouvert : les bots attendent qu'on ait fini de lire. */
  private suspendu = false;
  /** Ce que les bots ont exprimé, le temps que ça reste à l'écran. */
  private bulles: Bulles = new Map();
  protected reglages: ReglagesSolo;

  constructor(reglages: ReglagesSolo = PARTIE_LIBRE) {
    this.reglages = reglages;
    this.etat = this.relire() ?? this.neuve();
  }

  vue(): PlayerView {
    return viewFor(this.etat, this.moi);
  }

  abonner(surChangement: () => void): void {
    this.ecouteurs.push(surChangement);
    this.avancer();
  }

  envoyer(action: Action): void {
    const avant = this.vue();
    this.etat = apply(this.etat, action);
    this.sauver();
    this.humeur(avant);
    this.prevenir();
    this.avancer();
  }

  recommencer(): void {
    clearTimeout(this.minuteur);
    this.etat = this.neuve();
    this.bulles.clear();
    this.sauver();
    this.prevenir();
    this.avancer();
  }

  /**
   * Met les bots en pause pendant qu'un panneau est ouvert. En ligne on ne peut
   * pas arrêter la table des autres ; en solo, si.
   */
  suspendre(oui: boolean): void {
    this.suspendu = oui;
    if (oui) clearTimeout(this.minuteur);
    else this.avancer();
  }

  reactions(): Bulles {
    const maintenant = Date.now();
    for (const [id, r] of this.bulles) {
      if (maintenant - r.recueA >= DUREE_REACTION) this.bulles.delete(id);
    }
    return this.bulles;
  }

  /**
   * Un bot réagit parfois à ce qui vient de se passer. Un instant après, comme
   * on le ferait — et jamais une fois la manche close, quand le panneau cache
   * la table.
   */
  private humeur(avant: PlayerView): void {
    const r = reactionDesBots(avant, this.vue());
    if (!r) return;
    setTimeout(() => {
      if (this.etat.phase !== 'jeu' || this.suspendu) return;
      this.bulles.set(r.de, { reaction: r.reaction, recueA: Date.now() });
      this.prevenir();
    }, 350);
  }

  /**
   * On quitte la table pour l'accueil : les bots s'arrêtent. Une partie finie
   * n'est pas reprise au retour ; une partie en cours, si.
   */
  quitter(): void {
    clearTimeout(this.minuteur);
    this.ecouteurs = [];
    if (this.etat.phase !== 'fin-de-partie') return;
    try {
      localStorage.removeItem(this.reglages.cle);
    } catch { /* elle sera simplement reprise, avec son panneau de fin */ }
  }

  /** Y a-t-il une partie entamée qu'on effacerait en recommençant ? */
  get entamee(): boolean {
    return this.etat.round > 1 || this.etat.players.some((p) => p.points > 0);
  }

  private neuve(): GameState {
    return this.reglages.creer();
  }

  private prevenir(): void {
    for (const cb of this.ecouteurs) cb();
  }

  /** Fait jouer les bots, l'un après l'autre, à rythme humain. */
  private avancer(): void {
    clearTimeout(this.minuteur);
    if (this.suspendu) return;
    const e = this.etat;
    if (e.phase === 'fin-de-manche' || e.phase === 'fin-de-partie') return;

    const acteur = e.order[e.turn];
    if (acteur === this.moi) return;

    this.minuteur = setTimeout(() => {
      const coup = botAction(viewFor(this.etat, acteur), this.reglages.hasard?.(this.etat));
      if (coup) this.envoyer(coup);
    }, REFLEXION);
  }

  private sauver(): void {
    try {
      localStorage.setItem(this.reglages.cle, JSON.stringify(this.etat));
    } catch {
      // Navigation privée ou stockage plein : la partie continue quand même.
    }
  }

  /** Relit la partie en cours, en refusant tout ce qui n'a pas la forme attendue. */
  private relire(): GameState | null {
    try {
      const brut = localStorage.getItem(this.reglages.cle);
      if (!brut) return null;
      const s = JSON.parse(brut) as GameState;
      const valide = Array.isArray(s.players)
        && s.players.length >= 4
        && s.players.every((p) => Array.isArray(p.hand) && typeof p.points === 'number')
        && Array.isArray(s.order)
        && typeof s.round === 'number'
        && typeof s.objectif === 'number';
      return valide ? s : null;
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------- le défi du jour */

const CLE_PARTIE_DEFI = 'larbin.defi.partie';

/** Un nouveau jour efface la partie d'hier : on ne reprend jamais un défi périmé. */
function reglagesDuDefi(jour: string): ReglagesSolo {
  if (lireBilan()?.jour !== jour) {
    try {
      localStorage.removeItem(CLE_PARTIE_DEFI);
    } catch { /* rien à effacer */ }
    garderBilan(bilanVierge(jour));
  }
  return { cle: CLE_PARTIE_DEFI, creer: () => partieDuDefi(jour), hasard: hasardDuDefi };
}

/** Une partie solo dont la donne et le hasard sont ceux du jour, pour tout le monde (voir defi.ts). */
export class TableDefi extends TableSolo {
  readonly jour: string;

  constructor(jour = jourDeParis()) {
    super(reglagesDuDefi(jour));
    this.jour = jour;
  }

  /** Un seul essai par jour. */
  override recommencer(): void {}

  /** Note la manche ; renvoie le bilan, et s'il vient tout juste de s'achever. */
  noterManche(manche: number, role: Role, points: number): { bilan: BilanDuDefi; acheve: boolean } {
    const avant = bilanDuJour(this.jour);
    const bilan = noterLaManche(avant, manche, role, points);
    if (bilan !== avant) garderBilan(bilan);
    return { bilan, acheve: bilan.fini && !avant.fini };
  }
}

/* -------------------------------------------------------------- en ligne */

const CLE_JETON = 'larbin.jeton.';

/**
 * Le serveur de parties, quand la page est servie ailleurs.
 *
 * La page peut vivre sur un hébergement statique — instantané, jamais endormi —
 * pendant que l'arbitre des parties tourne ici. C'est ce qui permet d'afficher
 * le jeu tout de suite et de réveiller le serveur en coulisse.
 */
export const HOTE_JEU = 'p01--larbin--xp64cmfbzy56.code.run';

/**
 * L'adresse à donner aux joueurs : la page statique, qui s'ouvre tout de suite.
 * Le serveur de parties, lui, se réveille en coulisse.
 */
export const ADRESSE_PUBLIQUE = 'larbin.vercel.app';

let hoteTrouve: Promise<string> | null = null;

/**
 * Où joindre le serveur de parties. Si la page est servie par le serveur
 * lui-même — en local, ou en ouvrant son adresse en direct — on reste sur
 * place. Sinon on va le chercher, et on le réveille au passage.
 */
export function hoteDuJeu(): Promise<string> {
  hoteTrouve ??= (async () => {
    try {
      const chezNous = await fetch('/sante', { cache: 'no-store' });
      // On vérifie la réponse, pas seulement le code : un hébergeur statique
      // qui renvoie la page d'accueil à toutes les adresses répondrait « 200 ».
      const info = chezNous.ok ? await chezNous.json().catch(() => null) : null;
      if (info?.ok === true) return location.host;
    } catch {
      // Page ouverte depuis un fichier, ou servie par un hébergement statique.
    }
    reveiller();
    return HOTE_JEU;
  })();
  return hoteTrouve;
}

/** Un appel suffit à sortir le serveur de sa sieste ; la réponse importe peu. */
export function reveiller(): void {
  fetch(`https://${HOTE_JEU}/sante`, { cache: 'no-store' }).catch(() => {});
}

/** Une table publique vue du dehors : des comptes, jamais des noms. */
export interface ResumeTable {
  code: string;
  joueurs: number;
  bots: number;
  prets: number;
  commencee: boolean;
  manche: number;
  /** À combien se joue cette table : quatre, cinq ou six. */
  taille: number;
  /** Peut-on s'y asseoir — place libre, ou siège tenu par un bot ? */
  libre: boolean;
}

/** Les tables publiques du moment. Liste vide si le serveur dort ou se tait. */
export async function tablesPubliques(): Promise<ResumeTable[]> {
  try {
    const hote = await hoteDuJeu();
    const url = hote === location.host ? '/tables' : `https://${hote}/tables`;
    const liste = await (await fetch(url, { cache: 'no-store' })).json();
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

/** Ce que le serveur de parties dit de lui-même : y a-t-il du monde, ce soir ? */
export interface Activite {
  /** Joueurs connectés, toutes tables confondues. */
  joueurs: number;
  /** Tables publiques qui attendent encore quelqu'un. */
  publiques: number;
  /** Visiteurs assis à ces tables, en attente d'une partie. */
  enAttente: number;
}

/**
 * Demande au serveur s'il se passe quelque chose. Renvoie null s'il dort, s'il
 * ne répond pas, ou si l'on joue depuis le fichier seul : l'accueil s'affiche
 * alors comme avant, sans rien promettre.
 */
export async function activite(): Promise<Activite | null> {
  try {
    const hote = await hoteDuJeu();
    const url = hote === location.host ? '/sante' : `https://${hote}/sante`;
    const info = await (await fetch(url, { cache: 'no-store' })).json();
    if (info?.ok !== true) return null;
    return {
      joueurs: Number(info.connexions) || 0,
      publiques: Number(info.publiques) || 0,
      enAttente: Number(info.enAttente) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Code à passer à TableEnLigne pour s'asseoir à une table publique plutôt qu'à
 * un salon précis : le serveur choisit la table, ou en ouvre une.
 */
export const TABLE_PUBLIQUE = '*';

/** Combien de temps une réaction reste affichée au-dessus d'un joueur. */
export const DUREE_REACTION = 3500;

export class TableEnLigne implements Table {
  readonly mode = 'en-ligne';
  moi = '';

  private ws: WebSocket | null = null;
  private derniereVue: PlayerView | null = null;
  private etatSalon: EtatSalon | null = null;
  /** Quand l'état du salon est arrivé : le compte à rebours se mesure depuis là. */
  private etatRecuA = 0;
  private message: string | null = null;
  private ecouteurs: Array<() => void> = [];
  private ferme = false;
  private code: string;
  /** On cherche une table publique tant que le serveur ne nous en a pas donné une. */
  private readonly chercheTablePublique: boolean;
  private depuis = Date.now();
  private battement: ReturnType<typeof setInterval> | undefined;
  /** La dernière réaction de chacun, et quand elle est arrivée. */
  private reactionsRecues = new Map<string, { reaction: Reaction; recueA: number }>();
  /** Les succès que le serveur vient de vérifier, en attente d'être annoncés. */
  private succesRecus: string[] = [];

  constructor(private nom: string, code: string) {
    this.chercheTablePublique = code === TABLE_PUBLIQUE;
    this.code = this.chercheTablePublique ? '' : code.toUpperCase();
    this.brancher();
    // Tant qu'on n'est pas entré, on redonne la main à l'affichage chaque
    // seconde : c'est ce qui permet de dire au joueur que le serveur se réveille
    // plutôt que de le laisser devant un écran figé.
    this.battement = setInterval(() => {
      if (this.etatSalon) {
        clearInterval(this.battement);
        this.battement = undefined;
        return;
      }
      this.prevenir();
    }, 1000);
  }

  /** Depuis combien de secondes on attend d'entrer dans le salon. */
  attente(): number {
    return this.etatSalon ? 0 : Math.round((Date.now() - this.depuis) / 1000);
  }

  /**
   * Secondes avant que la table publique ne se lance d'elle-même, ou null. On
   * compte depuis la réception de l'état, sans se fier à l'horloge du serveur.
   */
  departDans(): number | null {
    const reste = this.etatSalon?.departDans;
    if (reste == null) return null;
    return Math.max(0, Math.ceil((reste - (Date.now() - this.etatRecuA)) / 1000));
  }

  vue(): PlayerView | null {
    return this.derniereVue;
  }

  salon(): EtatSalon | null {
    return this.etatSalon;
  }

  /** Dernier message d'erreur du serveur, à afficher puis oublier. */
  erreur(): string | null {
    return this.message;
  }

  oublierErreur(): void {
    this.message = null;
  }

  abonner(surChangement: () => void): void {
    this.ecouteurs.push(surChangement);
  }

  envoyer(action: Action): void {
    this.dire({ type: 'action', action });
  }

  ajouterBot(): void {
    this.dire({ type: 'ajouter-bot' });
  }

  retirer(id: string): void {
    this.dire({ type: 'retirer', id });
  }

  demarrer(): void {
    this.dire({ type: 'demarrer' });
  }

  /** Se dire prêt, ou se dédire : à une table publique, c'est ce qui lance le départ. */
  pret(oui: boolean): void {
    this.dire({ type: 'pret', pret: oui });
  }

  /** Proposer de jouer à quatre, cinq ou six. */
  taille(joueurs: number): void {
    this.dire({ type: 'taille', taille: joueurs });
  }

  /**
   * Secondes avant que la table ne joue à la place de celui dont c'est le tour,
   * ou null. Comme le compte à rebours du départ, on décompte depuis la
   * réception, sans se fier à l'horloge du serveur.
   */
  delaiPourJouer(): number | null {
    const reste = this.etatSalon?.delaiPourJouer;
    if (reste == null) return null;
    return Math.max(0, Math.ceil((reste - (Date.now() - this.etatRecuA)) / 1000));
  }

  /** Les succès vérifiés reçus depuis la dernière fois. */
  retirerSucces(): string[] {
    const liste = this.succesRecus;
    this.succesRecus = [];
    return liste;
  }

  /** Lancer une réaction à la table. */
  reagir(reaction: Reaction): void {
    this.dire({ type: 'reaction', reaction });
  }

  /** Les réactions encore à l'écran, par joueur. Les plus anciennes s'effacent. */
  reactions(maintenant = Date.now()): Map<string, { reaction: Reaction; recueA: number }> {
    for (const [id, r] of this.reactionsRecues) {
      if (maintenant - r.recueA >= DUREE_REACTION) this.reactionsRecues.delete(id);
    }
    return this.reactionsRecues;
  }

  quitter(): void {
    this.ferme = true;
    clearInterval(this.battement);
    this.ws?.close();
  }

  private dire(message: VersServeur): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private prevenir(): void {
    for (const cb of this.ecouteurs) cb();
  }

  private async brancher(): Promise<void> {
    const hote = await hoteDuJeu();
    if (this.ferme) return;
    // Chiffré partout, sauf quand on joue chez soi en clair sur le réseau local.
    const chiffre = location.protocol === 'https:' || hote !== location.host;
    this.ws = new WebSocket(`${chiffre ? 'wss' : 'ws'}://${hote}`);

    this.ws.addEventListener('open', () => {
      // Une fois assis, on revient toujours à la même table, publique ou non.
      if (this.chercheTablePublique && !this.moi) {
        this.dire({ type: 'rejoindre-public', nom: this.nom, avatar: avatarChoisi(), session: jetonDeSession() });
        return;
      }
      this.dire({
        type: 'rejoindre',
        salon: this.code,
        nom: this.nom,
        jeton: localStorage.getItem(CLE_JETON + this.code) ?? undefined,
        avatar: avatarChoisi(),
        session: jetonDeSession(),
      });
    });

    this.ws.addEventListener('message', (e) => {
      let recu: VersClient;
      try {
        recu = JSON.parse(String(e.data)) as VersClient;
      } catch {
        return;
      }
      switch (recu.type) {
        case 'bienvenue':
          this.moi = recu.moi;
          this.code = recu.salon;
          try {
            localStorage.setItem(CLE_JETON + recu.salon, recu.jeton);
          } catch { /* stockage indisponible : on jouera sans reconnexion */ }
          break;
        case 'salon':
          this.etatSalon = recu.etat;
          this.etatRecuA = Date.now();
          break;
        case 'vue':
          this.derniereVue = recu.vue;
          break;
        case 'erreur':
          this.message = recu.message;
          break;
        case 'reaction':
          // On ne se fie qu'à la liste connue : ce texte finit dans la page.
          if (estReaction(recu.reaction)) {
            this.reactionsRecues.set(recu.de, { reaction: recu.reaction, recueA: Date.now() });
          }
          break;
        case 'succes':
          if (Array.isArray(recu.ids)) this.succesRecus.push(...recu.ids.filter((id) => typeof id === 'string'));
          break;
      }
      this.prevenir();
    });

    // Une coupure de wifi ne doit pas coûter la partie : on repique tout seul.
    this.ws.addEventListener('close', () => {
      if (this.ferme) return;
      setTimeout(() => this.brancher(), 1500);
    });
  }

  get codeSalon(): string {
    return this.code;
  }
}
