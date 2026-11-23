import { describe, expect, it } from 'vitest';
import { flattenSubpath, simplify, type Point, type Subpath } from '../src';
import { pointOnSegment } from './helpers';

function distanceToPolyline(p: Point, line: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

const curve: Subpath = {
  start: { x: 0, y: 0 },
  segments: [
    { kind: 'cubic', c1: { x: 0, y: 100 }, c2: { x: 100, y: 100 }, to: { x: 100, y: 0 } },
    { kind: 'line', to: { x: 200, y: 0 } },
  ],
  closed: false,
};

describe('flattenSubpath', () => {
  it('stays within the tolerance of the curve and keeps every anchor', () => {
    for (const tolerance of [1, 0.1, 0.01]) {
      const points = flattenSubpath(curve, tolerance);
      expect(points[0]).toEqual({ x: 0, y: 0 });
      expect(points).toContainEqual({ x: 100, y: 0 });
      expect(points.at(-1)).toEqual({ x: 200, y: 0 });
      for (let i = 0; i <= 200; i++) {
        const p = pointOnSegment(curve.start, curve.segments[0]!, i / 200);
        expect(distanceToPolyline(p, points)).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  it('uses more points for a finer tolerance and one point for a straight segment', () => {
    const coarse = flattenSubpath(curve, 1).length;
    const fine = flattenSubpath(curve, 0.01).length;
    expect(fine).toBeGreaterThan(coarse * 5);
    const straight: Subpath = { start: { x: 0, y: 0 }, segments: [{ kind: 'cubic', c1: { x: 1, y: 0 }, c2: { x: 2, y: 0 }, to: { x: 3, y: 0 } }], closed: false };
    expect(flattenSubpath(straight, 0.1)).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }]);
  });

  it('gives a ring for a closed subpath, without repeating the start', () => {
    const square: Subpath = {
      start: { x: 0, y: 0 },
      segments: [{ kind: 'line', to: { x: 1, y: 0 } }, { kind: 'line', to: { x: 1, y: 1 } }, { kind: 'line', to: { x: 0, y: 0 } }],
      closed: true,
    };
    expect(flattenSubpath(square, 0.1)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
  });

  it('rejects a tolerance that is not above 0', () => {
    expect(() => flattenSubpath(curve, 0)).toThrow(RangeError);
  });
});

describe('simplify', () => {
  const noisy = Array.from({ length: 101 }, (_, i) => ({ x: i, y: i % 2 === 0 ? 0 : 0.05 }));

  it('drops points within the tolerance of an open line and keeps its ends', () => {
    expect(simplify(noisy, 0.1)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(simplify(noisy, 0.01)).toHaveLength(101);
    const corner = [{ x: 0, y: 0 }, { x: 5, y: 0.01 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(simplify(corner, 0.1)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });

  it('keeps every dropped point within the tolerance', () => {
    const wiggle = Array.from({ length: 500 }, (_, i) => ({ x: i, y: Math.sin(i / 10) * 20 }));
    const kept = simplify(wiggle, 0.5);
    expect(kept.length).toBeLessThan(100);
    for (const p of wiggle) expect(distanceToPolyline(p, kept)).toBeLessThanOrEqual(0.5);
  });

  it('simplifies a ring, with or without a repeated first point', () => {
    const ring = Array.from({ length: 64 }, (_, i) => {
      const a = ((i + 8) / 64) * 2 * Math.PI; // Starts at a corner, since the first point is always kept.
      const side = Math.min(1 / Math.abs(Math.cos(a)), 1 / Math.abs(Math.sin(a)));
      return { x: Math.cos(a) * side * 10, y: Math.sin(a) * side * 10 };
    });
    const square = simplify(ring, 0.01, true);
    expect(square).toHaveLength(4);
    expect(simplify([...ring, ring[0]!], 0.01, true)).toEqual(square);
  });

  it('gives an empty ring when it collapses, and never changes its input', () => {
    const thin = [{ x: 0, y: 0 }, { x: 10, y: 0.01 }, { x: 20, y: 0 }, { x: 10, y: -0.01 }];
    const copy = structuredClone(thin);
    expect(simplify(thin, 1, true)).toEqual([]);
    expect(thin).toEqual(copy);
  });
});
