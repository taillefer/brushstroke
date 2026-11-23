import { describe, expect, it } from 'vitest';
import { createNoise1D, createNoise2D, createRandom, hashText, resolveSeed } from '../src/random';

const take = (seed: number, count: number): number[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => random.next());
};

describe('createRandom', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(42, 100)).toEqual(take(42, 100));
  });

  it('gives a different sequence for a different seed', () => {
    expect(take(42, 10)).not.toEqual(take(43, 10));
  });

  it('stays in [0, 1) and in the requested range', () => {
    const random = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const ranged = random.range(-3, 5);
      expect(ranged).toBeGreaterThanOrEqual(-3);
      expect(ranged).toBeLessThan(5);
    }
  });

  it('forks independent streams that do not depend on how much the parent was used', () => {
    const fresh = createRandom(42).fork(3);
    const used = createRandom(42);
    used.next();
    used.next();
    const forkAfterUse = used.fork(3);
    expect(fresh.next()).toBe(forkAfterUse.next());
    expect(createRandom(42).fork(3).next()).not.toBe(createRandom(42).fork(4).next());
  });
});

describe('createNoise1D', () => {
  it('is deterministic and stays in [-1, 1]', () => {
    const a = createNoise1D(9);
    const b = createNoise1D(9);
    for (let x = 0; x < 20; x += 0.13) {
      expect(a(x)).toBe(b(x));
      expect(Math.abs(a(x))).toBeLessThanOrEqual(1);
    }
  });

  it('is smooth: small steps give small changes', () => {
    const noise = createNoise1D(9);
    for (let x = 0; x < 20; x += 0.01) {
      expect(Math.abs(noise(x + 0.01) - noise(x))).toBeLessThan(0.05);
    }
  });
});

describe('createNoise2D', () => {
  it('is deterministic, depends on the seed, and stays in [-1, 1]', () => {
    const a = createNoise2D(5);
    const b = createNoise2D(5);
    const other = createNoise2D(6);
    let differs = false;
    for (let x = 0; x < 10; x += 0.37) {
      for (let y = 0; y < 10; y += 0.41) {
        expect(a(x, y)).toBe(b(x, y));
        expect(Math.abs(a(x, y))).toBeLessThanOrEqual(1);
        if (a(x, y) !== other(x, y)) differs = true;
      }
    }
    expect(differs).toBe(true);
  });

  it('is smooth in both directions', () => {
    const noise = createNoise2D(5);
    // One assertion on the largest step: an expect per sample is slow enough to time out under load.
    let largest = 0;
    for (let x = 0; x < 6; x += 0.05) {
      for (let y = 0; y < 6; y += 0.05) {
        largest = Math.max(largest, Math.abs(noise(x + 0.01, y) - noise(x, y)), Math.abs(noise(x, y + 0.01) - noise(x, y)));
      }
    }
    expect(largest).toBeLessThan(0.05);
  });
});

describe('hashText and resolveSeed', () => {
  const svg = '<svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10"/></svg>';

  it('gives the same seed for the same SVG text', () => {
    expect(hashText(svg)).toBe(hashText(svg));
  });

  it('gives a different seed when one character changes', () => {
    expect(hashText(svg)).not.toBe(hashText(svg.replace('y2="10"', 'y2="11"')));
  });

  it('uses the hash by default and the explicit seed when given', () => {
    expect(resolveSeed(svg)).toBe(hashText(svg));
    expect(resolveSeed(svg, 42)).toBe(42);
  });
});

describe('createNoise2D caching', () => {
  it('gives the same value for a point whatever was asked before it', () => {
    const walk = createNoise2D(5);
    const random = createRandom(1);
    // A walk that steps to neighbouring cells in every direction, and jumps.
    let x = 0;
    let y = 0;
    for (let k = 0; k < 2000; k++) {
      const jump = random.next() < 0.05 ? 7 : 1.3;
      x += (random.next() * 2 - 1) * jump;
      y += (random.next() * 2 - 1) * jump;
      expect(walk(x, y)).toBe(createNoise2D(5)(x, y));
    }
  });
});

describe('createNoise1D caching', () => {
  it('gives the same value for an input whatever was asked before it', () => {
    const walk = createNoise1D(5);
    const random = createRandom(2);
    let x = 0;
    for (let k = 0; k < 2000; k++) {
      x += (random.next() * 2 - 1) * (random.next() < 0.05 ? 9 : 0.7);
      expect(walk(x)).toBe(createNoise1D(5)(x));
    }
  });
});
