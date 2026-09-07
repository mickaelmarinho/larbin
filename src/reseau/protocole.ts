/**
 * Le langage parlé entre le navigateur et le serveur.
 *
 * Principe : le serveur détient l'état complet et fait seul autorité. Le client
 * n'envoie que des intentions, et ne reçoit que sa propre vue — jamais les mains
 * des autres. Un joueur ne peut donc ni tricher, ni regarder le jeu du voisin,
 * même en ouvrant la console.
 */
import type { Action } from '../engine/types.ts';
import type { PlayerView } from '../engine/game.ts';

/** Une place à la table, telle qu'on la voit depuis le salon. */
export interface Siege {
  id: string;
  nom: string;
  estBot: boolean;
  connecte: boolean;
  /** Celui qui a ouvert le salon : lui seul lance la partie. */
  hote: boolean;
}

export interface EtatSalon {
  code: string;
  sieges: Siege[];
  /** La partie a-t-elle commencé ? */
  commencee: boolean;
  minJoueurs: number;
  maxJoueurs: number;
}

export type VersServeur =
  | { type: 'rejoindre'; salon: string; nom: string; jeton?: string }
  | { type: 'ajouter-bot' }
  | { type: 'retirer'; id: string }
  | { type: 'demarrer' }
  | { type: 'action'; action: Action };

export type VersClient =
  | { type: 'bienvenue'; jeton: string; moi: string; salon: string }
  | { type: 'salon'; etat: EtatSalon }
  | { type: 'vue'; vue: PlayerView }
  | { type: 'erreur'; message: string };

/** Codes de salon : quatre lettres, sans les caractères qu'on confond à l'oral. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function codeDeSalon(hasard: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(hasard() * ALPHABET.length)];
  return code;
}

export function codeValide(code: string): boolean {
  return /^[A-Z]{4}$/.test(code) && [...code].every((c) => ALPHABET.includes(c));
}
