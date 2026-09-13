/**
 * La musique d'ambiance, composée à la volée.
 *
 * Pas de fichier audio ici non plus : quelques accords tenus, une basse, et de
 * rares notes égrenées au hasard, joués par le navigateur. Rien à télécharger,
 * aucun droit à payer, et une musique qui ne boucle jamais tout à fait pareil.
 *
 * Chaque tapis a son ambiance — un salon feutré, un cabaret, une pièce calme —
 * et la musique suit le tapis choisi, à l'accord suivant.
 *
 * Coupée par défaut : sur un téléphone, une musique imposée fait fuir. On la
 * met depuis le panneau du tapis, et le choix est retenu.
 */
import { GESTES, contexteAudio } from './sons.ts';
import { themeCourant } from './themes.ts';

const CLE = 'larbin.musique';
// Réglé pour un haut-parleur de téléphone : plus bas, on n'entendait rien du
// tout, les accords tenus se perdant sous le niveau des bruitages.
const VOLUME = 0.4;
/** Croches par accord : deux mesures, pour que l'harmonie respire. */
const CROCHES_PAR_ACCORD = 16;

export interface Ambiance {
  /** Noires par minute. */
  tempo: number;
  /** La probabilité qu'une croche porte une note égrenée. */
  egrene: number;
  accords: Array<{ basse: number; notes: number[] }>;
}

/** Les hauteurs sont en numéros MIDI : 60 est le do du milieu du clavier. */
export const AMBIANCES: Record<string, Ambiance> = {
  // Le salon : un ii–V–I de jazz, tranquille.
  feutre: {
    tempo: 76,
    egrene: 0.35,
    accords: [
      { basse: 38, notes: [53, 57, 60, 64] },
      { basse: 43, notes: [53, 59, 64, 69] },
      { basse: 36, notes: [52, 55, 59, 62] },
      { basse: 45, notes: [55, 61, 65, 69] },
    ],
  },
  // Le cabaret : du mineur, un peu de nostalgie.
  bordeaux: {
    tempo: 64,
    egrene: 0.45,
    accords: [
      { basse: 45, notes: [57, 60, 64] },
      { basse: 41, notes: [57, 62, 65] },
      { basse: 40, notes: [56, 62, 64] },
      { basse: 45, notes: [57, 60, 64, 69] },
    ],
  },
  // La pièce calme : des accords suspendus, presque immobiles.
  ardoise: {
    tempo: 58,
    egrene: 0.2,
    accords: [
      { basse: 36, notes: [55, 59, 64] },
      { basse: 41, notes: [57, 60, 64, 71] },
      { basse: 45, notes: [55, 59, 60, 64] },
      { basse: 43, notes: [55, 57, 62, 67] },
    ],
  },
};

const frequence = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let sortie: GainNode | null = null;
let minuteur: ReturnType<typeof setInterval> | undefined;
let prochaineCroche = 0;
let croche = 0;

export function musiqueActive(): boolean {
  try {
    return localStorage.getItem(CLE) === 'active';
  } catch {
    return false;
  }
}

export function reglerMusique(active: boolean): void {
  try {
    localStorage.setItem(CLE, active ? 'active' : 'coupee');
  } catch { /* le réglage ne tiendra que le temps de la visite */ }
  if (active) demarrer();
  else arreter();
}

/**
 * Reprend la musique au premier geste si on l'avait laissée allumée — le
 * navigateur n'autorise rien avant — et la met en pause quand l'onglet est
 * caché : personne ne veut d'un jeu qui chante dans sa poche.
 */
export function musiqueAuPremierGeste(): void {
  // Comme pour les bruitages : on réessaie à chaque geste jusqu'à ce que le
  // navigateur ait réellement démarré le son, puis on cesse d'écouter.
  const reprendre = () => {
    if (!musiqueActive()) return;
    demarrer();
    const c = contexteAudio();
    void c?.resume().then(() => {
      if (c.state !== 'running') return;
      for (const geste of GESTES) document.removeEventListener(geste, reprendre);
    });
  };
  for (const geste of GESTES) document.addEventListener(geste, reprendre);
  document.addEventListener('visibilitychange', () => {
    if (!musiqueActive()) return;
    if (document.hidden) arreter();
    else demarrer();
  });
}

function brancher(c: AudioContext): GainNode {
  if (sortie) return sortie;
  sortie = c.createGain();
  sortie.gain.value = 0;
  // Un filtre adoucit les aigus ; un écho discret donne de l'espace sans le
  // coût d'une vraie réverbération.
  const filtre = c.createBiquadFilter();
  filtre.type = 'lowpass';
  filtre.frequency.value = 1800;
  const echo = c.createDelay(1);
  echo.delayTime.value = 0.36;
  const retour = c.createGain();
  retour.gain.value = 0.28;
  const mouille = c.createGain();
  mouille.gain.value = 0.3;
  sortie.connect(filtre);
  filtre.connect(c.destination);
  filtre.connect(echo);
  echo.connect(retour).connect(echo);
  echo.connect(mouille).connect(c.destination);
  return sortie;
}

function demarrer(): void {
  const c = contexteAudio();
  if (!c || minuteur) return;
  const s = brancher(c);
  s.gain.cancelScheduledValues(c.currentTime);
  s.gain.setTargetAtTime(VOLUME, c.currentTime, 0.8);
  prochaineCroche = c.currentTime + 0.1;
  // On planifie un peu d'avance à intervalles réguliers : le minuteur du
  // navigateur n'est pas assez précis pour jouer note à note.
  minuteur = setInterval(() => planifier(c), 200);
  planifier(c);
}

function arreter(): void {
  clearInterval(minuteur);
  minuteur = undefined;
  const c = contexteAudio();
  if (c && sortie) {
    sortie.gain.cancelScheduledValues(c.currentTime);
    sortie.gain.setTargetAtTime(0, c.currentTime, 0.3);
  }
}

function planifier(c: AudioContext): void {
  while (prochaineCroche < c.currentTime + 0.6) {
    jouerCroche(c, prochaineCroche);
    const ambiance = AMBIANCES[themeCourant().cle] ?? AMBIANCES.feutre;
    prochaineCroche += 30 / ambiance.tempo;
    croche += 1;
  }
}

function jouerCroche(c: AudioContext, t: number): void {
  const ambiance = AMBIANCES[themeCourant().cle] ?? AMBIANCES.feutre;
  const accord = ambiance.accords[Math.floor(croche / CROCHES_PAR_ACCORD) % ambiance.accords.length];
  const noire = 60 / ambiance.tempo;
  const position = croche % CROCHES_PAR_ACCORD;

  if (position === 0) {
    const duree = noire * (CROCHES_PAR_ACCORD / 2);
    // Deux oscillateurs à peine désaccordés par note : c'est ce qui rend un
    // accord tenu chaleureux plutôt que froid.
    for (const n of accord.notes) {
      tenir(c, frequence(n) * 0.9977, t, duree, 0.03);
      tenir(c, frequence(n) * 1.0023, t, duree, 0.03);
    }
  }
  if (position === 0 || position === CROCHES_PAR_ACCORD / 2) {
    // Une octave au-dessus de la basse écrite : un téléphone ne restitue pas
    // grand-chose sous 100 Hz, et la basse disparaissait.
    pincer(c, frequence(accord.basse + 12), t, noire * 3, 0.1, 'triangle');
  }
  if (position !== 0 && Math.random() < ambiance.egrene) {
    const n = accord.notes[Math.floor(Math.random() * accord.notes.length)] + 12;
    pincer(c, frequence(n), t, noire * 1.6, 0.06, 'triangle');
  }
}

/** Une note tenue : attaque lente, extinction lente. */
function tenir(c: AudioContext, f: number, debut: number, duree: number, volume: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = f;
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.linearRampToValueAtTime(volume, debut + 1.2);
  gain.gain.setValueAtTime(volume, debut + duree);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree + 1.4);
  osc.connect(gain).connect(sortie!);
  osc.start(debut);
  osc.stop(debut + duree + 1.5);
}

/** Une note pincée : attaque franche, qui s'éteint d'elle-même. */
function pincer(c: AudioContext, f: number, debut: number, duree: number, volume: number,
  forme: OscillatorType): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = forme;
  osc.frequency.value = f;
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.exponentialRampToValueAtTime(volume, debut + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  osc.connect(gain).connect(sortie!);
  osc.start(debut);
  osc.stop(debut + duree + 0.05);
}
