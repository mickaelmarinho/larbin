/**
 * Le jeu sur l'écran d'accueil du téléphone.
 *
 * Une icône qu'on voit tous les jours, c'est un jeu auquel on revient. Le
 * navigateur sait installer le site comme une appli, mais personne ne le sait :
 * on le propose donc, au bon moment — en fin de partie, une fois qu'on a joué
 * deux fois et qu'on sait si le jeu plaît. Un « plus tard » est respecté : on
 * ne revient à la charge qu'après dix parties de plus, et deux fois au plus.
 *
 * Chrome et Edge (Android, PC) ouvrent leur propre fenêtre d'installation ;
 * Safari sur iPhone n'en a pas, on explique alors le geste à faire.
 */

export interface Refus {
  /** Combien de fois on a répondu « plus tard ». */
  fois: number;
  /** Le nombre de parties jouées au dernier refus. */
  aParties: number;
}

export const PARTIES_AVANT = 2;
export const RELANCE = 10;
export const REFUS_MAX = 2;

/** Faut-il le proposer, à ce point du parcours ? */
export function proposerInstallation(parties: number, refus: Refus | null): boolean {
  if (parties < PARTIES_AVANT) return false;
  if (!refus) return true;
  return refus.fois < REFUS_MAX && parties >= refus.aParties + RELANCE;
}

/* ------------------------------------------------------------ le navigateur */

interface InvitationAInstaller extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let invitation: InvitationAInstaller | null = null;

/** À appeler au démarrage : le navigateur annonce tôt qu'il peut installer. */
export function ecouterInstallation(quandInstalle: () => void): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // On garde l'invitation pour la présenter nous-mêmes, au bon moment.
    e.preventDefault();
    invitation = e as InvitationAInstaller;
  });
  window.addEventListener('appinstalled', () => {
    invitation = null;
    quandInstalle();
  });
}

const dejaInstalle = () => matchMedia('(display-mode: standalone)').matches
  || (navigator as { standalone?: boolean }).standalone === true;

const surIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/** Comment installer ici : la fenêtre du navigateur, le geste à expliquer sur iPhone, ou rien. */
export function moyenDInstaller(): 'invitation' | 'iphone' | null {
  if (dejaInstalle()) return null;
  if (invitation) return 'invitation';
  return surIphone() ? 'iphone' : null;
}

/** Ouvre la fenêtre d'installation du navigateur. */
export async function installer(): Promise<void> {
  const courante = invitation;
  if (!courante) return;
  invitation = null;
  await courante.prompt();
  await courante.userChoice;
}

const CLE = 'larbin.installation';

export function refusGarde(): Refus | null {
  try {
    const r = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Refus | null;
    return r && Number.isInteger(r.fois) && Number.isInteger(r.aParties) ? r : null;
  } catch {
    return null;
  }
}

export function refuser(parties: number): void {
  try {
    localStorage.setItem(CLE, JSON.stringify({ fois: (refusGarde()?.fois ?? 0) + 1, aParties: parties }));
  } catch { /* on redemandera, tant pis */ }
}
