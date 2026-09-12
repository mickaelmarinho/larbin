/**
 * Un salon : une table, ses places, et la partie qui s'y joue.
 *
 * Toute la logique de salon vit ici, sans rien connaître des WebSockets — elle
 * est donc testable comme le reste du moteur. Le serveur ne fait que brancher
 * des tuyaux dessus.
 *
 * Deux sortes de tables. Le salon privé, ouvert par un hôte qui invite ses
 * proches et décide quand commencer. La table publique, ouverte aux inconnus :
 * pas d'hôte, et un compte à rebours au bout duquel des bots prennent les
 * places vides — personne n'y attend seul devant un écran.
 */
import type { Action, GameState } from '../engine/types.ts';
import {
  MAX_JOUEURS, MIN_JOUEURS, RegleViolee, apply, createGame, viewFor,
  type PlayerView,
} from '../engine/game.ts';
import { botAction } from '../engine/bot.ts';
import { codeDeSalon, nomPropre, type EtatSalon, type Siege } from './protocole.ts';

const NOMS_DE_BOTS = ['Gina', 'Hugo', 'Lila', 'Naïm', 'Zoé'];

export interface Place {
  id: string;
  nom: string;
  /** Secret de reconnexion, connu du seul navigateur concerné. */
  jeton: string;
  estBot: boolean;
  connecte: boolean;
  /** S'est dit prêt à jouer. Un bot ne fait jamais attendre personne. */
  pret: boolean;
}

export class Salon {
  readonly code: string;
  /** Ouverte aux inconnus : pas d'hôte, et un lancement automatique. */
  readonly publique: boolean;
  places: Place[] = [];
  hote: string | null = null;
  etat: GameState | null = null;
  derniereActivite = Date.now();
  /** Instant où la table publique se lancera d'elle-même, si c'est prévu. */
  lancement: number | null = null;
  /** À combien on joue ici. Le jeu en accepte quatre à six. */
  taille = MIN_JOUEURS;

  constructor(code = codeDeSalon(), options: { publique?: boolean } = {}) {
    this.code = code;
    this.publique = options.publique ?? false;
  }

  /* ------------------------------------------------------------ lecture */

  get commencee(): boolean {
    return this.etat !== null;
  }

  /**
   * Cette table publique peut-elle accueillir un nouveau venu ? Il faut qu'elle
   * n'ait pas commencé, qu'il y reste de la place, et que quelqu'un y soit
   * encore assis : on n'envoie personne attendre à une table désertée.
   */
  /**
   * Combien de places en tout. À une table publique, c'est la taille choisie —
   * on ne s'assoit pas à une table de quatre pour se retrouver six.
   */
  get capacite(): number {
    return this.publique ? this.taille : MAX_JOUEURS;
  }

  get accueille(): boolean {
    return this.publique
      && !this.commencee
      && this.places.length < this.capacite
      && this.places.some((p) => !p.estBot && p.connecte);
  }

  /**
   * Change le nombre de joueurs, et remet tout le monde « pas prêt » : on
   * s'était dit prêt pour une table de quatre, pas pour une table de six.
   * Sans cela, un joueur pourrait faire partir une partie que les autres
   * n'ont pas acceptée.
   */
  choisirTaille(taille: number): void {
    if (this.commencee) throw new RegleViolee('La partie a déjà commencé.');
    if (!Number.isInteger(taille) || taille < MIN_JOUEURS || taille > MAX_JOUEURS) {
      throw new RegleViolee(`Une table se joue de ${MIN_JOUEURS} à ${MAX_JOUEURS} joueurs.`);
    }
    if (taille < this.places.length) {
      throw new RegleViolee('Il y a déjà plus de monde que cela à la table.');
    }
    if (taille === this.taille) return;
    this.taille = taille;
    for (const p of this.places) if (!p.estBot) p.pret = false;
    this.derniereActivite = Date.now();
  }

  /**
   * Tout le monde s'est-il dit prêt ? C'est la seule condition du départ : les
   * bots ne comptent pas, et une table sans humain n'est jamais prête. Se
   * dédire — ou voir arriver quelqu'un qui n'a rien promis — suffit à défaire
   * cet accord.
   */
  get tousPrets(): boolean {
    const humains = this.places.filter((p) => !p.estBot);
    return humains.length > 0 && humains.every((p) => p.pret);
  }

  marquerPret(id: string, pret: boolean): void {
    if (this.commencee) throw new RegleViolee('La partie a déjà commencé.');
    const place = this.place(id);
    if (!place || place.estBot) throw new RegleViolee('Il faut être assis à la table.');
    place.pret = pret;
    this.derniereActivite = Date.now();
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
      pret: p.pret,
    }));
    return {
      code: this.code,
      sieges,
      commencee: this.commencee,
      minJoueurs: MIN_JOUEURS,
      maxJoueurs: MAX_JOUEURS,
      taille: this.taille,
      publique: this.publique,
      departDans: this.lancement !== null && !this.commencee
        ? Math.max(0, this.lancement - Date.now())
        : null,
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
    if (this.places.length >= this.capacite) throw new RegleViolee('La table est complète.');

    const place: Place = {
      id: `j${this.places.length + 1}-${jeton.slice(0, 4)}`,
      // Le nom s'affichera chez les autres : on le nettoie ici, côté serveur.
      nom: nomLibre(nomPropre(nom) || 'Joueur', this.places),
      jeton,
      estBot: false,
      connecte: true,
      pret: false,
    };
    this.places.push(place);
    // À une table publique, personne ne décide pour les autres.
    if (!this.hote && !this.publique) this.hote = place.id;
    this.derniereActivite = Date.now();
    return place;
  }

  ajouterBot(): Place {
    if (this.commencee) throw new RegleViolee('La partie a déjà commencé.');
    if (this.places.length >= this.capacite) throw new RegleViolee('La table est complète.');

    const nom = NOMS_DE_BOTS.find((n) => !this.places.some((p) => p.nom === n)) ?? 'Robot';
    // Un identifiant libre, et non le rang à la table : après un départ, ce rang
    // peut être celui d'un bot encore assis, et le moteur refuse deux joueurs
    // du même identifiant — la partie ne démarrait plus.
    let n = 1;
    while (this.places.some((p) => p.id === `bot${n}`)) n += 1;
    const place: Place = {
      id: `bot${n}`,
      nom,
      jeton: '',
      estBot: true,
      connecte: true,
      pret: true,
    };
    this.places.push(place);
    this.derniereActivite = Date.now();
    return place;
  }

  /**
   * Un nouveau venu prend la place d'un bot dans une partie déjà lancée : il
   * hérite de sa main et de ses points, et joue à la manche en cours. C'est
   * mieux que d'attendre la fin — et les tables publiques se complètent
   * justement avec des bots. Réservé à ces tables : dans un salon privé, on
   * n'entre pas dans une partie commencée sans y être invité.
   */
  reprendreUnBot(nom: string, jeton: string): Place | null {
    if (!this.publique || !this.etat) return null;
    const bot = this.places.find((p) => p.estBot);
    if (!bot) return null;

    bot.estBot = false;
    bot.jeton = jeton;
    bot.connecte = true;
    bot.pret = true;
    bot.nom = nomLibre(nomPropre(nom) || 'Joueur', this.places.filter((p) => p !== bot));

    // Le moteur garde la trace « c'est un bot » pour l'affichage : sans cette
    // correction, les autres continueraient de voir une machine à sa place.
    const joueur = this.etat.players.find((p) => p.id === bot.id);
    if (joueur) {
      joueur.isBot = false;
      joueur.name = bot.nom;
    }
    this.derniereActivite = Date.now();
    return bot;
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

  /**
   * Lance une table publique : les places manquantes vont à des bots, et la
   * partie commence. Personne n'attend plus longtemps que le compte à rebours.
   */
  completerEtDemarrer(): void {
    while (this.places.length < this.taille) this.ajouterBot();
    this.lancement = null;
    this.demarrer();
  }

  /** Applique une action au nom d'un joueur, après avoir vérifié que c'est bien lui. */
  jouer(id: string, action: Action): void {
    if (!this.etat) throw new RegleViolee("La partie n'a pas commencé.");
    if ('player' in action && action.player !== id) {
      throw new RegleViolee("On ne joue pas à la place d'un autre.");
    }
    // Remettre les scores à zéro engage toute la table : c'est à l'hôte. Une
    // table publique n'en a pas ; n'importe quel joueur assis peut relancer.
    if (action.type === 'nouvelle-partie' && !this.publique && this.hote !== id) {
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

    const place = this.place(e.order[e.turn]);
    return place && (place.estBot || !place.connecte) ? place.id : null;
  }

  /** Le coup que jouerait un bot à la place de ce joueur. */
  coupAutomatique(id: string): Action | null {
    return this.etat ? botAction(viewFor(this.etat, id)) : null;
  }
}

/**
 * La table publique où asseoir un nouveau venu, s'il y en a une qui l'attend.
 * La plus remplie d'abord : autant réunir les visiteurs que les disperser.
 */
export function tablePubliqueOuverte(salons: Iterable<Salon>): Salon | undefined {
  let choisie: Salon | undefined;
  for (const salon of salons) {
    if (!salon.accueille) continue;
    if (!choisie || salon.places.length > choisie.places.length) choisie = salon;
  }
  return choisie;
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
