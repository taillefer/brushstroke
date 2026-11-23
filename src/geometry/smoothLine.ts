import type { Point, Segment } from '../types';

export interface SmoothLineOptions {
  /** The last point joins the first with a curve too, and the curve has no ends. Default false. */
  closed?: boolean;
  /**
   * How tight the curve is pulled, from 0 (a Catmull-Rom spline, the default)
   * to 1 (straight lines between the points). Values in between shorten the
   * tangents, so the curve bends more at the points and less between them.
   */
  tension?: number;
}

/**
 * Segments for a smooth line through every point: a centripetal Catmull-Rom
 * spline, written as cubic Bézier segments. Use them as the `segments` of a
 * line that starts at `points[0]`.
 *
 * Centripetal (α = 0.5) rather than uniform: where points are unevenly
 * spaced, a uniform spline overshoots and can make loops and cusps, and the
 * centripetal one never does. The curve has continuous tangents at every
 * point. An open line ends with no bend: its first and last segments head
 * straight at the next point, as if the line continued in a mirror image.
 * A closed line gets one more segment, from the last point back to the
 * first, which is the closing segment of `SvgLine`.
 *
 * Points that repeat the point before them are skipped (for a closed line,
 * also a last point that repeats the first). Fewer than 2 distinct points
 * give no segments. Pure geometry: the same points always give the same
 * segments.
 */
export function smoothLine(points: readonly Point[], options: SmoothLineOptions = {}): Segment[] {
  const closed = options.closed ?? false;
  const tension = options.tension ?? 0;
  if (!(tension >= 0 && tension <= 1)) throw new RangeError('brushstroke: smoothLine needs a tension from 0 to 1');
  const ring = distinct(points, closed);
  const n = ring.length;
  if (n < 2) return [];

  // The point before the first and after the last: the next one, mirrored, for an open line.
  const at = (i: number): Point => {
    if (closed) return ring[((i % n) + n) % n]!;
    if (i < 0) return mirror(ring[0]!, ring[1]!);
    if (i >= n) return mirror(ring[n - 1]!, ring[n - 2]!);
    return ring[i]!;
  };
  const keep = 1 - tension;
  const segments: Segment[] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const [c1, c2] = catmullRomControls(p0, p1, p2, p3);
    segments.push({
      kind: 'cubic',
      c1: { x: p1.x + (c1.x - p1.x) * keep, y: p1.y + (c1.y - p1.y) * keep },
      c2: { x: p2.x + (c2.x - p2.x) * keep, y: p2.y + (c2.y - p2.y) * keep },
      to: { x: p2.x, y: p2.y },
    });
  }
  return segments;
}

/**
 * Straight segments through every point, for lines meant to be drawn
 * straight. Use them as the `segments` of a line that starts at
 * `points[0]`. With `closed`, a last segment goes back to the first point,
 * unless the last point already repeats it.
 */
export function straightLine(points: readonly Point[], closed = false): Segment[] {
  if (points.length < 2) return [];
  const segments: Segment[] = points.slice(1).map((p): Segment => ({ kind: 'line', to: { x: p.x, y: p.y } }));
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (closed && (first.x !== last.x || first.y !== last.y)) segments.push({ kind: 'line', to: { x: first.x, y: first.y } });
  return segments;
}

function distinct(points: readonly Point[], closed: boolean): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  if (closed && out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (first.x === last.x && first.y === last.y) out.pop();
  }
  return out;
}

function mirror(about: Point, p: Point): Point {
  return { x: 2 * about.x - p.x, y: 2 * about.y - p.y };
}

/**
 * The Bézier control points of the centripetal Catmull-Rom piece from p1 to
 * p2 (Yuksel, Schaefer and Keyser, "Parameterization and applications of
 * Catmull-Rom curves", 2011), with knot spacing |pᵢ₊₁ − pᵢ|^0.5.
 */
function catmullRomControls(p0: Point, p1: Point, p2: Point, p3: Point): [Point, Point] {
  const d1 = Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y));
  const d2 = Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y));
  const d3 = Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y));
  const c1 = d1 > 0
    ? combine(p2, d1 * d1, p0, -d2 * d2, p1, 2 * d1 * d1 + 3 * d1 * d2 + d2 * d2, 3 * d1 * (d1 + d2))
    : p1;
  const c2 = d3 > 0
    ? combine(p1, d3 * d3, p3, -d2 * d2, p2, 2 * d3 * d3 + 3 * d3 * d2 + d2 * d2, 3 * d3 * (d3 + d2))
    : p2;
  return [c1, c2];
}

function combine(a: Point, wa: number, b: Point, wb: number, c: Point, wc: number, divisor: number): Point {
  return { x: (a.x * wa + b.x * wb + c.x * wc) / divisor, y: (a.y * wa + b.y * wb + c.y * wc) / divisor };
}
