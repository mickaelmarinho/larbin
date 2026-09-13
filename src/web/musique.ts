/**
 * La musique d'ambiance, composée à la volée.
 *
 * Pas de fichier audio : le navigateur joue lui-même chaque note. Rien à
 * télécharger, aucun droit à payer, et une musique qui ne boucle jamais tout à
 * fait pareil, parce qu'une part de ce qu'elle joue est tirée au hasard.
 *
 * Deux façons de jouer. La nappe : des accords tenus, une basse, quelques notes
 * égrenées — pour les ambiances calmes. Le swing : une contrebasse qui marche,
 * une batterie aux balais, un piano qui ponctue — pour le casino, plus nerveux.
 *
 * On choisit son morceau ; coupée par défaut, parce que sur un téléphone une
 * musique imposée fait fuir.
 */
import { GESTES, contexteAudio } from './sons.ts';

const CLE = 'larbin.musique';
// Réglé pour un haut-parleur de téléphone : plus bas, on n'entend rien.
const VOLUME = 0.4;

/** Des accords tenus, une basse, quelques notes égrenées. */
export interface Nappe {
  genre: 'nappe';
  /** Noires par minute. */
  tempo: number;
  /** La probabilité qu'une croche porte une note égrenée. */
  egrene: number;
  /** Jusqu'où montent les aigus, en hertz : plus bas, plus feutré. */
  clarte: number;
  /** Hauteurs en numéros MIDI : 60 est le do du milieu du clavier. */
  accords: Array<{ basse: number; notes: number[] }>;
}

/** Une contrebasse qui marche, une batterie aux balais, un piano qui ponctue. */
export interface Swing {
  genre: 'swing';
  tempo: number;
  clarte: number;
  /** Les notes où puisent les petites phrases. */
  gamme: number[];
  /** Une mesure par accord : ses notes, et les quatre pas de la contrebasse. */
  mesures: Array<{ notes: number[]; marche: number[] }>;
}

export type NomMusique = 'casino' | 'salon' | 'cabaret' | 'calme';

export interface Musique {
  nom: string;
  resume: string;
  style: Nappe | Swing;
}

export const MUSIQUES: Record<NomMusique, Musique> = {
  casino: {
    nom: '🎰 Casino',
    resume: 'Un swing nerveux : contrebasse qui marche, cymbale, piano qui ponctue.',
    style: {
      genre: 'swing',
      tempo: 132,
      clarte: 3200,
      gamme: [60, 62, 63, 65, 66, 67, 70, 71, 72],
      // Do mineur, façon film d'espionnage : la basse glisse d'un accord à
      // l'autre par demi-tons.
      mesures: [
        { notes: [55, 60, 63, 69], marche: [48, 51, 55, 57] },
        { notes: [55, 60, 63, 69], marche: [48, 55, 51, 52] },
        { notes: [56, 60, 62, 65], marche: [53, 56, 50, 51] },
        { notes: [56, 60, 62, 65], marche: [53, 48, 50, 55] },
        { notes: [54, 60, 63, 68], marche: [56, 51, 48, 54] },
        { notes: [53, 59, 62, 67], marche: [55, 53, 50, 47] },
        { notes: [55, 60, 63, 69], marche: [48, 51, 53, 54] },
        { notes: [53, 59, 62, 68], marche: [55, 47, 50, 49] },
      ],
    },
  },
  salon: {
    nom: '🥃 Salon jazz',
    resume: 'Des accords feutrés, un tempo lent.',
    style: {
      genre: 'nappe',
      tempo: 76,
      egrene: 0.35,
      clarte: 1800,
      accords: [
        { basse: 38, notes: [53, 57, 60, 64] },
        { basse: 43, notes: [53, 59, 64, 69] },
        { basse: 36, notes: [52, 55, 59, 62] },
        { basse: 45, notes: [55, 61, 65, 69] },
      ],
    },
  },
  cabaret: {
    nom: '🎭 Cabaret',
    resume: 'Du mineur, un brin nostalgique.',
    style: {
      genre: 'nappe',
      tempo: 64,
      egrene: 0.45,
      clarte: 1800,
      accords: [
        { basse: 45, notes: [57, 60, 64] },
        { basse: 41, notes: [57, 62, 65] },
        { basse: 40, notes: [56, 62, 64] },
        { basse: 45, notes: [57, 60, 64, 69] },
      ],
    },
  },
  calme: {
    nom: '🌙 Calme',
    resume: 'Des accords suspendus, presque immobiles.',
    style: {
      genre: 'nappe',
      tempo: 58,
      egrene: 0.2,
      clarte: 1600,
      accords: [
        { basse: 36, notes: [55, 59, 64] },
        { basse: 41, notes: [57, 60, 64, 71] },
        { basse: 45, notes: [55, 59, 60, 64] },
        { basse: 43, notes: [55, 57, 62, 67] },
      ],
    },
  },
};

/** L'ordre dans lequel on les propose. */
export const ORDRE_MUSIQUES: NomMusique[] = ['casino', 'salon', 'cabaret', 'calme'];

/** Relit le choix enregistré. L'ancien interrupteur « active » mène au casino. */
export function choixDepuisStockage(valeur: string | null): NomMusique | null {
  if (valeur === 'active') return 'casino';
  return valeur !== null && Object.hasOwn(MUSIQUES, valeur) ? (valeur as NomMusique) : null;
}

export function musiqueChoisie(): NomMusique | null {
  try {
    return choixDepuisStockage(localStorage.getItem(CLE));
  } catch {
    return null;
  }
}

/** Choisit un morceau — il démarre aussitôt, à la première mesure — ou coupe la musique. */
export function choisirMusique(nom: NomMusique | null): void {
  try {
    localStorage.setItem(CLE, nom ?? 'coupee');
  } catch { /* le réglage ne tiendra que le temps de la visite */ }
  if (!nom) {
    arreter();
    return;
  }
  const c = contexteAudio();
  if (minuteur && c) {
    croche = 0;
    prochaineCroche = c.currentTime + 0.15;
  } else {
    demarrer();
  }
}

/**
 * Reprend la musique dès qu'un geste le permet si on l'avait laissée allumée,
 * et la met en pause quand l'onglet est caché : personne ne veut d'un jeu qui
 * chante dans sa poche.
 */
export function musiqueAuPremierGeste(): void {
  // On réessaie à chaque geste jusqu'à ce que le navigateur ait réellement
  // démarré le son, puis on cesse d'écouter.
  const reprendre = () => {
    if (!musiqueChoisie()) return;
    demarrer();
    const c = contexteAudio();
    void c?.resume().then(() => {
      if (c.state !== 'running') return;
      for (const geste of GESTES) document.removeEventListener(geste, reprendre);
    });
  };
  for (const geste of GESTES) document.addEventListener(geste, reprendre);
  document.addEventListener('visibilitychange', () => {
    if (!musiqueChoisie()) return;
    if (document.hidden) arreter();
    else demarrer();
  });
}

/* ------------------------------------------------------------ le branchement */

let maitre: GainNode | null = null;
/** Accords, basse et notes : adoucis par un filtre, avec un peu d'écho. */
let douce: GainNode | null = null;
/** La batterie : ni filtre ni écho, sinon les cymbales seraient étouffées. */
let franche: GainNode | null = null;
let filtre: BiquadFilterNode | null = null;
let bruit: AudioBuffer | null = null;
let minuteur: ReturnType<typeof setInterval> | undefined;
let prochaineCroche = 0;
let croche = 0;

const frequence = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function brancher(c: AudioContext): void {
  if (maitre) return;
  maitre = c.createGain();
  maitre.gain.value = 0;
  maitre.connect(c.destination);

  douce = c.createGain();
  filtre = c.createBiquadFilter();
  filtre.type = 'lowpass';
  filtre.frequency.value = 1800;
  const echo = c.createDelay(1);
  echo.delayTime.value = 0.36;
  const retour = c.createGain();
  retour.gain.value = 0.28;
  const mouille = c.createGain();
  mouille.gain.value = 0.3;
  douce.connect(filtre);
  filtre.connect(maitre);
  filtre.connect(echo);
  echo.connect(retour).connect(echo);
  echo.connect(mouille).connect(maitre);

  franche = c.createGain();
  franche.connect(maitre);

  // Une seconde de bruit blanc, où la batterie puise ses frottements.
  bruit = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const donnees = bruit.getChannelData(0);
  for (let i = 0; i < donnees.length; i++) donnees[i] = Math.random() * 2 - 1;
}

function demarrer(): void {
  const c = contexteAudio();
  if (!c || !musiqueChoisie() || minuteur) return;
  brancher(c);
  maitre!.gain.cancelScheduledValues(c.currentTime);
  maitre!.gain.setTargetAtTime(VOLUME, c.currentTime, 0.5);
  croche = 0;
  prochaineCroche = c.currentTime + 0.1;
  // On planifie un peu d'avance à intervalles réguliers : le minuteur du
  // navigateur n'est pas assez précis pour jouer note à note.
  minuteur = setInterval(() => planifier(c), 150);
  planifier(c);
}

function arreter(): void {
  clearInterval(minuteur);
  minuteur = undefined;
  const c = contexteAudio();
  if (c && maitre) {
    maitre.gain.cancelScheduledValues(c.currentTime);
    maitre.gain.setTargetAtTime(0, c.currentTime, 0.3);
  }
}

function planifier(c: AudioContext): void {
  const nom = musiqueChoisie();
  if (!nom) {
    arreter();
    return;
  }
  const style = MUSIQUES[nom].style;
  const noire = 60 / style.tempo;
  while (prochaineCroche < c.currentTime + 0.5) {
    if (style.genre === 'swing') {
      jouerSwing(c, style, prochaineCroche, noire);
      // Des croches swinguées : la première dure deux tiers du temps.
      prochaineCroche += croche % 2 === 0 ? (noire * 2) / 3 : noire / 3;
    } else {
      jouerNappe(c, style, prochaineCroche, noire);
      prochaineCroche += noire / 2;
    }
    croche += 1;
  }
}

/* ----------------------------------------------------------------- la nappe */

/** Croches par accord : deux mesures, pour que l'harmonie respire. */
const CROCHES_PAR_ACCORD = 16;

function jouerNappe(c: AudioContext, s: Nappe, t: number, noire: number): void {
  const accord = s.accords[Math.floor(croche / CROCHES_PAR_ACCORD) % s.accords.length];
  const position = croche % CROCHES_PAR_ACCORD;

  if (position === 0) {
    filtre!.frequency.setTargetAtTime(s.clarte, t, 0.3);
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
    // grand-chose sous 100 Hz.
    pincer(c, frequence(accord.basse + 12), t, noire * 3, 0.1, 'triangle');
  }
  if (position !== 0 && Math.random() < s.egrene) {
    const n = accord.notes[Math.floor(Math.random() * accord.notes.length)] + 12;
    pincer(c, frequence(n), t, noire * 1.6, 0.06, 'triangle');
  }
}

/* ----------------------------------------------------------------- le swing */

function jouerSwing(c: AudioContext, s: Swing, t: number, noire: number): void {
  const mesure = s.mesures[Math.floor(croche / 8) % s.mesures.length];
  const position = croche % 8;
  const temps = Math.floor(position / 2);
  const contretemps = position % 2 === 1;
  if (position === 0) filtre!.frequency.setTargetAtTime(s.clarte, t, 0.3);

  if (!contretemps) {
    // La contrebasse marche : une note par temps.
    pincer(c, frequence(mesure.marche[temps]), t, noire * 0.9, 0.16, 'triangle');
    // La cymbale, sur chaque temps.
    frapper(c, t, 0.2, 0.05, 'highpass', 7000);
    // Le charleston au pied et les balais, sur le 2 et le 4.
    if (temps === 1 || temps === 3) {
      frapper(c, t, 0.05, 0.05, 'highpass', 9000);
      frapper(c, t, 0.14, 0.04, 'bandpass', 1800);
    }
  } else if (temps === 1 || temps === 3) {
    // Le « ding-ding-a-ding » : la cymbale sur le contretemps du 2 et du 4.
    frapper(c, t, 0.12, 0.03, 'highpass', 7000);
  }

  // Le piano ponctue sur le 1 et sur le « et » du 2 — le rythme charleston —,
  // avec assez de hasard pour ne pas tourner en rond.
  const chance = position === 0 ? 0.7 : position === 3 ? 0.8 : position === 5 ? 0.25 : 0;
  if (Math.random() < chance) {
    for (const n of mesure.notes) pincer(c, frequence(n), t, noire * 0.5, 0.035, 'sine');
  }

  // Une note de phrase, de temps en temps, sur la seconde moitié de la mesure.
  if (temps >= 2 && Math.random() < 0.22) {
    const n = s.gamme[Math.floor(Math.random() * s.gamme.length)] + 12;
    pincer(c, frequence(n), t, noire * 0.45, 0.05, 'triangle');
  }
}

/* ------------------------------------------------------------ les instruments */

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
  osc.connect(gain).connect(douce!);
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
  gain.gain.exponentialRampToValueAtTime(volume, debut + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  osc.connect(gain).connect(douce!);
  osc.start(debut);
  osc.stop(debut + duree + 0.05);
}

/** Un frottement de batterie : un souffle bref, filtré. */
function frapper(c: AudioContext, debut: number, duree: number, volume: number,
  type: BiquadFilterType, frequenceFiltre: number): void {
  const source = c.createBufferSource();
  source.buffer = bruit;
  const passe = c.createBiquadFilter();
  passe.type = type;
  passe.frequency.value = frequenceFiltre;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, debut);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  source.connect(passe).connect(gain).connect(franche!);
  source.start(debut, Math.random() * 0.7, duree + 0.02);
}
