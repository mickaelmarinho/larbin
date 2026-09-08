/**
 * Un salon : une table, ses places, et la partie qui s'y joue.
 *
 * Toute la logique de salon vit ici, sans rien connaître des WebSockets — elle
 * est donc testable comme le reste du moteur. Le serveur ne fait que brancher
 * des tuyaux dessus.
 */
import type { Action, GameState } from '../engine/types.ts';
import {
  MAX_JOUEURS, MIN_JOUEURS, RegleViolee, apply, createGame, joueursEnAttente, viewFor,
  type PlayerView,
} from '../engine/game.ts';
import { botAction } from '../engine/bot.ts';
import { codeDeSalon, type EtatSalon, type Siege } from './protocole.ts';

const NOMS_DE_BOTS = ['Gina', 'Hugo', 'Lila', 'Naïm', 'Zoé'];

export interface Place {
  id: string;
  nom: string;
  /** Secret de reconnexion, connu du seul navigateur concerné. */
  jeton: string;
  estBot: boolean;
  connecte: boolean;
}

export class Salon {
  readonly code: string;
  places: Place[] = [];
  hote: string | null = null;
  etat: GameState | null = null;
  derniereActivite = Date.now();

  constructor(code = codeDeSalon()) {
    this.code = code;
  }

  /* ------------------------------------------------------------ lecture */

  get commencee(): boolean {
    return this.etat !== null;
  }

  place(id: string): Place | undefined {
    return this.places.find((p) => p.id === id);
  }

  parJeton(jeton: string): Place | undefined {
    return this.places.find((p) => p.jeton === jeton);
  }

  etatPublic(): EtatSalon {
    const sieges: Siege[] = this.places.map((p) => ({
      id: p.id,
      nom: p.nom,
      estBot: p.estBot,
      connecte: p.connecte,
      hote: p.id === this.hote,
    }));
    return {
      code: this.code,
      sieges,
      commencee: this.commencee,
      minJoueurs: MIN_JOUEURS,
      maxJoueurs: MAX_JOUEURS,
    };
  }

  /**
   * La vue du moteur, annotée de qui est encore au bout du fil. Le moteur ignore
   * tout des connexions ; c'est le salon qui sait, et les autres joueurs ont le
   * droit de savoir pourquoi la table attend.
   */
  vuePour(id: string): PlayerView | null {
    if (!this.etat) return null;
    const vue = viewFor(this.etat, id);
    for (const autre of vue.others) {
      autre.connecte = this.place(autre.id)?.connecte ?? true;
    }
    return vue;
  }

  /* ------------------------------------------------------------ places */

  /** Ajoute un joueur humain. Renvoie sa place, ou une erreur si la table est pleine. */
  asseoir(nom: string, jeton: string): Place {
    if (this.commencee) throw new RegleViolee('La partie a déjà commencé.');
    if (this.places.length >= MAX_JOUEURS) throw new RegleViolee('La table est complète.');

    const place: Place = {
      id: `j${this.places.length + 1}-${jeton.slice(0, 4)}`,
      nom: nomLibre(nom.trim() || 'Joueur', this.places),
      jeton,
      estBot: false,
      connecte: true,
    };
    this.places.push(place);
    if (!this.hote) this.hote = place.id;
    this.derniereActivite = Date.now();
    return place;
  }

  ajouterBot(): Place {
    if (this.commencee) throw new RegleViolee('La partie a déjà commencé.');
    if (this.places.length >= MAX_JOUEURS) throw new RegleViolee('La table est complète.');

    const nom = NOMS_DE_BOTS.find((n) => !this.places.some((p) => p.nom === n)) ?? 'Robot';
    const place: Place = {
      id: `bot${this.places.length + 1}`,
      nom,
      jeton: '',
      estBot: true,
      connecte: true,
    };
    this.places.push(place);
    this.derniereActivite = Date.now();
    return place;
  }

  retirer(id: string): void {
    if (this.commencee) throw new RegleViolee('La partie a déjà commencé.');
    this.places = this.places.filter((p) => p.id !== id);
    if (this.hote === id) this.hote = this.places.find((p) => !p.estBot)?.id ?? null;
    this.derniereActivite = Date.now();
  }

  /* ------------------------------------------------------------ partie */

  demarrer(): void {
    if (this.commencee) throw new RegleViolee('La partie a déjà commencé.');
    if (this.places.length < MIN_JOUEURS) {
      throw new RegleViolee(`Il faut au moins ${MIN_JOUEURS} joueurs — ajoutez des bots.`);
    }
    this.etat = createGame(
      this.places.map((p) => ({ id: p.id, name: p.nom, isBot: p.estBot })),
    );
    this.derniereActivite = Date.now();
  }

  /** Applique une action au nom d'un joueur, après avoir vérifié que c'est bien lui. */
  jouer(id: string, action: Action): void {
    if (!this.etat) throw new RegleViolee("La partie n'a pas commencé.");
    if ('player' in action && action.player !== id) {
      throw new RegleViolee("On ne joue pas à la place d'un autre.");
    }
    // Remettre les scores à zéro engage toute la table : c'est à l'hôte.
    if (action.type === 'nouvelle-partie' && this.hote !== id) {
      throw new RegleViolee("Seul l'hôte relance une partie.");
    }
    this.etat = apply(this.etat, action);
    this.derniereActivite = Date.now();
  }

  /**
   * Qui doit agir maintenant, s'il s'agit d'un bot ou d'un joueur déconnecté
   * depuis trop longtemps. Renvoie null quand la table attend un humain présent.
   */
  acteurAutomatique(): string | null {
    const e = this.etat;
    if (!e || e.phase === 'fin-de-manche' || e.phase === 'fin-de-partie') return null;

    const attendus = e.phase === 'echange' ? joueursEnAttente(e) : [e.order[e.turn]];
    for (const id of attendus) {
      const place = this.place(id);
      if (place && (place.estBot || !place.connecte)) return id;
    }
    return null;
  }

  /** Le coup que jouerait un bot à la place de ce joueur. */
  coupAutomatique(id: string): Action | null {
    return this.etat ? botAction(viewFor(this.etat, id)) : null;
  }
}

/** Deux « Marc » à la même table prêtent à confusion : on numérote. */
function nomLibre(souhaite: string, places: Place[]): string {
  const pris = new Set(places.map((p) => p.nom));
  if (!pris.has(souhaite)) return souhaite;
  for (let i = 2; i < 20; i++) {
    if (!pris.has(`${souhaite} ${i}`)) return `${souhaite} ${i}`;
  }
  return souhaite;
}
