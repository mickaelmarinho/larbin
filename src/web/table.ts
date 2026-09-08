/**
 * Une table, c'est ce qui répond à deux questions : « que vois-je ? » et
 * « comment j'agis ? ».
 *
 * Deux implémentations : en solo le moteur tourne dans l'onglet, en ligne il
 * tourne sur le serveur. L'interface ne fait pas la différence — elle affiche
 * une PlayerView et envoie des actions, dans les deux cas.
 */
import type { Action, GameState } from '../engine/types.ts';
import { apply, createGame, joueursEnAttente, viewFor, type PlayerView } from '../engine/game.ts';
import { botAction } from '../engine/bot.ts';
import type { EtatSalon, VersClient, VersServeur } from '../reseau/protocole.ts';

export type Mode = 'solo' | 'en-ligne';

export interface Table {
  readonly mode: Mode;
  /** Mon identifiant de joueur. */
  readonly moi: string;
  /** Ce que je vois, ou null tant qu'aucune partie n'est en cours. */
  vue(): PlayerView | null;
  envoyer(action: Action): void;
  abonner(surChangement: () => void): void;
}

/* ------------------------------------------------------------------ solo */

const REFLEXION = 750;
const REFLEXION_ECHANGE = 450;
const CLE_SAUVEGARDE = 'larbin.partie.v1';

const ADVERSAIRES = [
  { id: 'gina', name: 'Gina' },
  { id: 'hugo', name: 'Hugo' },
  { id: 'lila', name: 'Lila' },
];

export class TableSolo implements Table {
  readonly mode = 'solo';
  readonly moi = 'moi';

  private etat: GameState;
  private minuteur: ReturnType<typeof setTimeout> | undefined;
  private ecouteurs: Array<() => void> = [];

  constructor() {
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
    this.etat = apply(this.etat, action);
    this.sauver();
    this.prevenir();
    this.avancer();
  }

  recommencer(): void {
    clearTimeout(this.minuteur);
    this.etat = this.neuve();
    this.sauver();
    this.prevenir();
    this.avancer();
  }

  /** Y a-t-il une partie entamée qu'on effacerait en recommençant ? */
  get entamee(): boolean {
    return this.etat.round > 1 || this.etat.players.some((p) => p.points > 0);
  }

  private neuve(): GameState {
    return createGame([
      { id: this.moi, name: 'Vous' },
      ...ADVERSAIRES.map((a) => ({ ...a, isBot: true })),
    ]);
  }

  private prevenir(): void {
    for (const cb of this.ecouteurs) cb();
  }

  /** Fait jouer les bots, l'un après l'autre, à rythme humain. */
  private avancer(): void {
    clearTimeout(this.minuteur);
    const e = this.etat;
    if (e.phase === 'fin-de-manche' || e.phase === 'fin-de-partie') return;

    const acteur = e.phase === 'echange'
      ? joueursEnAttente(e).find((id) => id !== this.moi)
      : e.order[e.turn];
    if (!acteur || acteur === this.moi) return;

    const delai = e.phase === 'echange' ? REFLEXION_ECHANGE : REFLEXION;
    this.minuteur = setTimeout(() => {
      const coup = botAction(viewFor(this.etat, acteur));
      if (coup) this.envoyer(coup);
    }, delai);
  }

  private sauver(): void {
    try {
      localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify(this.etat));
    } catch {
      // Navigation privée ou stockage plein : la partie continue quand même.
    }
  }

  /** Relit la partie en cours, en refusant tout ce qui n'a pas la forme attendue. */
  private relire(): GameState | null {
    try {
      const brut = localStorage.getItem(CLE_SAUVEGARDE);
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

/* -------------------------------------------------------------- en ligne */

const CLE_JETON = 'larbin.jeton.';

/**
 * Le serveur de parties, quand la page est servie ailleurs.
 *
 * La page peut vivre sur un hébergement statique — instantané, jamais endormi —
 * pendant que l'arbitre des parties tourne ici. C'est ce qui permet d'afficher
 * le jeu tout de suite et de réveiller le serveur en coulisse.
 */
export const HOTE_JEU = 'larbin.onrender.com';

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

export class TableEnLigne implements Table {
  readonly mode = 'en-ligne';
  moi = '';

  private ws: WebSocket | null = null;
  private derniereVue: PlayerView | null = null;
  private etatSalon: EtatSalon | null = null;
  private message: string | null = null;
  private ecouteurs: Array<() => void> = [];
  private ferme = false;
  private code: string;
  private depuis = Date.now();
  private battement: ReturnType<typeof setInterval> | undefined;

  constructor(private nom: string, code: string) {
    this.code = code.toUpperCase();
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
      this.dire({
        type: 'rejoindre',
        salon: this.code,
        nom: this.nom,
        jeton: localStorage.getItem(CLE_JETON + this.code) ?? undefined,
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
          break;
        case 'vue':
          this.derniereVue = recu.vue;
          break;
        case 'erreur':
          this.message = recu.message;
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
