/**
 * Les comptes : un pseudo et un code secret, rien d'autre.
 *
 * Ni adresse e-mail ni mot de passe : il n'y a donc aucune donnée personnelle à
 * protéger, et rien à envoyer. Le code est tiré au hasard par le serveur — 16
 * caractères, 80 bits : il ne se devine pas — et le serveur n'en garde qu'une
 * empreinte. Perdu, il ne peut être renvoyé à personne ; c'est le prix de
 * cette simplicité, et on le dit au joueur au moment où il le reçoit.
 */
import { createHash, randomBytes } from 'node:crypto';

import { nomPropre } from './protocole.ts';

export const PSEUDO_MIN = 3;
export const PSEUDO_MAX = 14;

/** Un pseudo montrable aux autres : les mêmes caractères qu'un nom de joueur, et au moins une lettre. */
export function pseudoValide(brut: unknown): string | null {
  // Trop long, on refuse plutôt que de couper en silence : le joueur choisit son pseudo.
  if (typeof brut !== 'string' || brut.trim().length > PSEUDO_MAX) return null;
  const pseudo = nomPropre(brut);
  return pseudo.length >= PSEUDO_MIN && pseudo.length <= PSEUDO_MAX && /\p{L}/u.test(pseudo) ? pseudo : null;
}

/** Deux pseudos qui ne diffèrent que par la casse ou les accents sont le même pseudo. */
export const cleDePseudo = (pseudo: string): string =>
  pseudo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Sans 0, O, 1 ni I : un code se recopie à la main sans confusion. */
const ALPHABET_CODE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Seize caractères parmi 32, soit 80 bits, groupés par quatre pour se recopier. */
export function nouveauCode(): string {
  const octets = randomBytes(16);
  let code = '';
  // 256 est un multiple de 32 : le modulo ne favorise aucun caractère.
  for (const octet of octets) code += ALPHABET_CODE[octet % 32];
  return code.match(/.{4}/g)!.join('-');
}

/** Le code tel qu'on le compare : sans tirets ni espaces, en capitales. Null s'il n'en a pas la forme. */
export function codeNormalise(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const code = brut.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return code.length === 16 && [...code].every((c) => ALPHABET_CODE.includes(c)) ? code : null;
}

/**
 * L'empreinte d'un secret. Un hachage lent n'apporterait rien ici : ces secrets
 * sont tirés au hasard et bien trop longs pour être essayés un à un.
 */
export const empreinte = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** Le jeton d'une session : ce que le navigateur garde pour rester connecté. */
export const nouveauJeton = (): string => randomBytes(32).toString('base64url');
