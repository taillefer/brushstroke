import { describe, expect, it } from 'vitest';
import { strokeOutline, type Point } from '../src';

/** The nonzero winding number of a polygon around a point. */
function winding(polygon: Point[], p: Point): number {
  let w = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const side = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y && b.y > p.y && side > 0) w++;
    else if (a.y > p.y && b.y <= p.y && side < 0) w--;
  }
  return w;
}

function distanceToLine(p: Point, line: Point[], closed = false): number {
  let best = Infinity;
  const count = closed ? line.length : line.length - 1;
  for (let i = 0; i < count; i++) {
    const a = line[i]!;
    const b = line[(i + 1) % line.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  if (line.length === 1) best = Math.hypot(p.x - line[0]!.x, p.y - line[0]!.y);
  return best;
}

/** Checks on a grid that the nonzero fill of the outline is the round stroke, up to a margin at its edge. */
function expectCoversStroke(line: Point[], width: number, closed = false): void {
  const polygon = strokeOutline(line, width, { closed });
  const r = width / 2;
  const margin = width * 0.02;
  const xs = line.map((p) => p.x);
  const ys = line.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - width, Math.max(...xs) + width, Math.min(...ys) - width, Math.max(...ys) + width];
  const step = Math.max(x1 - x0, y1 - y0) / 80;
  let checked = 0;
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      const p = { x: x + step * 0.137, y: y + step * 0.291 };
      const d = distanceToLine(p, line, closed);
      if (Math.abs(d - r) < margin) continue;
      expect(winding(polygon, p) !== 0, `(${p.x}, ${p.y}) at ${d} from the line`).toBe(d < r);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(500);
}

const wiggle = (count: number, step = 5, amplitude = 60, period = 6): Point[] =>
  Array.from({ length: count }, (_, i) => ({ x: i * step, y: Math.sin(i / period) * amplitude }));

describe('strokeOutline', () => {
  it('outlines a straight line as a stadium', () => {
    const polygon = strokeOutline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2, { tolerance: 0.001 });
    for (const p of polygon) expect(distanceToLine(p, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeCloseTo(1, 6);
    expect(Math.min(...polygon.map((p) => p.x))).toBeCloseTo(-1, 2);
    expect(Math.max(...polygon.map((p) => p.x))).toBeCloseTo(11, 2);
  });

  it('covers exactly the round stroke of a wiggly line', () => {
    expectCoversStroke(wiggle(120), 12);
  });

  it('covers tight bends, hairpins and dense points', () => {
    expectCoversStroke([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 4 }, { x: 50, y: 8 }, { x: 0, y: 30 }], 10);
    expectCoversStroke([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 0 }], 6);
    // A spiral of points much closer together than the width.
    expectCoversStroke(Array.from({ length: 200 }, (_, i) => ({ x: Math.cos(i / 8) * (10 + i / 5), y: Math.sin(i / 8) * (10 + i / 5) })), 9);
  });

  it('covers a closed ring and leaves its middle empty', () => {
    const ring = Array.from({ length: 40 }, (_, i) => ({ x: Math.cos((i / 40) * 2 * Math.PI) * 30, y: Math.sin((i / 40) * 2 * Math.PI) * 20 }));
    expectCoversStroke(ring, 6, true);
    expect(winding(strokeOutline(ring, 6, { closed: true }), { x: 0, y: 0 })).toBe(0);
  });

  it('cuts the inside of a bend where the segments are long, leaving no step back to the corner', () => {
    const polygon = strokeOutline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 10, { join: 'miter' });
    expect(polygon.some((p) => p.x === 100 && p.y === 0)).toBe(false);
    expect(polygon).toContainEqual({ x: 95, y: 5 });
    // The outside corner is a miter.
    expect(polygon.some((p) => Math.abs(p.x - 105) < 1e-9 && Math.abs(p.y + 5) < 1e-9)).toBe(true);
  });

  it('bevels a miter longer than the limit, and bevels when asked', () => {
    const sharp = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 10 }];
    const tip = (polygon: Point[]) => Math.max(...polygon.map((p) => p.x));
    expect(tip(strokeOutline(sharp, 10, { join: 'miter', cap: 'butt' }))).toBeLessThan(106);
    expect(tip(strokeOutline(sharp, 10, { join: 'miter', cap: 'butt', miterLimit: 100 }))).toBeGreaterThan(140);
    expect(strokeOutline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2, { join: 'bevel', cap: 'butt' })).toHaveLength(7);
  });

  it('makes butt and square caps', () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(strokeOutline(line, 2, { cap: 'butt' })).toEqual([{ x: 0, y: 1 }, { x: 10, y: 1 }, { x: 10, y: -1 }, { x: 0, y: -1 }]);
    const square = strokeOutline(line, 2, { cap: 'square' });
    expect(Math.min(...square.map((p) => p.x))).toBe(-1);
    expect(Math.max(...square.map((p) => p.x))).toBe(11);
  });

  it('gives a dot for a single point, and nothing for no width', () => {
    expect(strokeOutline([{ x: 5, y: 5 }, { x: 5, y: 5 }], 4).every((p) => Math.abs(Math.hypot(p.x - 5, p.y - 5) - 2) < 1e-9)).toBe(true);
    expect(strokeOutline([{ x: 5, y: 5 }], 4, { cap: 'butt' })).toEqual([]);
    expect(strokeOutline([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0)).toEqual([]);
    expect(strokeOutline([], 3)).toEqual([]);
  });

  it('keeps round pieces within the tolerance', () => {
    const coarse = strokeOutline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 10, { tolerance: 1 });
    const fine = strokeOutline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 10, { tolerance: 0.01 });
    expect(fine.length).toBeGreaterThan(coarse.length * 3);
  });

  it('outlines 300 wiggly points quickly', () => {
    const line = wiggle(300);
    const start = performance.now();
    for (let i = 0; i < 20; i++) strokeOutline(line, 12);
    expect((performance.now() - start) / 20).toBeLessThan(50);
  });
});
