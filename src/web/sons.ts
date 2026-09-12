/**
 * Les bruitages, fabriqués sur place.
 *
 * Aucun fichier audio : chaque son est synthétisé à la demande, en quelques
 * oscillateurs et un souffle filtré. La page n'y gagne pas un octet, et il n'y
 * a ni licence à respecter ni chargement à attendre sur un téléphone.
 *
 * Discrets par principe : un volume bas, des sons courts. Et coupables d'un
 * geste, avec la clochette.
 */
import type { Son } from './bruitages.ts';

const CLE = 'larbin.sons';
const VOLUME = 0.22;

let contexte: AudioContext | null = null;
let sortie: GainNode | null = null;

export function sonsActifs(): boolean {
  try {
    return localStorage.getItem(CLE) !== 'coupes';
  } catch {
    return true;
  }
}

/**
 * Les navigateurs refusent de produire un son avant que l'utilisateur ait
 * touché la page. On ouvre donc le canal audio au premier geste, pas avant :
 * l'ouvrir trop tôt ne donnerait que du silence et un avertissement.
 */
function preparer(): AudioContext | null {
  if (!contexte) {
    const Constructeur = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructeur) return null;
    contexte = new Constructeur();
    sortie = contexte.createGain();
    sortie.gain.value = VOLUME;
    sortie.connect(contexte.destination);
  }
  if (contexte.state === 'suspended') void contexte.resume();
  return contexte;
}

export function ouvrirAuPremierGeste(): void {
  const ouvrir = () => {
    if (sonsActifs()) preparer();
  };
  document.addEventListener('pointerdown', ouvrir, { once: true });
  document.addEventListener('keydown', ouvrir, { once: true });
}

export function reglerSons(actifs: boolean): void {
  try {
    localStorage.setItem(CLE, actifs ? 'actifs' : 'coupes');
  } catch { /* le réglage ne tiendra que le temps de la visite */ }
  // Un petit carillon pour dire que c'est rallumé : sinon on ne le saurait
  // qu'au prochain coup. Le contexte vient d'être repris, il faut le laisser
  // démarrer avant de lui confier une note.
  const c = actifs ? preparer() : null;
  if (c) void c.resume().then(() => jouerSons(['a-vous']));
}

/* ------------------------------------------------------------ la synthèse */

function ton(c: AudioContext, frequence: number, debut: number, duree: number, volume: number,
  forme: OscillatorType = 'sine', vers?: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = forme;
  osc.frequency.setValueAtTime(frequence, debut);
  if (vers) osc.frequency.exponentialRampToValueAtTime(vers, debut + duree);
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.exponentialRampToValueAtTime(volume, debut + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  osc.connect(gain).connect(sortie!);
  osc.start(debut);
  osc.stop(debut + duree + 0.02);
}

/** Un souffle bref et filtré : le frottement d'une carte sur le tapis. */
function frottement(c: AudioContext, debut: number, duree: number, volume: number, frequence: number): void {
  const n = Math.max(1, Math.floor(c.sampleRate * duree));
  const tampon = c.createBuffer(1, n, c.sampleRate);
  const donnees = tampon.getChannelData(0);
  for (let i = 0; i < n; i++) donnees[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const source = c.createBufferSource();
  source.buffer = tampon;
  const filtre = c.createBiquadFilter();
  filtre.type = 'bandpass';
  filtre.frequency.value = frequence;
  filtre.Q.value = 0.9;
  const gain = c.createGain();
  gain.gain.value = volume;
  source.connect(filtre).connect(gain).connect(sortie!);
  source.start(debut);
}

const PARTITION: Record<Son, (c: AudioContext, t: number) => void> = {
  carte: (c, t) => {
    frottement(c, t, 0.07, 0.9, 2400);
    ton(c, 170, t, 0.05, 0.08);
  },
  // Le 2 coupe : même geste, mais qui claque un peu plus.
  deux: (c, t) => {
    frottement(c, t, 0.09, 1, 1700);
    ton(c, 880, t + 0.02, 0.2, 0.1, 'triangle');
  },
  passe: (c, t) => ton(c, 330, t, 0.09, 0.05, 'sine', 250),
  // Une réaction : un « pop » bref et aigu, qui ne se confond avec aucun coup.
  reaction: (c, t) => ton(c, 1320, t, 0.12, 0.045, 'sine', 1760),
  'a-vous': (c, t) => {
    ton(c, 660, t, 0.16, 0.07);
    ton(c, 990, t + 0.11, 0.24, 0.06);
  },
  // Une clochette qui monte pour qui arrive, qui descend pour qui s'en va.
  arrivee: (c, t) => {
    ton(c, 784, t, 0.4, 0.08);
    ton(c, 1175, t + 0.13, 0.5, 0.07);
  },
  depart: (c, t) => {
    ton(c, 1175, t, 0.35, 0.05);
    ton(c, 784, t + 0.13, 0.45, 0.05);
  },
  'fin-de-manche': (c, t) => {
    [523, 659, 784].forEach((f, i) => ton(c, f, t + i * 0.1, 0.35, 0.06, 'triangle'));
  },
};

export function jouerSons(sons: Son[]): void {
  if (sons.length === 0 || !sonsActifs() || !contexte || contexte.state !== 'running') return;
  const maintenant = contexte.currentTime + 0.01;
  // Deux sons au même instant — une carte, puis « à vous » — se suivent au lieu
  // de se couvrir.
  sons.forEach((son, i) => PARTITION[son](contexte!, maintenant + i * 0.14));
}
