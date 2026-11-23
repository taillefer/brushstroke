import type { Point, Segment, SvgLine } from '../types';
import { segmentDerivative, segmentPoint, segmentTangent } from './bezier';

export interface OffsetLineOptions {
  /**
   * How far a curve of the result may be from the true parallel curve, in
   * the units of the line. Default: a hundredth of the distance.
   */
  tolerance?: number;
  /**
   * At a corner, the outer side gets a sharp point as long as it reaches no
   * farther than this many distances from the corner; beyond, the corner is
   * cut off straight (bevelled). Default 4, as in SVG.
   */
  miterLimit?: number;
}

// A cubic is cut in half at most this many times while it is fitted, so a
// curve that cannot be followed (a cusp in the parallel curve) stays cheap.
const MAX_DEPTH = 10;
// Points closer than this, in the units of the line, are the same point.
const EPSILON = 1e-9;

/**
 * A line parallel to `line`, `distance` away from it. A positive distance is
 * on the right of the direction of travel on screen (where y points down): a
 * line drawn left to right moves down. A negative distance is on the left.
 *
 * Accuracy:
 * - Straight segments are offset exactly, and so are the corners between two
 *   of them: the outer side gets a mitre (up to `miterLimit`, then a bevel),
 *   the inner side is trimmed where the two offset segments cross. So a road
 *   made with `straightLine` gets exact parallels.
 * - A cubic has no exact cubic offset. Each is replaced by cubics whose ends
 *   and end tangents are exact and whose handles are scaled by the curvature
 *   at the ends, cut in half until no sampled point is farther than
 *   `tolerance` from the true parallel curve. Curves from `smoothLine` are
 *   gentle, and usually take one or two cubics each.
 * - Where a curve bends tighter than `distance` on the inner side, the true
 *   parallel curve has a cusp, and the result follows it with a small loop.
 *   At a sharp corner next to a curve, the inner side is joined with a short
 *   straight segment, which can backtrack a little.
 *
 * The result keeps every other field of the line, `seed`, `width` and
 * `widthEnd` included, so it is painted like the original. Segments of
 * length 0 are dropped. Pure geometry, no randomness.
 */
export function offsetLine<T extends SvgLine>(line: T, distance: number, options: OffsetLineOptions = {}): T {
  if (!Number.isFinite(distance)) throw new RangeError('brushstroke: offsetLine needs a finite distance');
  const tolerance = options.tolerance ?? Math.abs(distance) / 100;
  const miterLimit = options.miterLimit ?? 4;
  if (distance === 0) return { ...line };
  if (!(tolerance > 0)) throw new RangeError('brushstroke: offsetLine needs a tolerance above 0');

  const parts: Part[] = [];
  let from = line.start;
  for (const segment of line.segments) {
    if (!isPoint(from, segment)) parts.push(offsetSegment(from, segment, distance, tolerance));
    from = segment.to;
  }
  if (parts.length === 0) return { ...line, start: { ...line.start }, segments: [] };

  for (let i = 0; i + 1 < parts.length; i++) join(parts[i]!, parts[i + 1]!, distance, miterLimit);
  if (line.closed) join(parts[parts.length - 1]!, parts[0]!, distance, miterLimit);

  const segments = parts.flatMap((part) => part.segments);
  // A closed line ends where it starts, wherever the join moved the start to.
  if (line.closed) segments[segments.length - 1] = { ...segments[segments.length - 1]!, to: { ...parts[0]!.start } };
  return { ...line, start: parts[0]!.start, segments };
}

/**
 * Two lines parallel to `line`, `gap` apart, for a double-line road. The
 * first is on the left of the direction of travel (seed `<seed>/L`), the
 * second on the right (`<seed>/R`); a line without a seed gives lines without
 * one. See `offsetLine` for the accuracy.
 */
export function doubleLine<T extends SvgLine>(line: T, gap: number, options: OffsetLineOptions = {}): [T, T] {
  const left = offsetLine(line, -gap / 2, options);
  const right = offsetLine(line, gap / 2, options);
  if (line.seed === undefined) return [left, right];
  return [{ ...left, seed: `${line.seed}/L` }, { ...right, seed: `${line.seed}/R` }];
}

/** An offset segment: one or more segments from `start`, with the tangents at its two ends. */
interface Part {
  start: Point;
  segments: Segment[];
  startTangent: Point;
  endTangent: Point;
  /** The original anchor at each end, for the mitre limit. */
  startAnchor: Point;
  endAnchor: Point;
}

function isPoint(from: Point, segment: Segment): boolean {
  const same = (p: Point) => Math.abs(p.x - from.x) <= EPSILON && Math.abs(p.y - from.y) <= EPSILON;
  return segment.kind === 'line' ? same(segment.to) : same(segment.c1) && same(segment.c2) && same(segment.to);
}

/** The unit normal on the right of travel on screen (y down). */
function normal(tangent: Point): Point {
  return { x: -tangent.y, y: tangent.x };
}

function offsetSegment(from: Point, segment: Segment, distance: number, tolerance: number): Part {
  const startTangent = segmentTangent(from, segment, 0);
  const endTangent = segmentTangent(from, segment, 1);
  const n0 = normal(startTangent);
  const start = { x: from.x + n0.x * distance, y: from.y + n0.y * distance };
  const anchors = { startTangent, endTangent, startAnchor: from, endAnchor: segment.to };
  if (segment.kind === 'line') {
    const to = { x: segment.to.x + n0.x * distance, y: segment.to.y + n0.y * distance };
    return { start, segments: [{ kind: 'line', to }], ...anchors };
  }
  const segments: Segment[] = [];
  offsetCubic(from, segment, distance, tolerance, 0, segments);
  return { start, segments, ...anchors };
}

/** Appends cubics that follow the parallel curve of one cubic to `out`. */
function offsetCubic(
  from: Point,
  cubic: Extract<Segment, { kind: 'cubic' }>,
  distance: number,
  tolerance: number,
  depth: number,
  out: Segment[],
): void {
  const fitted = fitOffset(from, cubic, distance);
  if (depth >= MAX_DEPTH || offsetError(from, cubic, fitted.start, fitted.segment, distance) <= tolerance) {
    out.push(fitted.segment);
    return;
  }
  const [first, second] = halves(from, cubic);
  offsetCubic(from, first, distance, tolerance, depth + 1, out);
  offsetCubic(first.to, second, distance, tolerance, depth + 1, out);
}

/**
 * Exact ends and end tangents, with each handle scaled by 1 − distance ×
 * curvature at its end: the parallel curve is that much longer or shorter
 * than the curve, so its handles are too.
 */
function fitOffset(from: Point, cubic: Extract<Segment, { kind: 'cubic' }>, distance: number) {
  const t0 = segmentTangent(from, cubic, 0);
  const t1 = segmentTangent(from, cubic, 1);
  const n0 = normal(t0);
  const n1 = normal(t1);
  const start = { x: from.x + n0.x * distance, y: from.y + n0.y * distance };
  const to = { x: cubic.to.x + n1.x * distance, y: cubic.to.y + n1.y * distance };
  const s0 = Math.max(0, 1 + distance * curvature(from, cubic, 0));
  const s1 = Math.max(0, 1 + distance * curvature(from, cubic, 1));
  const segment: Segment = {
    kind: 'cubic',
    c1: { x: start.x + (cubic.c1.x - from.x) * s0, y: start.y + (cubic.c1.y - from.y) * s0 },
    c2: { x: to.x + (cubic.c2.x - cubic.to.x) * s1, y: to.y + (cubic.c2.y - cubic.to.y) * s1 },
    to,
  };
  return { start, segment };
}

/**
 * Signed curvature at t, with the sign such that the parallel curve at a
 * positive distance is 1 + distance × curvature times as long: positive where
 * the curve bends away from the offset side.
 */
function curvature(from: Point, cubic: Extract<Segment, { kind: 'cubic' }>, t: number): number {
  const d = segmentDerivative(from, cubic, t);
  const { c1, c2, to } = cubic;
  const u = 1 - t;
  const dd = {
    x: 6 * u * (c2.x - 2 * c1.x + from.x) + 6 * t * (to.x - 2 * c2.x + c1.x),
    y: 6 * u * (c2.y - 2 * c1.y + from.y) + 6 * t * (to.y - 2 * c2.y + c1.y),
  };
  const speed = Math.hypot(d.x, d.y);
  if (speed < 1e-12) return 0;
  // With y down and the normal (−ty, tx), a curve bending towards the normal
  // has d × dd > 0, and the parallel curve on that side is shorter.
  return -(d.x * dd.y - d.y * dd.x) / (speed * speed * speed);
}

/** The largest distance, at a few samples, between the fitted cubic and the true parallel curve. */
function offsetError(
  from: Point,
  cubic: Extract<Segment, { kind: 'cubic' }>,
  start: Point,
  fitted: Segment,
  distance: number,
): number {
  let error = 0;
  for (const t of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    const p = segmentPoint(start, fitted, t);
    // Distance from the fitted point to the curve, near t, minus the wanted distance.
    const d = nearestDistance(from, cubic, p, t);
    error = Math.max(error, Math.abs(d - Math.abs(distance)));
  }
  return error;
}

/** The distance from `p` to the cubic, searched near `guess` (Newton on the parameter). */
function nearestDistance(from: Point, cubic: Extract<Segment, { kind: 'cubic' }>, p: Point, guess: number): number {
  let t = guess;
  for (let k = 0; k < 6; k++) {
    const b = segmentPoint(from, cubic, t);
    const d = segmentDerivative(from, cubic, t);
    const speed2 = d.x * d.x + d.y * d.y;
    if (speed2 < 1e-18) break;
    const step = ((p.x - b.x) * d.x + (p.y - b.y) * d.y) / speed2;
    t = Math.min(1, Math.max(0, t + step));
    if (Math.abs(step) < 1e-9) break;
  }
  const b = segmentPoint(from, cubic, t);
  return Math.hypot(p.x - b.x, p.y - b.y);
}

function halves(from: Point, cubic: Extract<Segment, { kind: 'cubic' }>): [Extract<Segment, { kind: 'cubic' }>, Extract<Segment, { kind: 'cubic' }>] {
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const a = mid(from, cubic.c1);
  const b = mid(cubic.c1, cubic.c2);
  const c = mid(cubic.c2, cubic.to);
  const d = mid(a, b);
  const e = mid(b, c);
  const m = mid(d, e);
  return [
    { kind: 'cubic', c1: a, c2: d, to: m },
    { kind: 'cubic', c1: e, c2: c, to: { ...cubic.to } },
  ];
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/** Joins the end of part `a` to the start of part `b`, where the original line had an anchor. */
function join(a: Part, b: Part, distance: number, miterLimit: number): void {
  const last = a.segments[a.segments.length - 1]!;
  const end = last.to;
  const start = b.start;
  if (Math.hypot(start.x - end.x, start.y - end.y) <= EPSILON * Math.max(1, Math.abs(distance))) {
    // A smooth anchor: the two already meet.
    a.segments[a.segments.length - 1] = { ...last, to: { ...start } };
    return;
  }
  const tA = a.endTangent;
  const tB = b.startTangent;
  const denominator = cross(tA, tB);
  const gap = { x: start.x - end.x, y: start.y - end.y };
  const lineA = last.kind === 'line';
  const lineB = b.segments[0]!.kind === 'line';
  const bevel = (): void => {
    a.segments.push({ kind: 'line', to: { ...start } });
  };
  if (Math.abs(denominator) < 1e-12) return bevel();
  // end + u·tA = start + v·tB
  const u = cross(gap, tB) / denominator;
  const v = cross(gap, tA) / denominator;
  const meet = { x: end.x + tA.x * u, y: end.y + tA.y * u };

  if (u >= 0 && v <= 0) {
    // The outer side of the corner: extend both sides to a point.
    const corner = a.endAnchor;
    if (Math.hypot(meet.x - corner.x, meet.y - corner.y) > miterLimit * Math.abs(distance)) return bevel();
    if (lineA) a.segments[a.segments.length - 1] = { kind: 'line', to: meet };
    else a.segments.push({ kind: 'line', to: meet });
    if (lineB) b.start = { ...meet };
    else a.segments.push({ kind: 'line', to: { ...start } });
    return;
  }
  if (u < 0 && v > 0 && lineA && lineB) {
    // The inner side between two straight segments: trim both where they cross,
    // unless that would use up either one.
    const fromA = a.segments.length > 1 ? a.segments[a.segments.length - 2]!.to : a.start;
    const lengthA = Math.hypot(end.x - fromA.x, end.y - fromA.y);
    const toB = b.segments[0]!.to;
    const lengthB = Math.hypot(toB.x - start.x, toB.y - start.y);
    if (-u < lengthA && v < lengthB) {
      a.segments[a.segments.length - 1] = { kind: 'line', to: meet };
      b.start = { ...meet };
      return;
    }
  }
  bevel();
}
