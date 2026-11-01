import { describe, expect, it } from 'vitest';
import { createNoise1D, createRandom, hashText, resolveSeed } from '../src/random';

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
