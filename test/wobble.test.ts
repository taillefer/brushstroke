import { describe, expect, it } from 'vitest';
import { flattenLine } from '../src/geometry/flatten';
import { parsePathData } from '../src/parse/pathData';
import { createNoise1D } from '../src/random';
import { resolveTuning } from '../src/tuning';
import { wobbleLine } from '../src/wobble';

const flat = (d: string) => flattenLine({ ...parsePathData(d)[0]!, color: 'black' }, resolveTuning());

describe('wobbleLine', () => {
  it('moves points sideways by at most wobbleAmount', () => {
    const line = flat('M0 0 L500 0');
    const wobbled = wobbleLine(line, { wobbleAmount: 3, wobbleWavelength: 50 }, createNoise1D(4));
    const drifts = wobbled.points.map((p, i) => [p.x - line.points[i]!.x, p.y]);
    for (const [dx, dy] of drifts) {
      // A horizontal line drifts only up and down.
      expect(Math.abs(dx!)).toBeLessThan(1e-9);
      expect(Math.abs(dy!)).toBeLessThanOrEqual(3);
    }
    expect(Math.max(...drifts.map(([, dy]) => Math.abs(dy!)))).toBeGreaterThan(1);
  });

  it('leaves the line unchanged when wobbleAmount is 0', () => {
    const line = flat('M0 0 L100 50');
    expect(wobbleLine(line, { wobbleAmount: 0, wobbleWavelength: 50 }, createNoise1D(4))).toBe(line);
  });

  it('gives the same wobble for the same seed, and a different one for another seed', () => {
    const line = flat('M0 0 L200 100');
    const tuning = { wobbleAmount: 2, wobbleWavelength: 60 };
    expect(wobbleLine(line, tuning, createNoise1D(4))).toEqual(wobbleLine(line, tuning, createNoise1D(4)));
    expect(wobbleLine(line, tuning, createNoise1D(5))).not.toEqual(wobbleLine(line, tuning, createNoise1D(4)));
  });

  it('closes a closed line without a step', () => {
    const circle = flat('M60 50 A10 10 0 1 1 40 50 A10 10 0 1 1 60 50 Z');
    const wobbled = wobbleLine(circle, { wobbleAmount: 3, wobbleWavelength: 20 }, createNoise1D(9));
    const first = wobbled.points[0]!;
    const last = wobbled.points.at(-1)!;
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(1e-6);
  });
});
