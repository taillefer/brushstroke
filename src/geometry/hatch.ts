// Brush strokes that fill an area the way a painter does: rows of strokes in
// one direction, each starting and ending inside the area, and strokes that
// follow the edge just inside it. Plain geometry; paint the result with
// `paintLines`.

import { createRandom, hashText } from '../random';
import type { Rect } from '../strokePlan';
import type { Point, SvgLine } from '../types';
import { dashLine } from './dash';
import { offsetLine } from './offset';
import { straightLine } from './smoothLine';

export interface HatchOptions {
  /** Distance between rows of strokes, in line units. */
  spacing: number;
  /** Typical stroke length, in line units. Each stroke varies by ±20 %. */
  length: number;
  /** Direction of the rows, in degrees from the x axis, clockwise on screen. Default 0. */
  angle?: number;
  /** How far a stroke may turn from `angle`, in degrees. Default 0. */
  angleJitter?: number;
  /** How far a stroke may curve sideways, as a share of its length. Default 0. */
  bend?: number;
  /** How much neighbouring strokes in a row overlap, as a share of `length`. Default 0.25. */
  overlap?: number;
  /**
   * How far inside the edge every stroke starts and ends, in line units,
   * measured along its row. Where the row meets the edge at a slant, the
   * distance straight to the edge is shorter. Default 0.
   */
  inset?: number;
  /** Strokes cut shorter than this by the edge are left out, in line units. Default a quarter of `length`. */
  minLength?: number;
  /** Put before every stroke's seed. Default `'h'`. */
  seed?: string | number;
  /** Only strokes that can reach into this rectangle, in line units. */
  bounds?: Rect;
  /** Colour of the strokes. Default `'#000000'`. */
  color?: string;
  /**
   * How strongly strokes near the edge turn to run along it, from 0 (not at
   * all, the default) to 1 (fully, right at the edge). The pull fades out
   * over `flowDistance` from the edge. A turned stroke is shortened until
   * both its ends are inside the area.
   */
  flow?: number;
  /** How far from the edge strokes feel the pull of `flow`, in line units. Default `length`. */
  flowDistance?: number;
  /** The rings whose edges pull strokes with `flow`. Default all of `rings`; leave out a border that is not a real edge, such as the map's frame. */
  flowEdges?: readonly (readonly Point[])[];
  /**
   * Strokes per load of paint, on average. Each row is painted in cycles of
   * about this many strokes; a stroke's `load` tells where in its cycle it
   * is. 0 (the default) gives every stroke a `load` of 0.
   */
  loadCycle?: number;
}

/** A fill stroke, with where it falls in its load of paint: 0 just after the brush was dipped, 1 the last before the next dip. */
export type HatchLine = SvgLine & { load: number };

/** Whether `p` is inside the rings, by the even-odd rule. */
export function insideRings(rings: readonly (readonly Point[])[], p: Point): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

/**
 * Strokes that fill the area inside `rings` (holes by the even-odd rule).
 *
 * The strokes lie on a grid fixed to the line coordinates: rows `spacing`
 * apart in the direction `angle`, and places along each row, each with its
 * own seed from its row and place. The area only decides which strokes are
 * kept and where they are cut. So when the area changes, strokes away from
 * the changed edge stay exactly as they were, and two areas that touch use
 * the same grid. A stroke that would leave the area is cut `inset` inside
 * the edge, and one that would cross a hole becomes two.
 */
export function hatchArea(rings: readonly (readonly Point[])[], options: HatchOptions): HatchLine[] {
  const { spacing, length } = options;
  if (!(spacing > 0) || !(length > 0)) return [];
  const angle = ((options.angle ?? 0) * Math.PI) / 180;
  const jitter = ((options.angleJitter ?? 0) * Math.PI) / 180;
  const bend = options.bend ?? 0;
  const step = length * (1 - Math.min(0.9, Math.max(0, options.overlap ?? 0.25)));
  const inset = Math.max(0, options.inset ?? 0);
  const minLength = options.minLength ?? length / 4;
  const prefix = String(options.seed ?? 'h');
  const color = options.color ?? '#000000';

  // Along the rows (a) and across them (b).
  const u = { x: Math.cos(angle), y: Math.sin(angle) };
  const toA = (p: Point) => p.x * u.x + p.y * u.y;
  const toB = (p: Point) => -p.x * u.y + p.y * u.x;
  const fromAB = (a: number, b: number): Point => ({ x: a * u.x - b * u.y, y: a * u.y + b * u.x });
  const rotated = rings.filter((r) => r.length >= 3).map((ring) => ring.map((p) => ({ a: toA(p), b: toB(p) })));
  if (rotated.length === 0) return [];

  let bMin = Infinity;
  let bMax = -Infinity;
  let aMin = Infinity;
  let aMax = -Infinity;
  for (const ring of rotated) {
    for (const p of ring) {
      bMin = Math.min(bMin, p.b);
      bMax = Math.max(bMax, p.b);
      aMin = Math.min(aMin, p.a);
      aMax = Math.max(aMax, p.a);
    }
  }
  if (options.bounds) {
    // The bounds in rotated coordinates, grown by a stroke so strokes that reach in are kept.
    const { x, y, width, height } = options.bounds;
    const corners = [{ x, y }, { x: x + width, y }, { x, y: y + height }, { x: x + width, y: y + height }];
    const as = corners.map(toA);
    const bs = corners.map(toB);
    aMin = Math.max(aMin, Math.min(...as) - length * 1.5);
    aMax = Math.min(aMax, Math.max(...as) + length * 1.5);
    bMin = Math.max(bMin, Math.min(...bs) - length);
    bMax = Math.min(bMax, Math.max(...bs) + length);
    if (aMin > aMax || bMin > bMax) return [];
  }

  const flow = Math.min(1, Math.max(0, options.flow ?? 0));
  const flowDistance = options.flowDistance ?? length;
  const edges = flow > 0 ? edgeSegments(options.flowEdges ?? rings) : [];
  const loadCycle = Math.max(0, options.loadCycle ?? 0);

  const lines: HatchLine[] = [];
  for (let row = Math.floor(bMin / spacing) - 1; row <= Math.ceil(bMax / spacing) + 1; row++) {
    const rowRandom = createRandom(hashText(`${prefix}:${row}`));
    // The row wanders a little, so rows do not read as ruled lines.
    const b = (row + 0.5 + (rowRandom.next() - 0.5) * 0.5) * spacing;
    const spans = rowSpans(rotated, b, inset);
    if (spans.length === 0) continue;
    const phase = rowRandom.next() * step;
    const first = Math.floor((aMin - phase - length * 1.2) / step);
    const last = Math.ceil((aMax - phase) / step);
    // Drawn after the row's other numbers, so turning the cycles on does not move the strokes.
    const cycle = loadCycle > 0 ? Math.max(1, Math.round(loadCycle * (0.75 + 0.5 * rowRandom.next()))) : 1;
    const cycleOffset = Math.floor(rowRandom.next() * cycle);
    for (let place = first; place <= last; place++) {
      const own = createRandom(hashText(`${prefix}:${row}:${place}`));
      const start = phase + place * step + (own.next() - 0.5) * step * 0.3;
      const end = start + length * (0.8 + 0.4 * own.next());
      const turn = jitter * (own.next() * 2 - 1);
      const sideways = bend * (own.next() * 2 - 1);
      let piece = 0;
      for (const [s0, s1] of spans) {
        const a0 = Math.max(start, s0);
        const a1 = Math.min(end, s1);
        if (a1 - a0 < minLength) continue;
        const seed = `${prefix}:${row}:${place}${piece ? `/${piece}` : ''}`;
        const k = (((place + cycleOffset) % cycle) + cycle) % cycle;
        const load = cycle > 1 ? k / (cycle - 1) : 0;
        const flowed = flow > 0 ? flowStroke(rings, edges, fromAB, u, a0, a1, b, turn, sideways, flow, flowDistance, minLength, color, seed) : undefined;
        if (flowed === null) continue;
        lines.push({ ...(flowed ?? stroke(fromAB, a0, a1, b, turn, sideways, color, seed)), load });
        piece++;
      }
    }
  }
  if (!options.bounds) return lines;
  const { x, y, width, height } = options.bounds;
  return lines.filter((line) => {
    const to = line.segments[line.segments.length - 1]!.to;
    const reach = Math.hypot(to.x - line.start.x, to.y - line.start.y);
    const minX = Math.min(line.start.x, to.x) - reach * bend;
    const maxX = Math.max(line.start.x, to.x) + reach * bend;
    const minY = Math.min(line.start.y, to.y) - reach * bend;
    const maxY = Math.max(line.start.y, to.y) + reach * bend;
    return maxX >= x && minX <= x + width && maxY >= y && minY <= y + height;
  });
}

type Edge = { a: Point; b: Point };

function edgeSegments(rings: readonly (readonly Point[])[]): Edge[] {
  const out: Edge[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length; i++) out.push({ a: ring[i]!, b: ring[(i + 1) % ring.length]! });
  }
  return out;
}

/** The nearest edge to `p`: its distance and its unit direction. */
function nearestEdge(edges: Edge[], p: Point): { distance: number; dir: Point } | undefined {
  let best: { distance: number; dir: Point } | undefined;
  for (const { a, b } of edges) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = dx * dx + dy * dy;
    if (span === 0) continue;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / span));
    const distance = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    if (!best || distance < best.distance) {
      const length = Math.sqrt(span);
      best = { distance, dir: { x: dx / length, y: dy / length } };
    }
  }
  return best;
}

/**
 * The stroke from `a0` to `a1` on row `b`, turned towards the nearest edge's
 * direction by how close it is. Undefined when the edge is too far to pull
 * (paint the stroke as it was), null when the turned stroke cannot fit.
 */
function flowStroke(
  rings: readonly (readonly Point[])[],
  edges: Edge[],
  fromAB: (a: number, b: number) => Point,
  u: Point,
  a0: number,
  a1: number,
  b: number,
  turn: number,
  sideways: number,
  flow: number,
  flowDistance: number,
  minLength: number,
  color: string,
  seed: string,
): SvgLine | null | undefined {
  const centre = fromAB((a0 + a1) / 2, b);
  const near = nearestEdge(edges, centre);
  if (!near || !(flowDistance > 0) || near.distance >= flowDistance) return undefined;
  const t = near.distance / flowDistance;
  const pull = flow * (1 - t * t * (3 - 2 * t));
  if (pull <= 0) return undefined;
  const base = { x: u.x * Math.cos(turn) - u.y * Math.sin(turn), y: u.x * Math.sin(turn) + u.y * Math.cos(turn) };
  // An edge runs both ways: take the way closer to the stroke's own direction.
  const along = near.dir.x * base.x + near.dir.y * base.y >= 0 ? near.dir : { x: -near.dir.x, y: -near.dir.y };
  const mixed = { x: base.x + (along.x - base.x) * pull, y: base.y + (along.y - base.y) * pull };
  const norm = Math.hypot(mixed.x, mixed.y);
  if (norm === 0) return undefined;
  const dir = { x: mixed.x / norm, y: mixed.y / norm };
  let length = a1 - a0;
  // Shorten the turned stroke until both ends and its middle are inside.
  for (let tries = 0; tries < 6 && length >= minLength; tries++) {
    const half = length / 2;
    const start = { x: centre.x - dir.x * half, y: centre.y - dir.y * half };
    const end = { x: centre.x + dir.x * half, y: centre.y + dir.y * half };
    if (insideRings(rings, start) && insideRings(rings, end)) {
      const side = { x: -dir.y * sideways * length, y: dir.x * sideways * length };
      const at = (s: number, curve: number) => ({ x: start.x + (end.x - start.x) * s + side.x * curve, y: start.y + (end.y - start.y) * s + side.y * curve });
      return { start, segments: [{ kind: 'cubic', c1: at(1 / 3, 1), c2: at(2 / 3, 1), to: end }], closed: false, color, seed };
    }
    length *= 0.8;
  }
  return null;
}

/** Where the row at `b` is inside the rings, as [from, to] along the row, each shrunk by `inset` at both ends. */
function rowSpans(rings: { a: number; b: number }[][], b: number, inset: number): [number, number][] {
  const crossings: number[] = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const p = ring[i]!;
      const q = ring[j]!;
      if (p.b > b !== q.b > b) crossings.push(p.a + ((b - p.b) / (q.b - p.b)) * (q.a - p.a));
    }
  }
  crossings.sort((m, n) => m - n);
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const from = crossings[i]! + inset;
    const to = crossings[i + 1]! - inset;
    if (to > from) spans.push([from, to]);
  }
  return spans;
}

function stroke(
  fromAB: (a: number, b: number) => Point,
  a0: number,
  a1: number,
  b: number,
  turn: number,
  sideways: number,
  color: string,
  seed: string,
): SvgLine {
  const length = a1 - a0;
  const mid = (a0 + a1) / 2;
  // Turned about its middle, so the ends move least where they meet the edge.
  const at = (t: number, side: number) => {
    const along = (t - 0.5) * length;
    return fromAB(mid + along * Math.cos(turn) - side * Math.sin(turn), b + along * Math.sin(turn) + side * Math.cos(turn));
  };
  const curve = sideways * length;
  return {
    start: at(0, 0),
    segments: [{ kind: 'cubic', c1: at(1 / 3, curve), c2: at(2 / 3, curve), to: at(1, 0) }],
    closed: false,
    color,
    seed,
  };
}

export interface ContourOptions {
  /** How far inside the edge the strokes run, in line units. */
  inset: number;
  /** Length of each stroke along the edge, in line units. */
  length: number;
  /** Gap between strokes, in line units. Default 0: each stroke starts where the last ended. */
  gap?: number;
  /** Put before every stroke's seed. Default `'c'`. */
  seed?: string | number;
  /** Colour of the strokes. Default `'#000000'`. */
  color?: string;
  /** The rings to follow. Default all of `rings`; leave out a border that is not a real edge, such as the map's frame. */
  edges?: readonly (readonly Point[])[];
}

/**
 * Strokes that follow the edge of the area inside `rings`, `inset` inside it,
 * cut into pieces of `length`: how a painter paints up to a line before
 * filling the rest. Holes get strokes on their outside, which is inside the
 * area.
 */
export function contourStrokes(rings: readonly (readonly Point[])[], options: ContourOptions): SvgLine[] {
  if (!(options.length > 0)) return [];
  const prefix = String(options.seed ?? 'c');
  const color = options.color ?? '#000000';
  const out: SvgLine[] = [];
  (options.edges ?? rings).forEach((ring, k) => {
    if (ring.length < 3) return;
    const edge: SvgLine = { start: ring[0]!, segments: straightLine(ring, true), closed: true, color, seed: `${prefix}:${k}` };
    const side = inwardSide(rings, ring);
    if (side === 0) return;
    const inner = options.inset > 0 ? offsetLine(edge, side * options.inset) : edge;
    out.push(...dashLine(inner, [options.length, Math.max(0, options.gap ?? 0)]));
  });
  return out;
}

/** +1 when the area is on the right of the ring's direction of travel (on screen), -1 when on the left, 0 when unclear. */
function inwardSide(rings: readonly (readonly Point[])[], ring: readonly Point[]): number {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    // The right of the direction of travel, with y pointing down.
    const right = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const probe = Math.min(length, 1e-3 * Math.max(1, Math.abs(mid.x), Math.abs(mid.y)));
    const onRight = insideRings(rings, { x: mid.x + right.x * probe, y: mid.y + right.y * probe });
    const onLeft = insideRings(rings, { x: mid.x - right.x * probe, y: mid.y - right.y * probe });
    if (onRight !== onLeft) return onRight ? 1 : -1;
  }
  return 0;
}
