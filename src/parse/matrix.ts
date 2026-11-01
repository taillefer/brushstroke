import type { Point, Segment, Subpath } from '../types';

/** An affine transform [a, b, c, d, e, f], as in SVG's matrix(a b c d e f). */
export type Matrix = readonly [number, number, number, number, number, number];

export const identity: Matrix = [1, 0, 0, 1, 0, 0];

/** The transform that applies `inner` first and then `outer`. */
export function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyToPoint(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Transforms every point, including Bézier control points. This is exact for affine transforms. */
export function applyToSubpath(m: Matrix, subpath: Subpath): Subpath {
  const at = (p: Point) => applyToPoint(m, p);
  return {
    start: at(subpath.start),
    closed: subpath.closed,
    segments: subpath.segments.map(
      (s): Segment =>
        s.kind === 'line'
          ? { kind: 'line', to: at(s.to) }
          : { kind: 'cubic', c1: at(s.c1), c2: at(s.c2), to: at(s.to) },
    ),
  };
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (x: number, y: number): Matrix => [x, 0, 0, y, 0, 0];

/**
 * Parses an SVG `transform` attribute, such as
 * `translate(10 20) rotate(45, 5, 5) scale(2)`. Stops at the first invalid
 * part and returns what it has read so far.
 */
export function parseTransform(text: string | null | undefined): Matrix {
  if (!text) return identity;
  let result = identity;
  const call = /\s*,?\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gy;
  let match: RegExpExecArray | null;
  while ((match = call.exec(text))) {
    const name = match[1];
    const args = (match[2] ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (args.some(Number.isNaN)) break;
    const m = toMatrix(name, args);
    if (!m) break;
    result = multiply(result, m);
  }
  return result;
}

function toMatrix(name: string | undefined, args: number[]): Matrix | null {
  const [a = 0, b, c, d, e, f] = args;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  switch (name) {
    case 'matrix':
      return args.length === 6 ? [a, b!, c!, d!, e!, f!] : null;
    case 'translate':
      return translate(a, b ?? 0);
    case 'scale':
      return scale(a, b ?? a);
    case 'rotate': {
      const cos = Math.cos(rad(a));
      const sin = Math.sin(rad(a));
      const rotation: Matrix = [cos, sin, -sin, cos, 0, 0];
      if (b === undefined) return rotation;
      return multiply(translate(b, c ?? 0), multiply(rotation, translate(-b, -(c ?? 0))));
    }
    case 'skewX':
      return [1, 0, Math.tan(rad(a)), 1, 0, 0];
    case 'skewY':
      return [1, Math.tan(rad(a)), 0, 1, 0, 0];
    default:
      return null;
  }
}
