import { describe, expect, it } from 'vitest';
import { flattenLine } from '../src/geometry/flatten';
import { orientLine, type Hand } from '../src/hand';
import { parsePathData } from '../src/parse/pathData';
import { defaultTuning } from '../src/tuning';

const oriented = (d: string, hand: Hand) =>
  orientLine(flattenLine({ ...parsePathData(d)[0]!, color: 'black' }, defaultTuning), hand);
const ends = (d: string, hand: Hand) => {
  const { points } = oriented(d, hand);
  return [[points[0]!.x, points[0]!.y], [points.at(-1)!.x, points.at(-1)!.y]];
};

describe('orientLine', () => {
  it('paints horizontal lines left to right with a right hand, either way they were drawn', () => {
    expect(ends('M0 0 L100 10', 'right')).toEqual([[0, 0], [100, 10]]);
    expect(ends('M100 10 L0 0', 'right')).toEqual([[0, 0], [100, 10]]);
  });

  it('paints horizontal lines right to left with a left hand', () => {
    expect(ends('M0 0 L100 10', 'left')).toEqual([[100, 10], [0, 0]]);
    expect(ends('M100 10 L0 0', 'left')).toEqual([[100, 10], [0, 0]]);
  });

  it('paints vertical lines top to bottom with both hands', () => {
    for (const hand of ['right', 'left'] as const) {
      expect(ends('M5 100 L0 0', hand)).toEqual([[0, 0], [5, 100]]);
      expect(ends('M0 0 L5 100', hand)).toEqual([[0, 0], [5, 100]]);
    }
  });

  it('recomputes distances from the new start', () => {
    const { points } = oriented('M100 0 L0 0', 'right');
    expect(points[0]!.distance).toBe(0);
    expect(points.at(-1)!.distance).toBeCloseTo(100, 6);
  });

  it('starts a closed shape at its top-left point', () => {
    const { points } = oriented('M30 30 H0 V0 H30 Z', 'right');
    expect([points[0]!.x, points[0]!.y]).toEqual([0, 0]);
    expect([points.at(-1)!.x, points.at(-1)!.y]).toEqual([0, 0]);
  });

  it('goes counter-clockwise with a right hand and clockwise with a left hand', () => {
    // From the top-left corner, counter-clockwise on screen goes down first.
    const right = oriented('M0 0 H30 V30 H0 Z', 'right').points[5]!;
    expect(right.x).toBeCloseTo(0, 6);
    expect(right.y).toBeGreaterThan(0);
    const left = oriented('M0 0 H30 V30 H0 Z', 'left').points[5]!;
    expect(left.y).toBeCloseTo(0, 6);
    expect(left.x).toBeGreaterThan(0);
  });
});
