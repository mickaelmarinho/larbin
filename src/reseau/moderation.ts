/**
 * Les noms qu'on ne montre pas.
 *
 * Entre amis, la question ne se posait pas. Au classement public et aux tables
 * ouvertes à tous, un pseudo grossier s'affiche chez des inconnus — et c'est
 * l'image du site qu'il abîme. On refuse donc les grossièretés, même déguisées
 * (« S4l0pe », « grosCon », « Coooonnard »), sans refuser « Constance »,
 * « Faucon » ou « Technique » : les mots courts ou ambigus ne comptent que
 * s'ils forment un mot à eux seuls, seuls les mots longs et sans équivoque se
 * cherchent à l'intérieur des autres.
 *
 * Aucune liste n'est complète : celle-ci arrête le tout-venant, pas un
 * obstiné. C'est déjà l'essentiel.
 */

const CHIFFRES: Record<string, string> = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '€': 'e' };

/** « Coooonnard » et « Conard » se valent : les lettres répétées n'en font qu'une. */
const sansRepetitions = (s: string) => s.replace(/(.)\1+/g, '$1');

const simplifier = (s: string) => s
  .normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[013457@$€]/g, (c) => CHIFFRES[c] ?? c);

/** Cherchés à l'intérieur des noms : assez longs pour ne pas se glisser dans un mot honnête. */
const RACINES = [
  'connard', 'connasse', 'salope', 'salaud', 'encule', 'batard', 'enfoire', 'couille', 'putain',
  'merde', 'pouffiasse', 'branleur', 'branlette', 'suceuse', 'pedophil', 'vagin', 'penis',
  'gouine', 'hitler', 'bougnoul', 'youpin', 'nigg', 'fuck', 'bitch', 'faggot', 'sodomi',
].map(sansRepetitions);

/** Refusés seulement quand ils forment un mot entier : « Faucon » passe, « Gros con » non. */
const MOTS = new Set([
  'con', 'conne', 'cul', 'pute', 'pd', 'fdp', 'ntm', 'nique', 'niquer', 'bite', 'zob', 'teub',
  'chatte', 'pedale', 'tapette', 'sexe', 'porn', 'porno', 'shit', 'cunt', 'whore', 'pussy', 'slut',
  'dick', 'cock', 'fag', 'nazi', 'negre', 'negro', 'viol', 'suce',
].map(sansRepetitions));

/** Vrai si le nom peut s'afficher chez des inconnus. */
export function nomConvenable(brut: string): boolean {
  // « grosCon » : une majuscule au milieu d'un mot en sépare deux.
  const texte = simplifier(brut.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2'));
  const mots = texte.split(/[^a-z]+/).filter(Boolean).map(sansRepetitions);
  if (mots.some((m) => MOTS.has(m) || (m.endsWith('s') && MOTS.has(m.slice(0, -1))))) return false;
  const colle = sansRepetitions(texte.replace(/[^a-z]/g, ''));
  return !RACINES.some((r) => colle.includes(r));
}
