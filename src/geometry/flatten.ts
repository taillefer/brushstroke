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
  /** True where the line turns sharply. */
  corner: boolean;
}

export interface FlatLine {
  points: LinePoint[];
  closed: boolean;
  length: number;
  color: string;
}

/**
 * Turns a line of segments into points about `POINT_SPACING` apart, and
 * marks the anchors and the corners.
 */
export function flattenLine(line: SvgLine, tuning: Pick<Tuning, 'cornerAngle'>): FlatLine {
  const points: LinePoint[] = [{ ...line.start, distance: 0, anchor: true, corner: false }];
  let from = line.start;
  let distance = 0;

  for (const segment of line.segments) {
    const dense = sampleSegment(from, segment);
    const lengths = cumulativeLengths(dense);
    const length = lengths[lengths.length - 1]!;
    const count = Math.max(1, Math.ceil(length / POINT_SPACING));
    for (let i = 1; i <= count; i++) {
      const target = (length * i) / count;
      const point = i === count ? segment.to : pointAtLength(dense, lengths, target);
      points.push({ ...point, distance: distance + target, anchor: i === count, corner: false });
    }
    distance += length;
    from = segment.to;
  }

  markCorners(points, line.closed, tuning.cornerAngle);
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

function sampleSegment(from: Point, segment: Segment): Point[] {
  if (segment.kind === 'line') return [from, segment.to];
  const { c1, c2, to } = segment;
  // The control polygon is never shorter than the curve, so this gives enough samples.
  const roughLength = Math.hypot(c1.x - from.x, c1.y - from.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y)
    + Math.hypot(to.x - c2.x, to.y - c2.y);
  const count = Math.max(2, Math.ceil(roughLength * CURVE_SAMPLES_PER_PIXEL));
  const samples: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    samples.push({
      x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
      y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
    });
  }
  return samples;
}

function cumulativeLengths(points: Point[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  }
  return lengths;
}

function pointAtLength(points: Point[], lengths: number[], target: number): Point {
  let i = 1;
  while (i < lengths.length - 1 && lengths[i]! < target) i++;
  const a = points[i - 1]!;
  const b = points[i]!;
  const span = lengths[i]! - lengths[i - 1]!;
  const t = span > 0 ? (target - lengths[i - 1]!) / span : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Marks a point as a corner when the direction before it and the direction
 * after it differ by more than `cornerAngle`. Only the sharpest point of each
 * turn is marked, so one corner is one point.
 */
function markCorners(points: LinePoint[], closed: boolean, cornerAngle: number): void {
  const limit = (cornerAngle * Math.PI) / 180;
  // A closed line repeats its first point at the end. Leave the copy out while measuring.
  const count = closed ? points.length - 1 : points.length;
  const reach = Math.max(1, Math.round(TURN_WINDOW / POINT_SPACING));
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
