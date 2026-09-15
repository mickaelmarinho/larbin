/**
 * Les succès vérifiés : ceux que le serveur décerne lui-même.
 *
 * En solo, la partie se joue dans le navigateur, et ce qu'il affirme ne peut
 * pas être contrôlé. En ligne, le serveur a tout vu : il applique aux joueurs
 * connectés à un compte les mêmes règles que le navigateur (web/succes.ts), et
 * marque ces succès comme vérifiés. Il note aussi chaque résultat : c'est de là,
 * et de là seulement, que vient le classement.
 */
import type { GameState, Player } from '../engine/types.ts';
import {
  fusionnerSucces, memoireVide, succesDeMain, succesDeManche, succesDePartie, type IdSucces, type Memoire,
} from '../web/succes.ts';
import type { Depot } from './depot.ts';
import type { Salon } from './salon.ts';

/** Le vainqueur d'une partie terminée, selon la règle du moteur. */
export function vainqueur(etat: GameState): string | null {
  const candidats = etat.players
    .filter((p) => p.points >= etat.objectif)
    .sort((a, b) => b.points - a.points || etat.classement.indexOf(a.id) - etat.classement.indexOf(b.id));
  return candidats[0]?.id ?? null;
}

/** Au moins deux humains à la table : la seule partie en ligne qui compte vraiment. */
export const entreHumains = (salon: Salon): boolean =>
  salon.places.filter((p) => !p.estBot).length >= 2;

export type Prevenir =(salon: Salon, compteId: string, ids: IdSucces[]) => void;

export class Recompenses {
  private depot: Depot;
  private prevenir: Prevenir;
  /** Ce qu'on retient de chaque compte d'une manche à l'autre : ses rôles, ses donnes vues. */
  private memoires = new Map<string, Memoire>();
  /** Le dernier moment observé de chaque table, pour ne le traiter qu'une fois. */
  private vus = new WeakMap<Salon, string>();

  constructor(depot: Depot, prevenir: Prevenir) {
    this.depot = depot;
    this.prevenir = prevenir;
  }

  /** Appelé à chaque changement d'une table : la donne, la fin d'une manche, la fin d'une partie. */
  async observer(salon: Salon): Promise<void> {
    const etat = salon.etat;
    if (!etat) return;
    const moment = `${etat.partie}:${etat.round}:${etat.phase}`;
    if (this.vus.get(salon) === moment) return;
    this.vus.set(salon, moment);
    if (etat.phase !== 'jeu' && etat.phase !== 'fin-de-manche' && etat.phase !== 'fin-de-partie') return;
    // Seul face aux bots, on joue en ligne comme on jouerait en solo : les
    // succès se gagnent toujours dans le navigateur, mais le serveur ne les
    // vérifie pas, et la partie ne compte pas au classement. Sans cela, on
    // pourrait y grimper sans jamais croiser personne.
    if (!entreHumains(salon)) return;

    for (const place of salon.places) {
      if (!place.compteId) continue;
      const joueur = etat.players.find((p) => p.id === place.id);
      if (joueur) await this.recompenser(salon, place.compteId, etat, joueur);
    }
  }

  private async recompenser(salon: Salon, compteId: string, etat: GameState, joueur: Player): Promise<void> {
    let memoire = this.memoires.get(compteId);
    if (!memoire) {
      memoire = memoireVide();
      this.memoires.set(compteId, memoire);
    }

    const candidats: IdSucces[] = [];
    if (etat.phase === 'jeu') {
      candidats.push(...succesDeMain(memoire, etat.partie, etat.round, joueur.hand));
    } else {
      if (joueur.role) {
        candidats.push(...succesDeManche(memoire, etat.partie, etat.round, joueur.role, joueur.finishedOnTwo));
      }
      if (etat.phase === 'fin-de-partie' && memoire.partieClose !== etat.partie) {
        const gagne = vainqueur(etat) === joueur.id;
        await this.depot.noterResultat(compteId, { date: new Date().toISOString(), gagne });
        const { parties, serie } = await this.depot.resultats(compteId);
        candidats.push(...succesDePartie(memoire, etat.partie, { gagne, enLigne: true, manches: etat.round, parties, serie }));
      }
    }
    if (candidats.length === 0) return;

    const date = new Date().toISOString();
    let nouveaux: IdSucces[] = [];
    await this.depot.modifierDonnees(compteId, (d) => {
      nouveaux = candidats.filter((id) => !d.succes.some((s) => s.id === id && s.verifie));
      return { ...d, succes: fusionnerSucces(d.succes, candidats.map((id) => ({ id, date, verifie: true }))) };
    });
    if (nouveaux.length > 0) this.prevenir(salon, compteId, nouveaux);
  }
}
