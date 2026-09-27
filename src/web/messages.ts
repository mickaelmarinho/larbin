/**
 * Les messages du serveur, en anglais.
 *
 * Le serveur de parties et l'API répondent en français, pour tout le monde :
 * ils ne savent pas dans quelle langue joue chacun. Ces messages sont en
 * nombre fini ; le navigateur les traduit en les affichant. Un message inconnu
 * s'affiche tel quel — mieux vaut du français qu'un vide.
 */
import { enAnglais } from './langue.ts';
import { cartesEnAnglais } from './journal.ts';

const FIXES: Record<string, string> = {
  // Le serveur de parties
  'Ce code de salon ne ressemble à rien.': 'That room code doesn’t look right.',
  'Le serveur a trébuché sur ce message.': 'The server tripped over that message.',
  'Le serveur redémarre — rouvrez le lien dans un instant.': 'The server is restarting — reopen the link in a moment.',
  'Message illisible.': 'Unreadable message.',
  'Rejoignez un salon avant de jouer.': 'Join a room before playing.',
  'Trop de messages d’un coup.': 'Too many messages at once.',
  'Trop de tables ouvertes. Réessayez dans un moment.': 'Too many open tables. Try again in a moment.',
  'Trop de salons ouverts, réessayez dans un moment.': 'Too many open rooms, try again in a moment.',
  'Votre place a été reprise ailleurs.': 'Your seat was taken over from another window.',
  'Impossible de rejoindre.': 'Could not join.',
  'Seul l\'hôte du salon décide de cela.': 'Only the room’s host decides that.',
  // Le salon
  'La partie a déjà commencé.': 'The game has already started.',
  'Il y a déjà plus de monde que cela à la table.': 'There are already more people than that at the table.',
  'Il faut être assis à la table.': 'You need to be seated at the table.',
  'La table est complète.': 'The table is full.',
  'La partie n\'a pas commencé.': 'The game hasn’t started.',
  'On ne joue pas à la place d\'un autre.': 'You can’t play for someone else.',
  'Seul l\'hôte relance une partie.': 'Only the host can start a new game.',
  'Réaction inconnue.': 'Unknown reaction.',
  // Le moteur
  'Ce n\'est pas le moment de couper.': 'This is not the time to cut.',
  'C\'est au Boss de couper le paquet.': 'The Boss cuts the deck.',
  'Action inconnue.': 'Unknown action.',
  'Ce n\'est pas le moment de poser.': 'This is not the time to play.',
  'Il faut poser au moins une carte.': 'You must play at least one card.',
  'Cartes en double.': 'Duplicate cards.',
  'Toutes les cartes posées doivent être de même hauteur.': 'All cards played must be of the same rank.',
  'Ce n\'est pas le moment de passer.': 'This is not the time to pass.',
  'On ne passe pas quand on ouvre une série : il faut poser.': 'You can’t pass when opening a trick: you must play.',
  'La manche n\'est pas terminée.': 'The round isn’t over.',
  'Identifiants de joueurs en double.': 'Duplicate player IDs.',
  // Les comptes et le défi
  'Ce défi n’est plus ouvert.': 'This challenge is closed.',
  'Ce pseudo est déjà pris.': 'This username is already taken.',
  'Ce pseudo n’est pas accepté ici. Choisissez-en un autre.': 'This username isn’t allowed here. Please choose another.',
  'Cette partie ne se rejoue pas : score refusé.': 'This game doesn’t replay: score refused.',
  'Introuvable.': 'Not found.',
  'Le serveur a trébuché. Réessayez dans un instant.': 'The server tripped. Try again in a moment.',
  'Les comptes ne sont pas encore ouverts.': 'Accounts aren’t open yet.',
  'Méthode non permise.': 'Method not allowed.',
  'Pseudo ou code secret incorrect.': 'Wrong username or secret code.',
  'Requête illisible.': 'Unreadable request.',
  'Session expirée : reconnectez-vous.': 'Session expired: please sign in again.',
  'Trop d’envois. Réessayez dans quelques minutes.': 'Too many submissions. Try again in a few minutes.',
  'Trop d’essais. Réessayez dans quelques minutes.': 'Too many attempts. Try again in a few minutes.',
  'Un pseudo de 3 à 14 caractères : lettres, chiffres, espace, trait d’union.':
    'A username of 3 to 14 characters: letters, digits, space, hyphen.',
  'Un score a déjà été envoyé d’ici pour ce défi.': 'A score was already sent from here for this challenge.',
  'Vous avez déjà un score pour ce défi.': 'You already have a score for this challenge.',
  'Événement inconnu.': 'Unknown event.',
  // Le navigateur (compte.ts)
  'Le serveur ne répond pas. Réessayez dans un instant.': 'The server isn’t responding. Try again in a moment.',
  'Une erreur est survenue.': 'Something went wrong.',
};

/** Les messages qui portent un nom ou un nombre. */
const MODELES: Array<[RegExp, (...m: string[]) => string]> = [
  [/^Aucun salon (.+)\. Le code est-il bon \?$/, (code) => `No room ${code}. Is the code right?`],
  [/^Une table se joue de (\d+) à (\d+) joueurs\.$/, (a, b) => `A table seats ${a} to ${b} players.`],
  [/^Il faut au moins (\d+) joueurs — ajoutez des bots\.$/, (n) => `At least ${n} players are needed — add bots.`],
  [/^Ce n'est pas le tour de (.+)\.$/, (qui) => `It isn’t ${qui}’s turn.`],
  [/^La coupe se place entre 1 et (\d+)\.$/, (n) => `The cut must be between 1 and ${n}.`],
  [/^(\S+) n'est pas dans la main de (.+)\.$/, (c, qui) => `${cartesEnAnglais(c)} isn’t in ${qui}’s hand.`],
  [/^Il faut poser exactement (\d+) carte\(s\), pas (\d+)\.$/, (a, b) => `You must play exactly ${a} card(s), not ${b}.`],
  [/^(\S+) ne bat pas (\S+) : il faut monter strictement\.$/,
    (a, b) => `${cartesEnAnglais(`${a}♠`).slice(0, -1)} doesn’t beat ${cartesEnAnglais(`${b}♠`).slice(0, -1)}: you must go strictly higher.`],
];

export function messageEnAnglais(message: string): string {
  if (message in FIXES) return FIXES[message];
  for (const [motif, traduire] of MODELES) {
    const m = message.match(motif);
    if (m) return traduire(...m.slice(1));
  }
  return message;
}

/** Un message du serveur, dans la langue de la page. */
export const messageDuServeur = (message: string): string => (enAnglais ? messageEnAnglais(message) : message);
