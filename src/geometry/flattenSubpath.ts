import type { Point, Segment, Subpath } from '../types';

/**
 * Turns a subpath into points, with no point of the true curve farther than
 * `tolerance` from the polyline. Straight segments add only their end, and each
 * cubic gets as many even steps as its bend needs (Wang's formula), so flat
 * curves get few points and tight ones many.
 *
 * The first point is the start. For a closed subpath the end point repeats the
 * start, so it is left out: the result is a ring.
 */
export function flattenSubpath(subpath: Subpath, tolerance: number): Point[] {
  if (!(tolerance > 0)) throw new RangeError('brushstroke: flattenSubpath needs a tolerance above 0');
  const points: Point[] = [{ ...subpath.start }];
  let from = subpath.start;
  for (const segment of subpath.segments) {
    flattenSegment(from, segment, tolerance, points);
    from = segment.to;
  }
  const last = points[points.length - 1]!;
  if (subpath.closed && points.length > 1 && last.x === subpath.start.x && last.y === subpath.start.y) points.pop();
  return points;
}

// A cubic never needs more steps than this, so a curve with huge control points cannot use up memory.
const MAX_STEPS = 1000;

function flattenSegment(from: Point, segment: Segment, tolerance: number, out: Point[]): void {
  if (segment.kind === 'line') {
    out.push({ ...segment.to });
    return;
  }
  const { c1, c2, to } = segment;
  // Wang's formula: n = sqrt(3 · 2 / 8 · M / tolerance), where M is the largest second difference
  // of the control points. Steps of 1/n in t then stay within the tolerance.
  const m = Math.max(
    Math.hypot(from.x - 2 * c1.x + c2.x, from.y - 2 * c1.y + c2.y),
    Math.hypot(c1.x - 2 * c2.x + to.x, c1.y - 2 * c2.y + to.y),
  );
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.sqrt((0.75 * m) / tolerance))));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
      y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
    });
  }
  out.push({ ...to });
}
