import type { Point } from '../types';

export interface StrokeOutlineOptions {
  /** How corners are joined. Default `round`. */
  join?: 'round' | 'miter' | 'bevel';
  /** How open ends look. Default `round`. */
  cap?: 'round' | 'butt' | 'square';
  /** For `miter` joins: corners whose miter is longer than this many widths are bevelled, as in SVG. Default 4. */
  miterLimit?: number;
  /** Treat the points as a ring: the last point joins the first, and there are no caps. Default false. */
  closed?: boolean;
  /**
   * Largest distance between a round cap or join and the polygon that stands
   * in for it, in the units of the points. Default: 1% of the width.
   */
  tolerance?: number;
}

/**
 * The area a stroke along `points` covers, `width` wide, as one polygon:
 * the left side with its joins, the end cap, the right side backwards and the
 * start cap. The first point is not repeated at the end.
 *
 * The polygon is meant to be filled with the nonzero rule, or passed to one
 * union (for example polyclip-ts, which reads rings with the nonzero rule)
 * that turns it into clean rings. It is the sum of one rectangle per segment
 * and one wedge per join, all wound the same way, so every point of the
 * stroke has a winding number of at least 1 and every point outside has 0.
 *
 * It does intersect itself in places, and these remain for the fill or the
 * union to resolve:
 * - On the inside of a bend, the side steps back through the corner point
 *   when the segments are too short for the two edges to meet (dense points,
 *   tight bends, or a bend tighter than the width). Where the segments are long
 *   enough the edges are cut where they meet instead, and nothing is left over.
 * - Where the line crosses or comes back near itself, the sides cross too.
 * - A closed line's outline covers the first segment twice.
 * Filling it with the even-odd rule would show those places as holes.
 *
 * Simplifying the points first, for example with `simplify(points, width / 20)`,
 * keeps the polygon small and leaves fewer short segments.
 */
export function strokeOutline(points: readonly Point[], width: number, options: StrokeOutlineOptions = {}): Point[] {
  const r = width / 2;
  if (!(r > 0) || points.length === 0) return [];
  const settings: Settings = {
    r,
    join: options.join ?? 'round',
    miterLimit: options.miterLimit ?? 4,
    tolerance: options.tolerance ?? width / 100,
    arcStep: arcStep(r, options.tolerance ?? width / 100),
  };
  const cap = options.cap ?? 'round';

  let line = withoutRepeats(points, r * 1e-9);
  if (options.closed) {
    if (line.length > 1 && distance(line[0]!, line[line.length - 1]!) <= r * 1e-9) line.pop();
    if (line.length >= 3) {
      // Going round once more past the start gives the join at the start. The ends then meet
      // with butt caps whose edges cancel, so the first segment is covered twice.
      line = [...line, line[0]!, line[1]!];
      return [...side(line, settings, true), ...side(line.slice().reverse(), settings, false)];
    }
  }

  if (line.length === 1) return dot(line[0]!, cap, settings);
  const reversed = line.slice().reverse();
  return [
    ...side(line, settings, true),
    ...capPoints(reversed[1]!, reversed[0]!, cap, settings),
    ...side(reversed, settings, false),
    ...capPoints(line[1]!, line[0]!, cap, settings),
  ];
}

interface Settings {
  r: number;
  join: 'round' | 'miter' | 'bevel';
  miterLimit: number;
  tolerance: number;
  /** Largest angle of one straight piece of an arc, in radians. */
  arcStep: number;
}

function arcStep(r: number, tolerance: number): number {
  // A chord over angle a is at most r·(1 − cos(a/2)) from the arc.
  const ratio = 1 - Math.min(Math.max(tolerance, 1e-12 * r), r) / r;
  return Math.min(Math.PI / 2, 2 * Math.acos(ratio));
}

/**
 * The left side of the line, from the start to the end. The right side is the
 * left side of the reversed line. `first` breaks the tie for a 180° turn: one
 * side has to take the round end, and the first side does.
 */
function side(line: readonly Point[], s: Settings, first: boolean): Point[] {
  const { r } = s;
  const out: Point[] = [];
  const count = line.length - 1;
  const directions: Point[] = [];
  const lengths: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const length = distance(a, b);
    lengths.push(length);
    directions.push({ x: (b.x - a.x) / length, y: (b.y - a.y) / length });
  }
  const normal = (d: Point): Point => ({ x: -d.y, y: d.x });
  const offset = (p: Point, n: Point): Point => ({ x: p.x + n.x * r, y: p.y + n.y * r });

  out.push(offset(line[0]!, normal(directions[0]!)));
  for (let j = 1; j < count; j++) {
    const p = line[j]!;
    const da = directions[j - 1]!;
    const db = directions[j]!;
    const na = normal(da);
    const nb = normal(db);
    const cross = da.x * db.y - da.y * db.x;
    const dotProduct = da.x * db.x + da.y * db.y;
    // The signed turn from one segment to the next. Positive turns towards this side.
    let turn = Math.atan2(cross, dotProduct);
    if (Math.abs(cross) < 1e-12 && dotProduct < 0) turn = first ? -Math.PI : Math.PI;
    const endA = offset(p, na);
    const startB = offset(p, nb);

    if (Math.abs(turn) < 1e-9) {
      out.push(endA);
    } else if (turn > 0) {
      // The inside of the bend. Where both segments are long enough, cut the two edges where
      // they meet; otherwise step back through the corner point, which keeps the winding right.
      const cut = r * Math.tan(turn / 2);
      if (turn < Math.PI * 0.99 && cut <= lengths[j - 1]! / 2 && cut <= lengths[j]! / 2) {
        out.push(miterPoint(p, na, nb, r));
      } else {
        out.push(endA, { x: p.x, y: p.y }, startB);
      }
    } else {
      // The outside of the bend. A gentle round join is one miter point when that point is
      // within the tolerance of the arc, which halves the points along smooth curves.
      if (s.join === 'round' && r * (1 / Math.cos(turn / 2) - 1) <= s.tolerance) {
        out.push(miterPoint(p, na, nb, r));
        continue;
      }
      out.push(endA);
      if (s.join === 'round') {
        out.push(...arc(p, Math.atan2(na.y, na.x), turn, s));
      } else if (s.join === 'miter' && 1 / Math.cos(turn / 2) <= s.miterLimit) {
        out.push(miterPoint(p, na, nb, r));
      }
      out.push(startB);
    }
  }
  out.push(offset(line[count]!, normal(directions[count - 1]!)));
  return out;
}

/** Where the two offset edges meet. */
function miterPoint(p: Point, na: Point, nb: Point, r: number): Point {
  const k = r / (1 + na.x * nb.x + na.y * nb.y);
  return { x: p.x + (na.x + nb.x) * k, y: p.y + (na.y + nb.y) * k };
}

/** The points strictly between the start and the end of an arc around `c`. */
function arc(c: Point, from: number, sweep: number, s: Settings): Point[] {
  const steps = Math.ceil(Math.abs(sweep) / s.arcStep - 1e-9);
  const out: Point[] = [];
  for (let i = 1; i < steps; i++) {
    const a = from + (sweep * i) / steps;
    out.push({ x: c.x + Math.cos(a) * s.r, y: c.y + Math.sin(a) * s.r });
  }
  return out;
}

/** The cap at `end`, reached from `before`: from the left side round to the right side. */
function capPoints(before: Point, end: Point, cap: 'round' | 'butt' | 'square', s: Settings): Point[] {
  const length = distance(before, end);
  const d = { x: (end.x - before.x) / length, y: (end.y - before.y) / length };
  if (cap === 'round') return arc(end, Math.atan2(d.x, -d.y), -Math.PI, s);
  if (cap === 'butt') return [];
  const { r } = s;
  return [
    { x: end.x + (d.x - d.y) * r, y: end.y + (d.y + d.x) * r },
    { x: end.x + (d.x + d.y) * r, y: end.y + (d.y - d.x) * r },
  ];
}

/** A stroke of a single point: a circle or square for those caps, nothing for butt, as in SVG. */
function dot(p: Point, cap: 'round' | 'butt' | 'square', s: Settings): Point[] {
  const { r } = s;
  if (cap === 'butt') return [];
  if (cap === 'square') {
    return [{ x: p.x - r, y: p.y - r }, { x: p.x + r, y: p.y - r }, { x: p.x + r, y: p.y + r }, { x: p.x - r, y: p.y + r }];
  }
  return [{ x: p.x + r, y: p.y }, ...arc(p, 0, 2 * Math.PI, s)];
}

function withoutRepeats(points: readonly Point[], epsilon: number): Point[] {
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    if (distance(points[i]!, out[out.length - 1]!) > epsilon) out.push(points[i]!);
  }
  return out;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
