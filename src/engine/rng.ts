/** Générateur pseudo-aléatoire déterministe (mulberry32), pour des parties rejouables. */

export function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return { value: ((x ^ (x >>> 14)) >>> 0) / 4294967296, seed: t };
}

/** Mélange de Fisher-Yates, sans effet de bord sur le tableau d'entrée. */
export function shuffle<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
  const out = items.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.seed;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { items: out, seed: s };
}
