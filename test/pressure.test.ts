import { describe, expect, it } from 'vitest';
import { flattenLine } from '../src/geometry/flatten';
import { parsePathData } from '../src/parse/pathData';
import { linePressure } from '../src/pressure';
import { createNoise1D } from '../src/random';
import { resolveTuning, type Tuning } from '../src/tuning';

const SIZE = 12;
const silent = (_x: number) => 0;

const pressureOf = (d: string, overrides: Partial<Tuning> = {}, noise = silent) => {
  const tuning = resolveTuning(overrides);
  const line = flattenLine({ ...parsePathData(d)[0]!, color: 'black' }, tuning);
  return { line, pressure: linePressure(line, SIZE, tuning, noise) };
};

describe('linePressure', () => {
  it('is lower at the start and end than in the middle', () => {
    const { pressure } = pressureOf('M0 0 L300 0');
    const middle = pressure[150]!;
    expect(pressure[0]).toBeLessThan(middle);
    expect(pressure.at(-1)).toBeLessThan(middle);
    expect(pressure[0]).toBeCloseTo(resolveTuning().touchDownPressure, 6);
    expect(pressure.at(-1)).toBeCloseTo(resolveTuning().liftOffPressure, 6);
  });

  it('is higher at a corner than on the straight parts next to it', () => {
    const { line, pressure } = pressureOf('M0 0 L150 0 L150 150', { directionPressure: 0 });
    const corner = line.points.findIndex((p) => p.corner);
    expect(corner).toBeGreaterThan(0);
    expect(pressure[corner]).toBeGreaterThan(pressure[corner - 40]! + 0.05);
    expect(pressure[corner]).toBeGreaterThan(pressure[corner + 40]! + 0.05);
  });

  it('is higher at a corner than at a smooth anchor point', () => {
    const corner = pressureOf('M0 0 L150 0 L150 150', { directionPressure: 0 });
    const smoothAnchor = pressureOf('M0 0 L150 0 L300 0', { directionPressure: 0 });
    expect(corner.pressure[150]).toBeGreaterThan(smoothAnchor.pressure[150]!);
  });

  it('is higher on a downward stroke than on an upward one', () => {
    const down = pressureOf('M0 0 L0 300').pressure[150]!;
    const up = pressureOf('M0 300 L0 0').pressure[150]!;
    expect(down - up).toBeCloseTo(resolveTuning().directionPressure, 6);
  });

  it('adds smooth seeded noise', () => {
    const quiet = pressureOf('M0 0 L300 0', {}, silent).pressure;
    const noisy = pressureOf('M0 0 L300 0', {}, createNoise1D(1)).pressure;
    expect(noisy).not.toEqual(quiet);
    expect(pressureOf('M0 0 L300 0', {}, createNoise1D(1)).pressure).toEqual(noisy);
    // The part the noise adds changes only a little from one pixel to the next.
    const added = noisy.map((p, i) => p - quiet[i]!);
    for (let i = 1; i < added.length; i++) expect(Math.abs(added[i]! - added[i - 1]!)).toBeLessThan(0.01);
  });

  it('stays between 0 and 1', () => {
    const { pressure } = pressureOf('M0 0 L50 50 L100 0 L150 50', {
      basePressure: 1, cornerPressure: 0.5, anchorPressure: 0.5, noiseAmount: 0.5,
    }, createNoise1D(3));
    for (const p of pressure) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});
