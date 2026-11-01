import { describe, expect, it } from 'vitest';
import { parsePathData } from '../src/parse/pathData';
import { anchors, expectPoint, expectPoints, samplePoints } from './helpers';

describe('parsePathData', () => {
  it('reads absolute and relative lines, H, V and Z', () => {
    const [square] = parsePathData('M10 10 H20 v10 h-10 Z');
    expect(square!.closed).toBe(true);
    expectPoints(anchors(square!), [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]);
  });

  it('treats extra pairs after M as lines, relative after m', () => {
    const [absolute] = parsePathData('M0 0 10 0 10 10');
    expectPoints(anchors(absolute!), [[0, 0], [10, 0], [10, 10]]);
    const [relative] = parsePathData('m5 5 10 0 0 10');
    expectPoints(anchors(relative!), [[5, 5], [15, 5], [15, 15]]);
  });

  it('reads compact number forms', () => {
    // "10-5.5.5.5" is 10, -5.5, .5 and .5.
    const [line] = parsePathData('M0,0L10-5.5.5.5l1e1,0');
    expectPoints(anchors(line!), [[0, 0], [10, -5.5], [0.5, 0.5], [10.5, 0.5]]);
  });

  it('splits subpaths at each M, and drops a lone M', () => {
    const subpaths = parsePathData('M0 0 L10 0 M20 20 L30 20 M50 50');
    expect(subpaths).toHaveLength(2);
    expectPoint(subpaths[1]!.start, 20, 20);
  });

  it('does not add a closing segment when the path already ends at its start', () => {
    const [triangle] = parsePathData('M0 0 L10 0 L0 10 L0 0 Z');
    expect(triangle!.segments).toHaveLength(3);
    expect(triangle!.closed).toBe(true);
  });

  it('starts a new subpath at the closed start when drawing continues after Z', () => {
    const subpaths = parsePathData('M0 0 L10 0 L10 10 Z l5 5');
    expect(subpaths).toHaveLength(2);
    expectPoints(anchors(subpaths[1]!), [[0, 0], [5, 5]]);
  });

  it('reads cubic curves and reflects the control point for S', () => {
    const [curve] = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    const second = curve!.segments[1]!;
    expect(second.kind).toBe('cubic');
    if (second.kind !== 'cubic') return;
    // Reflection of (10, 10) around (10, 0).
    expectPoint(second.c1, 10, -10);
    expectPoint(second.c2, 20, -10);
    expectPoint(second.to, 20, 0);
  });

  it('turns Q and T into the identical cubics', () => {
    const [curve] = parsePathData('M0 0 Q15 30 30 0 T60 0');
    const [first, second] = curve!.segments;
    if (first?.kind !== 'cubic' || second?.kind !== 'cubic') throw new Error('expected cubics');
    // c1 = start + 2/3 (control - start), c2 = end + 2/3 (control - end).
    expectPoint(first.c1, 10, 20);
    expectPoint(first.c2, 20, 20);
    // T reflects (15, 30) around (30, 0) to (45, -30).
    expectPoint(second.c1, 40, -20);
    expectPoint(second.c2, 50, -20);
  });

  it('turns an arc into cubics that stay on the circle', () => {
    // A half circle of radius 10 around (10, 0), going through (10, 10).
    const [arc] = parsePathData('M0 0 A10 10 0 0 0 20 0');
    expect(arc!.segments.length).toBe(2);
    expectPoint(arc!.segments[1]!.to, 20, 0);
    for (const point of samplePoints(arc!)) {
      expect(Math.hypot(point.x - 10, point.y)).toBeCloseTo(10, 2);
    }
    expectPoint(arc!.segments[0]!.to, 10, 10, 6);
  });

  it('reads arc flags written without separators', () => {
    const [arc] = parsePathData('M0 0a10 10 0 0110 10');
    expectPoint(arc!.segments.at(-1)!.to, 10, 10);
  });

  it('keeps the path up to an error, like browsers', () => {
    const [line] = parsePathData('M0 0 L10 0 L20 oops L30 0');
    expectPoints(anchors(line!), [[0, 0], [10, 0]]);
  });
});
