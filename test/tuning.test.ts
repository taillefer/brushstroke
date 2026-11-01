import { describe, expect, it } from 'vitest';
import { defaultTuning, resolveTuning, tuningRanges, type Tuning } from '../src/tuning';

describe('resolveTuning', () => {
  it('returns the defaults when nothing is overridden', () => {
    expect(resolveTuning()).toEqual(defaultTuning);
  });

  it('puts overrides on top of the defaults without changing them', () => {
    const tuning = resolveTuning({ bristleCount: 40 });
    expect(tuning.bristleCount).toBe(40);
    expect(tuning.cornerAngle).toBe(defaultTuning.cornerAngle);
    expect(defaultTuning.bristleCount).not.toBe(40);
  });
});

describe('tuningRanges', () => {
  it('has a range for every field, and every default is inside its range', () => {
    const fields = Object.keys(defaultTuning) as (keyof Tuning)[];
    expect(Object.keys(tuningRanges).sort()).toEqual([...fields].sort());
    for (const field of fields) {
      const { min, max } = tuningRanges[field];
      expect(defaultTuning[field], field).toBeGreaterThanOrEqual(min);
      expect(defaultTuning[field], field).toBeLessThanOrEqual(max);
    }
  });
});
