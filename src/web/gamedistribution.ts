/**
 * Le module de GameDistribution, vu du jeu.
 *
 * Ce portail se paie en publicités, qu'il passe lui-même. Ses règles : jamais
 * pendant une partie, seulement après un geste du joueur — un bouton qui lance
 * une partie ou la manche suivante —, et le jeu se tait et attend pendant ce
 * temps. C'est lui qui en règle la fréquence : on peut le lui demander souvent,
 * il refuse quand c'est trop tôt.
 *
 * Sa bibliothèque est chargée par la page du portail (voir
 * scripts/page-portail.mjs), qui nous relaie ses événements. Si elle manque ou
 * se tait, le jeu continue comme si de rien n'était.
 */
import { CHEZ_GAMEDISTRIBUTION } from './portail.ts';
import { faireSilence } from './sons.ts';

interface Bibliotheque { showAd(type?: string): Promise<unknown> | void }

/** Au-delà, on rend la main au joueur quoi que dise le module. */
const PATIENCE = 60_000;

let enPause = false;
let reprise: (() => void) | null = null;

if (CHEZ_GAMEDISTRIBUTION) {
  window.addEventListener('larbin-gd', (e) => {
    const nom = (e as CustomEvent<string>).detail;
    if (nom === 'SDK_GAME_PAUSE') {
      enPause = true;
      faireSilence(true);
    } else if (nom === 'SDK_GAME_START') {
      enPause = false;
      faireSilence(false);
      reprise?.();
    }
  });
}

const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Une publicité si le portail en a une à passer ; se résout quand on peut jouer. */
async function publicite(): Promise<void> {
  const sdk = (window as { gdsdk?: Bibliotheque }).gdsdk;
  if (typeof sdk?.showAd !== 'function') return;
  try {
    await Promise.race([Promise.resolve(sdk.showAd()).catch(() => undefined), attendre(PATIENCE)]);
    // La promesse peut se résoudre au début de la publicité : on attend qu'il rende la main.
    if (enPause) await Promise.race([new Promise<void>((r) => { reprise = r; }), attendre(PATIENCE)]);
  } catch { /* une publicité ratée ne retient personne */ } finally {
    reprise = null;
    enPause = false;
    faireSilence(false);
  }
}

/**
 * Fait `suite` après la publicité du portail, s'il y en a une. Partout
 * ailleurs, tout de suite — sans même un tour de boucle.
 */
export function apresLaPub(suite: () => void): void {
  if (!CHEZ_GAMEDISTRIBUTION) {
    suite();
    return;
  }
  void publicite().then(suite);
}
