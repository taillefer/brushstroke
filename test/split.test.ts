import { describe, expect, it } from 'vitest';
import { flattenLine } from '../src/geometry/flatten';
import { splitAtCorners } from '../src/geometry/split';
import { parsePathData } from '../src/parse/pathData';
import { resolveTuning, type Tuning } from '../src/tuning';

const split = (d: string, overrides: Partial<Tuning> = {}) => {
  const tuning = resolveTuning(overrides);
  return splitAtCorners(flattenLine({ ...parsePathData(d)[0]!, color: 'black' }, tuning), tuning);
};
const ends = (piece: { points: { x: number; y: number }[] }) =>
  [piece.points[0]!, piece.points.at(-1)!].map((p) => [Math.round(p.x), Math.round(p.y)]);

describe('splitAtCorners', () => {
  it('splits a square into four open strokes, one per side', () => {
    const pieces = split('M0 0 H30 V30 H0 Z', { splitOvershoot: 0 });
    expect(pieces).toHaveLength(4);
    for (const piece of pieces) {
      expect(piece.closed).toBe(false);
      expect(piece.length).toBeCloseTo(30, 6);
    }
    expect(pieces.map(ends)).toEqual([
      [[0, 0], [30, 0]],
      [[30, 0], [30, 30]],
      [[30, 30], [0, 30]],
      [[0, 30], [0, 0]],
    ]);
  });

  it('splits a zigzag into one stroke per straight part', () => {
    expect(split('M0 0 L20 20 L40 0 L60 20')).toHaveLength(3);
  });

  it('keeps a smooth curve whole', () => {
    const d = 'M0 50 C30 0 70 0 100 50 S170 100 200 50';
    expect(split(d)).toHaveLength(1);
    expect(split(d)[0]!.points).toEqual(flattenLine({ ...parsePathData(d)[0]!, color: 'black' }, resolveTuning()).points);
  });

  it('does not split corners gentler than splitAngle', () => {
    // The zigzag turns 90° at each corner.
    expect(split('M0 0 L20 20 L40 0 L60 20', { splitAngle: 100 })).toHaveLength(1);
    expect(split('M0 0 L20 20 L40 0 L60 20', { splitAngle: 80 })).toHaveLength(3);
  });

  it('never splits with splitAngle 180', () => {
    expect(split('M0 0 H30 V30 H0 Z', { splitAngle: 180 })).toHaveLength(1);
  });

  it('runs each stroke splitOvershoot pixels past the corners it touches, but not past free ends', () => {
    const [first, second] = split('M0 0 L50 0 L50 50', { splitOvershoot: 4 });
    expect(ends(first!)).toEqual([[0, 0], [54, 0]]);
    expect(ends(second!)).toEqual([[50, -4], [50, 50]]);
    expect(first!.length).toBeCloseTo(54, 6);
  });

  it('leaves no corner marks at the stroke ends', () => {
    for (const piece of split('M0 0 H30 V30 H0 Z')) {
      expect(piece.points[0]!.corner).toBe(false);
      expect(piece.points.at(-1)!.corner).toBe(false);
    }
  });
});
