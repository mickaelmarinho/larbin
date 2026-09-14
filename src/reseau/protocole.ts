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

/**
 * Les réactions qu'on peut lancer à table. Une poignée, toujours la même : pas
 * de texte libre, donc rien à modérer, et rien qui se lise mal venant d'un
 * inconnu.
 */
export const REACTIONS = ['👍', '😂', '😱', '😤', '👏', '🔥', '🤞', '👑'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const estReaction = (x: unknown): x is Reaction =>
  typeof x === 'string' && (REACTIONS as readonly string[]).includes(x);

/**
 * Les avatars qu'un joueur peut afficher. Une liste fermée, comme les
 * réactions : rien d'autre ne s'affiche chez les autres.
 */
export const AVATARS = [
  '🦊', '🐼', '🐸', '🦉', '🐙', '🦁', '🐯', '🐨', '🐧', '🦄', '🎩', '😎',
  '👑', '⚡', '🛡️', '🃏', '🔥', '🤡', '🎓', '🏛️',
] as const;

export const estAvatar = (x: unknown): x is string =>
  typeof x === 'string' && (AVATARS as readonly string[]).includes(x);

/** Une place à la table, telle qu'on la voit depuis le salon. */
export interface Siege {
  id: string;
  nom: string;
  estBot: boolean;
  connecte: boolean;
  /** Celui qui a ouvert le salon : lui seul lance la partie. */
  hote: boolean;
  /** S'est dit prêt à jouer. Les bots le sont d'office. */
  pret: boolean;
  /** L'émoticône choisie par le joueur, ou null — les bots n'en ont pas. */
  avatar: string | null;
}

export interface EtatSalon {
  code: string;
  sieges: Siege[];
  /** La partie a-t-elle commencé ? */
  commencee: boolean;
  minJoueurs: number;
  maxJoueurs: number;
  /** Combien de joueurs à cette table : quatre, cinq ou six. */
  taille: number;
  /**
   * Table publique : ouverte aux inconnus, sans hôte. Elle ne fait attendre
   * personne — au bout du compte à rebours, des bots prennent les places vides.
   */
  publique: boolean;
  /** Millisecondes avant le lancement automatique, ou null s'il n'y en a pas. */
  departDans: number | null;
  /**
   * Millisecondes avant que la table ne joue à la place de celui dont c'est le
   * tour. Null quand elle n'attend personne, ou qu'elle attend un bot.
   */
  delaiPourJouer: number | null;
}

export type VersServeur =
  | { type: 'rejoindre'; salon: string; nom: string; jeton?: string; avatar?: string }
  | { type: 'rejoindre-public'; nom: string; avatar?: string }
  | { type: 'pret'; pret: boolean }
  | { type: 'taille'; taille: number }
  | { type: 'ajouter-bot' }
  | { type: 'retirer'; id: string }
  | { type: 'demarrer' }
  | { type: 'action'; action: Action }
  | { type: 'reaction'; reaction: string };

export type VersClient =
  | { type: 'bienvenue'; jeton: string; moi: string; salon: string }
  | { type: 'salon'; etat: EtatSalon }
  | { type: 'vue'; vue: PlayerView }
  | { type: 'erreur'; message: string }
  /** Quelqu'un à la table a réagi : `de` est l'identifiant de sa place. */
  | { type: 'reaction'; de: string; reaction: Reaction };

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

/** Longueur maximale d'un nom : la même que celle du champ de saisie. */
export const NOM_MAX = 14;

/**
 * Un nom qu'on peut montrer aux autres sans risque.
 *
 * Les noms s'affichent dans la page des autres joueurs. Entre amis la question
 * ne se posait guère ; entre inconnus, un « nom » fait de balises pourrait
 * s'exécuter chez tout le monde. On ne garde donc que des lettres, des chiffres,
 * l'espace, le trait d'union, l'apostrophe et le point — de quoi écrire
 * « Jean-Mi », « D'Artagnan » ou « Zoé 2 », et rien qui ressemble à du code.
 * C'est le serveur qui l'applique : lui fait autorité, pas le navigateur.
 */
export function nomPropre(brut: string): string {
  return brut
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} '’.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOM_MAX)
    .trim();
}
