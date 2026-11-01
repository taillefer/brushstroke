// The only source of randomness in the library. Everything is derived from a
// 32-bit seed, so the same seed always gives the same painting.

export interface Random {
  /** A float in [0, 1). */
  next(): number;
  /** A float in [min, max). */
  range(min: number, max: number): number;
  /**
   * An independent generator for a sub-part, such as one line or one bristle.
   * Forking by index keeps parts stable: adding a line does not change the
   * random numbers of the lines before it.
   */
  fork(index: number): Random;
}

/** Creates a seeded generator (mulberry32). */
export function createRandom(seed: number): Random {
  const base = seed >>> 0;
  let state = base;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    fork: (index) => createRandom(mix(base, index)),
  };
}

/**
 * Smooth 1D noise in [-1, 1]. Neighbouring inputs give neighbouring outputs,
 * and the pattern repeats roughly once per unit of input. Scale the input to
 * choose the wavelength, for example `noise(distanceAlongLine / 40)`.
 */
export function createNoise1D(seed: number): (x: number) => number {
  const base = seed >>> 0;
  const lattice = (i: number): number => (mix(base, i) / 4294967295) * 2 - 1;

  return (x) => {
    const i = Math.floor(x);
    const t = x - i;
    const smooth = t * t * (3 - 2 * t);
    const a = lattice(i);
    return a + (lattice(i + 1) - a) * smooth;
  };
}

/**
 * Smooth 2D noise in [-1, 1], like `createNoise1D` but over a plane. The
 * pattern repeats roughly once per unit in each direction.
 */
export function createNoise2D(seed: number): (x: number, y: number) => number {
  const base = seed >>> 0;
  const lattice = (i: number, j: number): number => (mix(mix(base, i), j) / 4294967295) * 2 - 1;
  const ease = (t: number) => t * t * (3 - 2 * t);

  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const tx = ease(x - i);
    const ty = ease(y - j);
    const top = lattice(i, j) + (lattice(i + 1, j) - lattice(i, j)) * tx;
    const bottom = lattice(i, j + 1) + (lattice(i + 1, j + 1) - lattice(i, j + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

/** Hashes text to a 32-bit unsigned integer (FNV-1a over UTF-16 code units). */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The caller's seed if given, otherwise a hash of the SVG text. */
export function resolveSeed(svgText: string, seed?: number): number {
  return seed === undefined ? hashText(svgText) : seed >>> 0;
}

/** A line's own seed as a 32-bit unsigned integer: numbers as they are, text hashed. */
export function lineSeedNumber(seed: string | number): number {
  return typeof seed === 'string' ? hashText(seed) : seed >>> 0;
}

// Combines two integers into a well-spread 32-bit unsigned integer
// (the murmur3 finaliser over a simple combination).
function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
