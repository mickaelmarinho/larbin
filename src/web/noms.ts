/**
 * Les noms qu'on propose à qui n'en a pas donné.
 *
 * Sans prénom, tout le monde s'appelait « Joueur », « Joueur 2 », « Joueur 3 » :
 * une table sans visages. Un nom tiré au sort, pris dans le jeu de cartes et
 * assorti d'un trait de caractère, dit déjà quelque chose — et chacun peut le
 * remplacer par le sien.
 */

import { enAnglais } from './langue.ts';

export const PERSONNAGES = ['As', 'Valet', 'Roi', 'Joker', 'Brelan', 'Carré'];
export const TRAITS = ['malin', 'rusé', 'discret', 'têtu', 'pressé', 'zen', 'futé', 'hardi', 'farceur', 'prudent'];
/** En anglais, le trait passe devant : « Sly Jack ». */
export const PERSONNAGES_EN = ['Ace', 'Jack', 'King', 'Joker', 'Queen', 'Trump'];
export const TRAITS_EN = ['Sly', 'Cunning', 'Quiet', 'Stubborn', 'Hasty', 'Zen', 'Clever', 'Bold', 'Cheeky', 'Careful'];

/** Un nom au hasard. Le hasard s'injecte, pour qu'on puisse l'éprouver. */
export function nomAuHasard(hasard: () => number = Math.random, anglais = false): string {
  const pioche = <T>(liste: T[]): T => liste[Math.min(liste.length - 1, Math.floor(hasard() * liste.length))];
  if (anglais) {
    const personnage = pioche(PERSONNAGES_EN);
    return `${pioche(TRAITS_EN)} ${personnage}`;
  }
  return `${pioche(PERSONNAGES)} ${pioche(TRAITS)}`;
}

const CLE = `larbin.nom-propose${enAnglais ? '.en' : ''}`;

/**
 * Le nom proposé à ce navigateur : tiré une fois, puis gardé, pour qu'il ne
 * change pas à chaque visite. Il reste une proposition : le nom du joueur
 * n'est retenu que lorsqu'il s'assoit à une table.
 */
export function nomPropose(): string {
  try {
    const garde = localStorage.getItem(CLE);
    if (garde) return garde;
    const tire = nomAuHasard(Math.random, enAnglais);
    localStorage.setItem(CLE, tire);
    return tire;
  } catch {
    return nomAuHasard(Math.random, enAnglais);
  }
}
