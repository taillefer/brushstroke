import type { Point, Segment, Subpath } from '../types';
import { arcToSegments } from './arc';
import { parseLength } from './length';
import { parsePathData } from './pathData';

type Attributes = Readonly<Record<string, string>>;

/**
 * The subpaths of a basic shape element, in its own coordinates. Returns null
 * for elements that are not shapes. Shapes with invalid or zero sizes give an
 * empty list, as browsers draw nothing for them.
 */
export function shapeToSubpaths(name: string, attributes: Attributes): Subpath[] | null {
  const number = (key: string, fallback = 0) => parseLength(attributes[key]) ?? fallback;

  switch (name) {
    case 'path':
      return parsePathData(attributes.d ?? '');
    case 'line': {
      const start = { x: number('x1'), y: number('y1') };
      const end = { x: number('x2'), y: number('y2') };
      return [{ start, segments: [{ kind: 'line', to: end }], closed: false }];
    }
    case 'polyline':
    case 'polygon':
      return polySubpaths(attributes.points ?? '', name === 'polygon');
    case 'rect':
      return rectSubpaths(number('x'), number('y'), number('width'), number('height'),
        parseLength(attributes.rx), parseLength(attributes.ry));
    case 'circle': {
      const r = number('r');
      return ellipseSubpaths(number('cx'), number('cy'), r, r);
    }
    case 'ellipse':
      return ellipseSubpaths(number('cx'), number('cy'), number('rx'), number('ry'));
    default:
      return null;
  }
}

function polySubpaths(text: string, closed: boolean): Subpath[] {
  const numbers = text.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const points: Point[] = [];
  // An odd number or an invalid value ends the list, as in browsers.
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const x = numbers[i]!;
    const y = numbers[i + 1]!;
    if (Number.isNaN(x) || Number.isNaN(y)) break;
    points.push({ x, y });
  }
  const [start, ...rest] = points;
  if (!start || rest.length === 0) return [];
  const segments: Segment[] = rest.map((to) => ({ kind: 'line', to }));
  if (closed) segments.push({ kind: 'line', to: start });
  return [{ start, segments, closed }];
}

function rectSubpaths(x: number, y: number, width: number, height: number,
  rxIn: number | undefined, ryIn: number | undefined): Subpath[] {
  if (width <= 0 || height <= 0) return [];
  // Per the SVG spec: a missing radius copies the other, and both are capped at half the side.
  let rx = rxIn ?? ryIn ?? 0;
  let ry = ryIn ?? rxIn ?? 0;
  rx = Math.min(Math.max(rx, 0), width / 2);
  ry = Math.min(Math.max(ry, 0), height / 2);

  if (rx === 0 || ry === 0) {
    return [{
      start: { x, y },
      segments: [
        { kind: 'line', to: { x: x + width, y } },
        { kind: 'line', to: { x: x + width, y: y + height } },
        { kind: 'line', to: { x, y: y + height } },
        { kind: 'line', to: { x, y } },
      ],
      closed: true,
    }];
  }

  // Clockwise from the end of the top-left corner, as browsers draw it.
  const segments: Segment[] = [];
  let at: Point = { x: x + rx, y };
  // A straight piece has zero length when the radius is half the side.
  const line = (to: Point) => { if (!samePoint(at, to)) segments.push({ kind: 'line', to }); at = to; };
  const corner = (to: Point) => { segments.push(...arcToSegments(at, rx, ry, 0, false, true, to)); at = to; };
  const start = at;
  line({ x: x + width - rx, y });
  corner({ x: x + width, y: y + ry });
  line({ x: x + width, y: y + height - ry });
  corner({ x: x + width - rx, y: y + height });
  line({ x: x + rx, y: y + height });
  corner({ x, y: y + height - ry });
  line({ x, y: y + ry });
  corner(start);
  return [{ start, segments, closed: true }];
}

function ellipseSubpaths(cx: number, cy: number, rx: number, ry: number): Subpath[] {
  if (rx <= 0 || ry <= 0) return [];
  // Starts at the rightmost point and goes clockwise on screen, like browsers.
  const points: Point[] = [
    { x: cx + rx, y: cy },
    { x: cx, y: cy + ry },
    { x: cx - rx, y: cy },
    { x: cx, y: cy - ry },
  ];
  const segments: Segment[] = [];
  for (let i = 0; i < 4; i++) {
    segments.push(...arcToSegments(points[i]!, rx, ry, 0, false, true, points[(i + 1) % 4]!));
  }
  return [{ start: points[0]!, segments, closed: true }];
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}
