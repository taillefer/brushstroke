import type { Tuning } from '../tuning';
import type { Point, Segment, SvgLine } from '../types';

/** Distance between points on a flattened line, in pixels. A sampling resolution, not part of the look. */
export const POINT_SPACING = 1;
// How finely a curve is sampled before it is spread out evenly, in samples per pixel of length.
const CURVE_SAMPLES_PER_PIXEL = 4;
// How far before and after a point to look when measuring how much the line turns there, in pixels.
const TURN_WINDOW = 2;

export interface LinePoint extends Point {
  /** Distance from the start of the line, in pixels. */
  distance: number;
  /** True for an anchor point of the SVG: the start, or the end of a segment. */
  anchor: boolean;
  /** True where the line turns sharply: the sharpest point of a turn larger than `cornerAngle`. */
  corner: boolean;
  /** How much the line turns at this point, in radians, measured over a few pixels. */
  turn: number;
}

export interface FlatLine {
  points: LinePoint[];
  closed: boolean;
  length: number;
  color: string;
}

/**
 * Turns a line of segments into points about `spacing` apart, and marks the
 * anchors and the corners.
 */
export function flattenLine(line: SvgLine, tuning: Pick<Tuning, 'cornerAngle'>, spacing = POINT_SPACING): FlatLine {
  const points: LinePoint[] = [{ ...line.start, distance: 0, anchor: true, corner: false, turn: 0 }];
  let from = line.start;
  let distance = 0;

  for (const segment of line.segments) {
    const dense = sampleSegment(from, segment);
    const lengths = cumulativeLengths(dense);
    const length = lengths[lengths.length - 1]!;
    const count = Math.max(1, Math.ceil(length / spacing));
    // Targets only grow, so the search goes on from where the last one stopped.
    const cursor = { index: 1 };
    for (let i = 1; i <= count; i++) {
      const target = (length * i) / count;
      const point = i === count ? segment.to : pointAtLength(dense, lengths, target, cursor);
      points.push({ ...point, distance: distance + target, anchor: i === count, corner: false, turn: 0 });
    }
    distance += length;
    from = segment.to;
  }

  markCorners(points, line.closed, tuning.cornerAngle, spacing);
  return { points, closed: line.closed, length: distance, color: line.color };
}

/** Recomputes `distance` along the points, for example after reordering them. */
export function withDistances(points: LinePoint[]): LinePoint[] {
  let distance = 0;
  return points.map((point, i) => {
    if (i > 0) distance += Math.hypot(point.x - points[i - 1]!.x, point.y - points[i - 1]!.y);
    return { ...point, distance };
  });
}

/** Points along a segment, as x and y arrays. A curve is sampled finely enough to measure its length. */
function sampleSegment(from: Point, segment: Segment): Samples {
  if (segment.kind === 'line') return { xs: [from.x, segment.to.x], ys: [from.y, segment.to.y] };
  const { c1, c2, to } = segment;
  // The control polygon is never shorter than the curve, so this gives enough samples.
  const roughLength = Math.hypot(c1.x - from.x, c1.y - from.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y)
    + Math.hypot(to.x - c2.x, to.y - c2.y);
  const count = Math.max(2, Math.ceil(roughLength * CURVE_SAMPLES_PER_PIXEL));
  const xs = new Float64Array(count + 1);
  const ys = new Float64Array(count + 1);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    xs[i] = u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x;
    ys[i] = u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y;
  }
  return { xs, ys };
}

interface Samples {
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
}

function cumulativeLengths({ xs, ys }: Samples): Float64Array {
  const lengths = new Float64Array(xs.length);
  for (let i = 1; i < xs.length; i++) {
    lengths[i] = lengths[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!);
  }
  return lengths;
}

/**
 * The point at `target` along the samples. `cursor.index` is where to start
 * looking; it is left at the piece found, so increasing targets take linear
 * time in total.
 */
function pointAtLength({ xs, ys }: Samples, lengths: Float64Array, target: number, cursor: { index: number }): Point {
  let i = cursor.index;
  while (i < lengths.length - 1 && lengths[i]! < target) i++;
  cursor.index = i;
  const span = lengths[i]! - lengths[i - 1]!;
  const t = span > 0 ? (target - lengths[i - 1]!) / span : 0;
  return { x: xs[i - 1]! + (xs[i]! - xs[i - 1]!) * t, y: ys[i - 1]! + (ys[i]! - ys[i - 1]!) * t };
}

/**
 * Marks a point as a corner when the direction before it and the direction
 * after it differ by more than `cornerAngle`. Only the sharpest point of each
 * turn is marked, so one corner is one point.
 */
function markCorners(points: LinePoint[], closed: boolean, cornerAngle: number, spacing: number): void {
  const limit = (cornerAngle * Math.PI) / 180;
  // A closed line repeats its first point at the end. Leave the copy out while measuring.
  const count = closed ? points.length - 1 : points.length;
  const reach = Math.max(1, Math.round(TURN_WINDOW / spacing));
  const at = (i: number): LinePoint | undefined =>
    closed ? points[((i % count) + count) % count] : points[i];

  const turns = points.slice(0, count).map((point, i) => {
    const before = at(i - reach);
    const after = at(i + reach);
    if (!before || !after) return 0;
    const a = Math.atan2(point.y - before.y, point.x - before.x);
    const b = Math.atan2(after.y - point.y, after.x - point.x);
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  });

  turns.forEach((turn, i) => (points[i]!.turn = turn));
  if (closed && count > 0) points[count]!.turn = turns[0]!;

  for (let i = 0; i < count; i++) {
    const turn = turns[i]!;
    if (turn <= limit) continue;
    let sharpest = true;
    for (let k = -reach; k <= reach && sharpest; k++) {
      const j = closed ? (((i + k) % count) + count) % count : i + k;
      if (k === 0 || j < 0 || j >= count) continue;
      // Ties go to the earlier point, so a flat-topped peak gives one corner.
      if (turns[j]! > turn || (turns[j] === turn && k < 0)) sharpest = false;
    }
    if (sharpest) points[i]!.corner = true;
  }
  if (closed && count > 0) points[count]!.corner = points[0]!.corner;
}
