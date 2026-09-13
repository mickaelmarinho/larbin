/**
 * La musique d'ambiance, composée à la volée.
 *
 * Pas de fichier audio : le navigateur joue lui-même chaque note. Rien à
 * télécharger, aucun droit à payer, et une musique qui ne boucle jamais tout à
 * fait pareil, parce qu'une part de ce qu'elle joue est tirée au hasard.
 *
 * Chaque morceau a ses instruments et son rythme à lui — c'est ce qui les rend
 * reconnaissables, bien plus que leurs accords :
 *   - le swing : contrebasse, batterie, piano (le casino, le salon de jazz) ;
 *   - la valse : un accordéon qui fait « poum-tchak-tchak » (le cabaret) ;
 *   - la nappe : des accords tenus et des clochettes, sans rythme (le calme).
 *
 * Coupée par défaut, parce que sur un téléphone une musique imposée fait fuir.
 */
import { GESTES, contexteAudio } from './sons.ts';

const CLE = 'larbin.musique';
// Réglé pour un haut-parleur de téléphone : plus bas, on n'entend rien.
const VOLUME = 0.4;

/** Des accords tenus, une basse tenue, des clochettes — et aucun rythme. */
export interface Nappe {
  genre: 'nappe';
  /** Noires par minute : ici, seulement la lenteur des changements. */
  tempo: number;
  /** La probabilité qu'une croche porte une clochette. */
  egrene: number;
  /** Jusqu'où montent les aigus, en hertz : plus bas, plus feutré. */
  clarte: number;
  /** Hauteurs en numéros MIDI : 60 est le do du milieu du clavier. */
  accords: Array<{ basse: number; notes: number[] }>;
}

/** Contrebasse, batterie et piano, en croches swinguées. */
export interface Swing {
  genre: 'swing';
  tempo: number;
  clarte: number;
  /** Cymbale franche, ou balais qui frottent. */
  batterie: 'cymbale' | 'balais';
  /** Piano sec qui ponctue, ou piano électrique qui tinte et laisse sonner. */
  piano: 'sec' | 'electrique';
  /** Une note par temps, ou une tous les deux temps. */
  basse: 'marche' | 'deux-temps';
  /** La chance, sur la fin de chaque mesure, qu'une note de phrase passe. */
  phrases: number;
  /** Les notes où puisent les phrases. */
  gamme: number[];
  /** Une mesure par accord : ses notes, et les quatre pas de la contrebasse. */
  mesures: Array<{ notes: number[]; marche: number[] }>;
}

/** Une valse à l'accordéon : la basse sur le 1, l'accord sur le 2 et le 3. */
export interface Valse {
  genre: 'valse';
  tempo: number;
  clarte: number;
  /** Les notes où se promène la mélodie, de proche en proche. */
  gamme: number[];
  /** Une mesure par accord : ses notes, et la basse qui alterne d'une mesure à l'autre. */
  mesures: Array<{ notes: number[]; basses: number[] }>;
}

export type NomMusique = 'casino' | 'salon' | 'cabaret' | 'calme';

export interface Musique {
  nom: string;
  resume: string;
  style: Nappe | Swing | Valse;
}

export const MUSIQUES: Record<NomMusique, Musique> = {
  casino: {
    nom: '🎰 Casino',
    resume: 'Un swing nerveux : contrebasse qui marche, cymbale, piano qui ponctue.',
    style: {
      genre: 'swing',
      tempo: 132,
      clarte: 3200,
      batterie: 'cymbale',
      piano: 'sec',
      basse: 'marche',
      phrases: 0.22,
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
    resume: 'Une ballade aux balais : piano électrique, contrebasse souple.',
    style: {
      genre: 'swing',
      tempo: 84,
      clarte: 2400,
      batterie: 'balais',
      piano: 'electrique',
      basse: 'deux-temps',
      phrases: 0.14,
      gamme: [60, 62, 64, 65, 67, 69, 72],
      // Fa majeur, un ii–V–I qui tourne : sol mineur, do, fa, ré.
      mesures: [
        { notes: [53, 57, 58, 62], marche: [55, 53, 50, 49] },
        { notes: [52, 57, 58, 62], marche: [48, 50, 52, 47] },
        { notes: [52, 55, 57, 60], marche: [53, 52, 48, 50] },
        { notes: [54, 57, 60, 63], marche: [50, 54, 57, 56] },
      ],
    },
  },
  cabaret: {
    nom: '🎭 Cabaret',
    resume: 'Une valse musette à l’accordéon, un brin nostalgique.',
    style: {
      genre: 'valse',
      tempo: 156,
      clarte: 2600,
      // La mineur harmonique : le sol dièse fait tout le parfum.
      gamme: [69, 71, 72, 74, 76, 77, 80, 81],
      mesures: [
        { notes: [57, 60, 64], basses: [45, 52] },
        { notes: [56, 59, 62], basses: [40, 47] },
        { notes: [56, 59, 62], basses: [40, 47] },
        { notes: [57, 60, 64], basses: [45, 52] },
        { notes: [57, 62, 65], basses: [50, 45] },
        { notes: [57, 60, 64], basses: [45, 52] },
        { notes: [56, 59, 62, 64], basses: [40, 47] },
        { notes: [57, 60, 64], basses: [45, 40] },
      ],
    },
  },
  calme: {
    nom: '🌙 Calme',
    resume: 'Des nappes lentes, et quelques clochettes.',
    style: {
      genre: 'nappe',
      tempo: 50,
      egrene: 0.25,
      clarte: 1400,
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
/** Les instruments à notes : adoucis par un filtre, avec un peu d'écho. */
let douce: GainNode | null = null;
/** La batterie : ni filtre ni écho, sinon elle serait étouffée. */
let franche: GainNode | null = null;
let filtre: BiquadFilterNode | null = null;
let bruit: AudioBuffer | null = null;
let minuteur: ReturnType<typeof setInterval> | undefined;
let prochaineCroche = 0;
let croche = 0;
/** Où en est la mélodie de la valse, dans sa gamme. */
let degre = 3;

const frequence = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const auHasard = <T>(liste: T[]): T => liste[Math.floor(Math.random() * liste.length)];

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
    const t = prochaineCroche;
    if (style.genre === 'swing') {
      jouerSwing(c, style, t, noire);
      // Des croches swinguées : la première dure deux tiers du temps.
      prochaineCroche += croche % 2 === 0 ? (noire * 2) / 3 : noire / 3;
    } else if (style.genre === 'valse') {
      // La valse avance d'un temps à la fois.
      jouerValse(c, style, t, noire);
      prochaineCroche += noire;
    } else {
      jouerNappe(c, style, t, noire);
      prochaineCroche += noire / 2;
    }
    croche += 1;
  }
}

/* ----------------------------------------------------------------- le swing */

function jouerSwing(c: AudioContext, s: Swing, t: number, noire: number): void {
  const mesure = s.mesures[Math.floor(croche / 8) % s.mesures.length];
  const position = croche % 8;
  const temps = Math.floor(position / 2);
  const contretemps = position % 2 === 1;
  if (position === 0) filtre!.frequency.setTargetAtTime(s.clarte, t, 0.3);

  // La contrebasse : une note par temps quand elle marche, une tous les deux
  // temps dans une ballade.
  if (!contretemps && (s.basse === 'marche' || temps % 2 === 0)) {
    const duree = s.basse === 'marche' ? noire * 0.9 : noire * 1.8;
    pincer(c, frequence(mesure.marche[temps]), t, duree, 0.16, 'triangle');
  }

  if (s.batterie === 'cymbale') {
    if (!contretemps) {
      frapper(c, t, 0.2, 0.05, 'highpass', 7000);
      // Le charleston au pied et la caisse claire, sur le 2 et le 4.
      if (temps === 1 || temps === 3) {
        frapper(c, t, 0.05, 0.05, 'highpass', 9000);
        frapper(c, t, 0.14, 0.04, 'bandpass', 1800);
      }
    } else if (temps === 1 || temps === 3) {
      // Le « ding-ding-a-ding » : la cymbale sur le contretemps du 2 et du 4.
      frapper(c, t, 0.12, 0.03, 'highpass', 7000);
    }
  } else if (!contretemps) {
    // Les balais : un frottement à chaque temps, appuyé sur le 2 et le 4.
    const appui = temps === 1 || temps === 3;
    balayer(c, t, appui ? noire * 0.7 : noire * 0.9, appui ? 0.05 : 0.022);
  }

  if (s.piano === 'sec') {
    // Le piano ponctue sur le 1 et sur le « et » du 2 — le rythme charleston.
    const chance = position === 0 ? 0.7 : position === 3 ? 0.8 : position === 5 ? 0.25 : 0;
    if (Math.random() < chance) {
      for (const n of mesure.notes) pincer(c, frequence(n), t, noire * 0.5, 0.035, 'sine');
    }
  } else if (position === 0 || (position === 5 && Math.random() < 0.3)) {
    // Le piano électrique pose l'accord et le laisse sonner.
    const duree = position === 0 ? noire * 3 : noire;
    for (const n of mesure.notes) tinter(c, frequence(n), t, duree, 0.03, 1);
  }

  if (temps >= 2 && Math.random() < s.phrases) {
    const n = auHasard(s.gamme) + 12;
    if (s.piano === 'sec') pincer(c, frequence(n), t, noire * 0.45, 0.05, 'triangle');
    else tinter(c, frequence(n), t, noire * 1.2, 0.05, 1);
  }
}

/* ----------------------------------------------------------------- la valse */

function jouerValse(c: AudioContext, s: Valse, t: number, noire: number): void {
  const numero = Math.floor(croche / 3);
  const mesure = s.mesures[numero % s.mesures.length];
  const temps = croche % 3;
  if (temps === 0) filtre!.frequency.setTargetAtTime(s.clarte, t, 0.3);

  if (temps === 0) {
    // « Poum » : la basse, qui alterne d'une mesure à l'autre.
    souffler(c, frequence(mesure.basses[numero % mesure.basses.length]), t, noire * 0.8, 0.07);
  } else {
    // « Tchak-tchak » : l'accord, bref.
    for (const n of mesure.notes) souffler(c, frequence(n), t, noire * 0.35, 0.022);
  }

  // La mélodie se promène dans la gamme, de proche en proche : sur le 1 le
  // plus souvent, et parfois une note de passage sur le 3.
  const chance = temps === 0 ? 0.75 : temps === 2 ? 0.4 : 0;
  if (Math.random() < chance) {
    degre = Math.max(0, Math.min(s.gamme.length - 1, degre + auHasard([-2, -1, -1, 1, 1, 2])));
    const duree = temps === 0 ? noire * 1.8 : noire * 0.9;
    souffler(c, frequence(s.gamme[degre]), t, duree, 0.05, true);
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
    // Une basse tenue elle aussi, une octave au-dessus de l'écrit : un
    // téléphone ne restitue pas grand-chose sous 100 Hz.
    tenir(c, frequence(accord.basse + 12), t, duree, 0.06);
  }
  if (position !== 0 && Math.random() < s.egrene) {
    // Une clochette, qui résonne longtemps.
    tinter(c, frequence(auHasard(accord.notes) + 12), t, noire * 6, 0.045, 3.5);
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

/**
 * Une note qui tinte : une onde modulée par une autre dont l'effet s'éteint
 * vite. Rapport 1 : le piano électrique ; rapport 3,5 : une clochette.
 */
function tinter(c: AudioContext, f: number, debut: number, duree: number, volume: number,
  rapport: number): void {
  const porteuse = c.createOscillator();
  const modulante = c.createOscillator();
  const profondeur = c.createGain();
  const gain = c.createGain();
  porteuse.frequency.value = f;
  modulante.frequency.value = f * rapport;
  profondeur.gain.setValueAtTime(f * 1.4, debut);
  profondeur.gain.exponentialRampToValueAtTime(f * 0.05, debut + 0.35);
  modulante.connect(profondeur).connect(porteuse.frequency);
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.exponentialRampToValueAtTime(volume, debut + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  porteuse.connect(gain).connect(douce!);
  for (const osc of [porteuse, modulante]) {
    osc.start(debut);
    osc.stop(debut + duree + 0.05);
  }
}

/**
 * Une note d'accordéon : deux anches légèrement désaccordées — ce battement,
 * c'est le son « musette » — et, pour la mélodie, un léger vibrato.
 */
function souffler(c: AudioContext, f: number, debut: number, duree: number, volume: number,
  vibrato = false): void {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.exponentialRampToValueAtTime(volume, debut + 0.03);
  gain.gain.setValueAtTime(volume, debut + duree * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree + 0.08);
  gain.connect(douce!);
  const oscs = [0.9965, 1.0035].map((ecart) => {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f * ecart;
    osc.connect(gain);
    return osc;
  });
  let lfo: OscillatorNode | null = null;
  if (vibrato) {
    lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const ampleur = c.createGain();
    ampleur.gain.value = f * 0.006;
    lfo.connect(ampleur);
    for (const osc of oscs) ampleur.connect(osc.frequency);
    oscs.push(lfo);
  }
  for (const osc of oscs) {
    osc.start(debut);
    osc.stop(debut + duree + 0.12);
  }
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

/** Un coup de balai : le souffle monte doucement puis retombe, au lieu de claquer. */
function balayer(c: AudioContext, debut: number, duree: number, volume: number): void {
  const source = c.createBufferSource();
  source.buffer = bruit;
  const passe = c.createBiquadFilter();
  passe.type = 'bandpass';
  passe.frequency.value = 3200;
  passe.Q.value = 0.6;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.exponentialRampToValueAtTime(volume, debut + duree * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  source.connect(passe).connect(gain).connect(franche!);
  source.start(debut, Math.random() * 0.5, duree + 0.02);
}
