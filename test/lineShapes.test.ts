import { describe, expect, it } from 'vitest';
import { dashLine, doubleLine, offsetLine, planLines, smoothLine, straightLine, type Point, type Segment, type SvgLine } from '../src';
import { expectPoint, pointOnSegment, samplePoints } from './helpers';

const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Length of a line, by fine sampling. */
function lengthOf(line: { start: Point; segments: Segment[] }): number {
  const points = samplePoints({ ...line, closed: false }, 2000);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1]!, points[i]!);
  return length;
}

/** Distance from p to a line: coarse sampling, then finer sampling around the nearest sample. */
function distanceToLine(p: Point, line: { start: Point; segments: Segment[] }): number {
  let best = Infinity;
  let from = line.start;
  for (const segment of line.segments) {
    let bestT = 0;
    let segmentBest = Infinity;
    for (let i = 0; i <= 200; i++) {
      const d = dist(p, pointOnSegment(from, segment, i / 200));
      if (d < segmentBest) [segmentBest, bestT] = [d, i / 200];
    }
    for (let i = -200; i <= 200; i++) {
      const t = Math.min(1, Math.max(0, bestT + i / 40000));
      segmentBest = Math.min(segmentBest, dist(p, pointOnSegment(from, segment, t)));
    }
    best = Math.min(best, segmentBest);
    from = segment.to;
  }
  return best;
}

const zigzag: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 25 }, { x: 31, y: 5 }, { x: 80, y: 0 }];

describe('smoothLine', () => {
  it('passes through every point with continuous tangents', () => {
    const segments = smoothLine(zigzag);
    expect(segments).toHaveLength(zigzag.length - 1);
    segments.forEach((s, i) => {
      expect(s.kind).toBe('cubic');
      expect(s.to).toEqual(zigzag[i + 1]);
    });
    for (let i = 0; i + 1 < segments.length; i++) {
      const a = segments[i] as Extract<Segment, { kind: 'cubic' }>;
      const b = segments[i + 1] as Extract<Segment, { kind: 'cubic' }>;
      const inTangent = sub(a.to, a.c2);
      const outTangent = sub(b.c1, a.to);
      expect(Math.abs(cross(inTangent, outTangent)) / (Math.hypot(inTangent.x, inTangent.y) * Math.hypot(outTangent.x, outTangent.y))).toBeLessThan(1e-9);
      expect(inTangent.x * outTangent.x + inTangent.y * outTangent.y).toBeGreaterThan(0);
    }
  });

  it('gives straight thirds for evenly spaced points on a line', () => {
    const [first] = smoothLine([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }]) as Extract<Segment, { kind: 'cubic' }>[];
    expectPoint(first!.c1, 1, 0);
    expectPoint(first!.c2, 2, 0);
  });

  it('closes a ring with one more segment back to the first point, smooth at the join', () => {
    const ring = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
    const segments = smoothLine(ring, { closed: true }) as Extract<Segment, { kind: 'cubic' }>[];
    expect(segments).toHaveLength(4);
    expect(segments[3]!.to).toEqual(ring[0]);
    const inTangent = sub(segments[3]!.to, segments[3]!.c2);
    const outTangent = sub(segments[0]!.c1, ring[0]!);
    expect(Math.abs(cross(inTangent, outTangent))).toBeLessThan(1e-9);
    // A repeated first point at the end is the same ring.
    expect(smoothLine([...ring, ring[0]!], { closed: true })).toEqual(segments);
  });

  it('stays close to unevenly spaced points without loops (centripetal)', () => {
    // A uniform Catmull-Rom spline loops at the short middle step; a centripetal one does not.
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 101, y: 1 }, { x: 101, y: 100 }];
    const segments = smoothLine(points);
    const line = { start: points[0]!, segments };
    let from = points[0]!;
    for (const segment of segments) {
      for (let t = 0; t <= 1; t += 0.05) {
        const p = pointOnSegment(from, segment, t);
        expect(p.x).toBeLessThan(103);
        expect(p.y).toBeGreaterThan(-2);
      }
      from = segment.to;
    }
    expect(lengthOf(line)).toBeLessThan(205);
  });

  it('pulls tight with tension, to straight lines at 1', () => {
    const tight = smoothLine(zigzag, { tension: 1 }) as Extract<Segment, { kind: 'cubic' }>[];
    let from = zigzag[0]!;
    for (const s of tight) {
      expect(s.c1).toEqual(from);
      expect(s.c2).toEqual(s.to);
      from = s.to;
    }
    expect(lengthOf({ start: zigzag[0]!, segments: smoothLine(zigzag, { tension: 0.5 }) }))
      .toBeLessThan(lengthOf({ start: zigzag[0]!, segments: smoothLine(zigzag) }));
    expect(() => smoothLine(zigzag, { tension: 2 })).toThrow(RangeError);
  });

  it('skips repeated points and needs two distinct points', () => {
    expect(smoothLine([{ x: 1, y: 1 }])).toEqual([]);
    expect(smoothLine([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([]);
    const doubled = smoothLine([zigzag[0]!, ...zigzag]);
    expect(doubled).toEqual(smoothLine(zigzag));
    for (const s of smoothLine([{ x: 0, y: 0 }, { x: 5, y: 5 }])) {
      for (const p of s.kind === 'cubic' ? [s.c1, s.c2, s.to] : [s.to]) expect(Number.isFinite(p.x + p.y)).toBe(true);
    }
  });
});

describe('straightLine', () => {
  it('gives a line segment to each point, and back to the first when closed', () => {
    expect(straightLine(zigzag).map((s) => s.to)).toEqual(zigzag.slice(1));
    expect(straightLine(zigzag).every((s) => s.kind === 'line')).toBe(true);
    const closed = straightLine(zigzag, true);
    expect(closed).toHaveLength(zigzag.length);
    expect(closed.at(-1)!.to).toEqual(zigzag[0]);
    expect(straightLine([...zigzag, zigzag[0]!], true)).toHaveLength(zigzag.length);
    expect(straightLine([{ x: 0, y: 0 }])).toEqual([]);
  });
});

const road: SvgLine = { start: { x: 0, y: 0 }, segments: straightLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]), closed: false, color: 'sienna', seed: 'road-7' };
const curvy: SvgLine = { start: zigzag[0]!, segments: smoothLine(zigzag), closed: false, color: 'teal', seed: 9 };

describe('dashLine', () => {
  it('cuts straight segments into dashes and gaps, across anchors', () => {
    const dashes = dashLine(road, [30, 20]);
    expect(dashes.map((d) => [d.start, d.segments.map((s) => s.to)])).toEqual([
      [{ x: 0, y: 0 }, [{ x: 30, y: 0 }]],
      [{ x: 50, y: 0 }, [{ x: 80, y: 0 }]],
      // A dash that starts on the corner has no empty segment before it.
      [{ x: 100, y: 0 }, [{ x: 100, y: 30 }]],
    ]);
    expect(dashes.map((d) => d.seed)).toEqual(['road-7/d0', 'road-7/d1', 'road-7/d2']);
    expect(dashes.every((d) => !d.closed && d.color === 'sienna')).toBe(true);
  });

  it('keeps a corner inside a dash', () => {
    const [, second] = dashLine(road, [30, 60, 40, 100]);
    // 90 → 130: from (90, 0) round the corner to (100, 30).
    expect(second!.start).toEqual({ x: 90, y: 0 });
    expect(second!.segments.map((s) => s.to)).toEqual([{ x: 100, y: 0 }, { x: 100, y: 30 }]);
  });

  it('cuts cubics exactly, on the same curve, at the right lengths', () => {
    const total = lengthOf(curvy);
    const dashes = dashLine(curvy, [7, 3]);
    expect(dashes.length).toBe(Math.floor(total / 10) + (total % 10 > 1e-6 ? 1 : 0));
    for (const [n, dash] of dashes.entries()) {
      const expected = Math.min(7, total - 10 * n);
      expect(lengthOf(dash)).toBeCloseTo(expected, 2);
      // Every point of the dash lies on the original curve.
      for (const p of samplePoints(dash, 6)) expect(distanceToLine(p, curvy)).toBeLessThan(0.05);
    }
  });

  it('repeats an odd pattern, starts at the offset, and leaves a pattern of zeros solid', () => {
    expect(dashLine(road, [10])).toEqual(dashLine(road, [10, 10]));
    const shifted = dashLine(road, [30, 20], { offset: 10 });
    expect(shifted[0]!.start).toEqual({ x: 0, y: 0 });
    expect(shifted[0]!.segments[0]!.to).toEqual({ x: 20, y: 0 });
    expect(shifted[1]!.start).toEqual({ x: 40, y: 0 });
    // -45 is 5 into the pattern, like SVG stroke-dashoffset.
    expect(dashLine(road, [30, 20], { offset: -45 })[0]!.segments[0]!.to).toEqual({ x: 25, y: 0 });
    expect(dashLine(road, [])).toEqual([road]);
    expect(dashLine(road, [0, 0])).toEqual([road]);
    expect(() => dashLine(road, [5, -1])).toThrow(RangeError);
  });

  it('makes dots from very short dashes, which still paint', () => {
    const dots = dashLine(road, [0.1, 10]);
    expect(dots).toHaveLength(15);
    expect(planLines(dots, { size: 6 }).paths.length).toBe(15 * 24);
    expect(dashLine(road, [0, 10])).toEqual([]);
  });

  it('joins the dash that runs over the start of a closed line', () => {
    const square: SvgLine = { start: { x: 0, y: 0 }, segments: straightLine([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], true), closed: true, color: 'black', seed: 's' };
    // 160 long: dashes at 0–30, 50–80, 100–130, 150–160 + 0–30.
    const dashes = dashLine(square, [30, 20]);
    expect(dashes).toHaveLength(3);
    expect(dashes[0]!.start).toEqual({ x: 0, y: 10 });
    expect(dashes[0]!.segments.map((s) => s.to)).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }]);
    // A pattern longer than the ring gives the whole ring, still closed.
    const whole = dashLine(square, [500, 10]);
    expect(whole).toHaveLength(1);
    expect(whole[0]!.closed).toBe(true);
  });

  it('carries the width, and splits a changing width by distance', () => {
    expect(dashLine({ ...road, width: 5 }, [30, 20]).map((d) => [d.width, d.widthEnd])).toEqual([[5, undefined], [5, undefined], [5, undefined]]);
    // 150 long, 2 → 17.
    const widening = dashLine({ ...road, width: 2, widthEnd: 17 }, [30, 20]);
    expect(widening.map((d) => [d.width, d.widthEnd])).toEqual([[2, 5], [7, 10], [12, 15]]);
    expect(() => dashLine({ ...road, widthEnd: 3 }, [30, 20])).toThrow(RangeError);
  });

  it('keeps each dash as it was when the line is lengthened, and dashes without a seed have none', () => {
    const longer = { ...road, segments: [...road.segments, { kind: 'line' as const, to: { x: 100, y: 200 } }] };
    const before = planLines(dashLine(road, [30, 20]).slice(0, 2), { seed: 1 });
    const after = planLines(dashLine(longer, [30, 20]).slice(0, 2), { seed: 1 });
    expect(after).toEqual(before);
    const { seed: _, ...unseeded } = road;
    expect(dashLine(unseeded, [30, 20]).every((d) => !('seed' in d))).toBe(true);
  });
});

describe('offsetLine', () => {
  it('moves a straight line to the right of travel for a positive distance, with an exact mitre', () => {
    const right = offsetLine(road, 5);
    // Travelling right then down: the right side is below, then to the left.
    expect(right.start).toEqual({ x: 0, y: 5 });
    expect(right.segments.map((s) => [s.kind, s.to])).toEqual([['line', { x: 95, y: 5 }], ['line', { x: 95, y: 50 }]]);
    const left = offsetLine(road, -5);
    expect(left.start).toEqual({ x: 0, y: -5 });
    expect(left.segments.map((s) => s.to)).toEqual([{ x: 105, y: -5 }, { x: 105, y: 50 }]);
    expect(left.seed).toBe('road-7');
  });

  it('bevels a corner sharper than the mitre limit', () => {
    const hairpin: SvgLine = { ...road, segments: straightLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 10 }]) };
    const out = offsetLine(hairpin, -5);
    expect(out.segments.length).toBe(3);
    expect(out.segments.every((s) => s.kind === 'line')).toBe(true);
  });

  it('closes a closed line, with mitres all round', () => {
    const square: SvgLine = { start: { x: 0, y: 0 }, segments: straightLine([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], true), closed: true, color: 'black' };
    const inner = offsetLine(square, 5);
    expect(inner.start).toEqual({ x: 5, y: 5 });
    expect(inner.segments.map((s) => s.to)).toEqual([{ x: 35, y: 5 }, { x: 35, y: 35 }, { x: 5, y: 35 }, { x: 5, y: 5 }]);
    expect(inner.closed).toBe(true);
  });

  it('follows curves within the tolerance', () => {
    const wave: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 20 }, { x: 80, y: 0 }, { x: 120, y: 30 }, { x: 160, y: 10 }];
    const river: SvgLine = { start: wave[0]!, segments: smoothLine(wave), closed: false, color: 'blue' };
    for (const [distance, tolerance] of [[3, 0.03], [-3, 0.03], [8, 0.01], [-8, 0.08]] as const) {
      const out = offsetLine(river, distance, { tolerance });
      for (const p of samplePoints(out, 12)) {
        // 0.005 for the sampling of the original curve in this test.
        expect(Math.abs(distanceToLine(p, river) - Math.abs(distance))).toBeLessThan(tolerance + 0.005);
      }
      expect(dist(out.segments.at(-1)!.to, wave.at(-1)!)).toBeCloseTo(Math.abs(distance), 9);
      expect(dist(out.start, wave[0]!)).toBeCloseTo(Math.abs(distance), 9);
    }
    // A tight bend on the inner side gives a cusp, which is followed with a small loop, but stays finite.
    for (const p of samplePoints(offsetLine(curvy, -3), 8)) expect(Number.isFinite(p.x + p.y)).toBe(true);
  });

  it('keeps the widths and returns a copy for a distance of 0', () => {
    const wide = { ...curvy, width: 4, widthEnd: 8 };
    const out = offsetLine(wide, 2);
    expect([out.width, out.widthEnd]).toEqual([4, 8]);
    expect(offsetLine(wide, 0)).toEqual(wide);
    expect(() => offsetLine(wide, Number.NaN)).toThrow(RangeError);
  });
});

describe('doubleLine', () => {
  it('gives a left and a right line, gap apart, with derived seeds', () => {
    const [left, right] = doubleLine(road, 6);
    expect(left.start).toEqual({ x: 0, y: -3 });
    expect(right.start).toEqual({ x: 0, y: 3 });
    expect([left.seed, right.seed]).toEqual(['road-7/L', 'road-7/R']);
    const { seed: _, ...unseeded } = road;
    expect(doubleLine(unseeded, 6).every((l) => !('seed' in l))).toBe(true);
    // Both paint.
    const [a, b] = doubleLine(curvy, 4);
    expect(planLines([a], { size: 3 }).paths.length).toBeGreaterThan(0);
    expect(planLines([b], { size: 3 }).paths.length).toBeGreaterThan(0);
  });
});
