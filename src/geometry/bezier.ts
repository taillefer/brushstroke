import type { Point, Segment } from '../types';

// Shared exact-geometry helpers for segments: points, tangents, lengths and cuts.

export function segmentPoint(from: Point, segment: Segment, t: number): Point {
  if (segment.kind === 'line') return { x: from.x + (segment.to.x - from.x) * t, y: from.y + (segment.to.y - from.y) * t };
  const { c1, c2, to } = segment;
  const u = 1 - t;
  return {
    x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
  };
}

/** The derivative at t (not normalised). */
export function segmentDerivative(from: Point, segment: Segment, t: number): Point {
  if (segment.kind === 'line') return { x: segment.to.x - from.x, y: segment.to.y - from.y };
  const { c1, c2, to } = segment;
  const u = 1 - t;
  return {
    x: 3 * u * u * (c1.x - from.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (to.x - c2.x),
    y: 3 * u * u * (c1.y - from.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (to.y - c2.y),
  };
}

/**
 * The unit direction of travel at t. Where the derivative vanishes (a control
 * point on its anchor, or a cusp), it is taken a little further in.
 */
export function segmentTangent(from: Point, segment: Segment, t: number): Point {
  for (const step of [0, 1e-6, 1e-3, 1e-2]) {
    const u = t < 0.5 ? t + step : t - step;
    const d = segmentDerivative(from, segment, u);
    const length = Math.hypot(d.x, d.y);
    if (length > 1e-12) return { x: d.x / length, y: d.y / length };
  }
  const length = Math.hypot(segment.to.x - from.x, segment.to.y - from.y);
  return length > 0 ? { x: (segment.to.x - from.x) / length, y: (segment.to.y - from.y) / length } : { x: 0, y: 0 };
}

/** The part of a segment from t0 to t1, exactly (de Casteljau for a cubic). */
export function subSegment(from: Point, segment: Segment, t0: number, t1: number): { start: Point; segment: Segment } {
  if (segment.kind === 'line') {
    return { start: segmentPoint(from, segment, t0), segment: { kind: 'line', to: segmentPoint(from, segment, t1) } };
  }
  // Cut off the end at t1, then the start of what is left at t0 / t1.
  let [p0, p1, p2, p3] = [from, segment.c1, segment.c2, segment.to];
  if (t1 < 1) [p0, p1, p2, p3] = splitCubic(p0, p1, p2, p3, t1)[0];
  if (t0 > 0) [p0, p1, p2, p3] = splitCubic(p0, p1, p2, p3, t1 > 0 ? t0 / t1 : 0)[1];
  return {
    start: t0 === 0 ? { x: from.x, y: from.y } : p0,
    segment: { kind: 'cubic', c1: p1, c2: p2, to: t1 === 1 ? { x: segment.to.x, y: segment.to.y } : p3 },
  };
}

type Cubic = [Point, Point, Point, Point];

function splitCubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): [Cubic, Cubic] {
  const lerp = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = lerp(p0, p1);
  const b = lerp(p1, p2);
  const c = lerp(p2, p3);
  const d = lerp(a, b);
  const e = lerp(b, c);
  const m = lerp(d, e);
  return [[p0, a, d, m], [m, e, c, p3]];
}

// 5-point Gauss-Legendre nodes and weights on [-1, 1].
const NODES = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const WEIGHTS = [0.5688888888888889, 0.47862867049936647, 0.47862867049936647, 0.23692688505618908, 0.23692688505618908];
// A cubic's length is measured in this many pieces, each by Gauss-Legendre.
const LENGTH_PIECES = 16;

/**
 * Measures a segment's length and finds where along it (as t) a given
 * distance is. Lines are exact. A cubic is integrated in 16 pieces with
 * 5-point Gauss-Legendre, then t is refined with Newton's method, which is
 * accurate to far below a thousandth of a unit for any curve a map uses.
 */
export class SegmentMeasure {
  readonly length: number;
  private readonly cumulative: Float64Array | null;

  constructor(private readonly from: Point, private readonly segment: Segment) {
    if (segment.kind === 'line') {
      this.cumulative = null;
      this.length = Math.hypot(segment.to.x - from.x, segment.to.y - from.y);
      return;
    }
    this.cumulative = new Float64Array(LENGTH_PIECES + 1);
    for (let i = 0; i < LENGTH_PIECES; i++) {
      this.cumulative[i + 1] = this.cumulative[i]! + this.speedIntegral(i / LENGTH_PIECES, (i + 1) / LENGTH_PIECES);
    }
    this.length = this.cumulative[LENGTH_PIECES]!;
  }

  /** The t at which the segment has covered `distance` (clamped to 0…length). */
  tAt(distance: number): number {
    if (distance <= 0) return 0;
    if (distance >= this.length) return 1;
    if (!this.cumulative) return distance / this.length;
    const cumulative = this.cumulative;
    let i = 0;
    while (i < LENGTH_PIECES - 1 && cumulative[i + 1]! < distance) i++;
    const lo = i / LENGTH_PIECES;
    const hi = (i + 1) / LENGTH_PIECES;
    const span = cumulative[i + 1]! - cumulative[i]!;
    let t = span > 0 ? lo + ((distance - cumulative[i]!) / span) * (hi - lo) : lo;
    for (let k = 0; k < 8; k++) {
      const error = cumulative[i]! + this.speedIntegral(lo, t) - distance;
      const d = segmentDerivative(this.from, this.segment, t);
      const speed = Math.hypot(d.x, d.y);
      if (Math.abs(error) < 1e-10 || speed < 1e-12) break;
      t = Math.min(hi, Math.max(lo, t - error / speed));
    }
    return t;
  }

  private speedIntegral(a: number, b: number): number {
    const half = (b - a) / 2;
    const mid = (a + b) / 2;
    let sum = 0;
    for (let k = 0; k < NODES.length; k++) {
      const d = segmentDerivative(this.from, this.segment, mid + half * NODES[k]!);
      sum += WEIGHTS[k]! * Math.hypot(d.x, d.y);
    }
    return sum * half;
  }
}
