import type { Point, Segment } from '../types';

/**
 * Converts an SVG elliptical arc into cubic Bézier segments, at most a quarter
 * turn each. Follows the SVG spec's conversion from endpoint to center
 * parameters (SVG 1.1, appendix F.6.5 and F.6.6).
 */
export function arcToSegments(
  from: Point,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): Segment[] {
  if (from.x === to.x && from.y === to.y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ kind: 'line', to }];

  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  // Radii that are too small to reach the end point are scaled up.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coefficient = (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxPrime = (coefficient * rx * y1) / ry;
  const cyPrime = (-coefficient * ry * x1) / rx;
  const cx = cos * cxPrime - sin * cyPrime + (from.x + to.x) / 2;
  const cy = sin * cxPrime + cos * cyPrime + (from.y + to.y) / 2;

  const startAngle = Math.atan2((y1 - cyPrime) / ry, (x1 - cxPrime) / rx);
  let delta = Math.atan2((-y1 - cyPrime) / ry, (-x1 - cxPrime) / rx) - startAngle;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  // Maps a point on the unit circle to the rotated, scaled ellipse.
  const map = (ux: number, uy: number): Point => ({
    x: cx + rx * cos * ux - ry * sin * uy,
    y: cy + rx * sin * ux + ry * cos * uy,
  });

  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / count;
  const handle = (4 / 3) * Math.tan(step / 4);
  const segments: Segment[] = [];
  for (let i = 0; i < count; i++) {
    const a = startAngle + i * step;
    const b = a + step;
    const isLast = i === count - 1;
    segments.push({
      kind: 'cubic',
      c1: map(Math.cos(a) - handle * Math.sin(a), Math.sin(a) + handle * Math.cos(a)),
      c2: map(Math.cos(b) + handle * Math.sin(b), Math.sin(b) - handle * Math.cos(b)),
      // The exact end point avoids a tiny gap from rounding.
      to: isLast ? to : map(Math.cos(b), Math.sin(b)),
    });
  }
  return segments;
}
