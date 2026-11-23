import { describe, expect, it } from 'vitest';
import { contourStrokes, hatchArea, insideRings } from '../src/geometry/hatch';
import type { Point, SvgLine } from '../src/types';

const square = (x: number, y: number, size: number): Point[] => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];
const ends = (line: SvgLine): Point[] => [line.start, line.segments[line.segments.length - 1]!.to];
const options = { spacing: 10, length: 60, angle: -30, seed: 's' };

describe('insideRings', () => {
  it('counts holes by the even-odd rule', () => {
    const rings = [square(0, 0, 100), square(40, 40, 20)];
    expect(insideRings(rings, { x: 10, y: 10 })).toBe(true);
    expect(insideRings(rings, { x: 50, y: 50 })).toBe(false);
    expect(insideRings(rings, { x: 150, y: 50 })).toBe(false);
  });
});

describe('hatchArea', () => {
  it('starts and ends every stroke inside the area, the inset along its row from the edge', () => {
    const rings = [square(0, 0, 200)];
    // Rows at angle 0 meet the left and right edges square on, so the inset is the distance to them.
    const lines = hatchArea(rings, { ...options, angle: 0, inset: 5 });
    expect(lines.length).toBeGreaterThan(20);
    for (const line of lines) {
      for (const p of ends(line)) {
        expect(p.x).toBeGreaterThan(4.99);
        expect(p.x).toBeLessThan(195.01);
        expect(p.y).toBeGreaterThan(4.99);
        expect(p.y).toBeLessThan(195.01);
      }
    }
  });

  it('never crosses a hole: a stroke that would is cut in two', () => {
    const rings = [square(0, 0, 200), square(80, 80, 40)];
    const hole = square(80, 80, 40);
    const lines = hatchArea(rings, { ...options, length: 110, angle: 0, inset: 0 });
    for (const line of lines) {
      const [a, b] = ends(line);
      // Sample the straight stroke (angle 0, no bend or jitter): no point lies in the hole.
      for (let t = 0.02; t < 1; t += 0.04) {
        const p = { x: a!.x + (b!.x - a!.x) * t, y: a!.y + (b!.y - a!.y) * t };
        expect(insideRings([hole], p)).toBe(false);
      }
    }
    expect(lines.some((l) => String(l.seed).endsWith('/1'))).toBe(true);
  });

  it('keeps strokes away from a changed edge exactly as they were', () => {
    const small = hatchArea([square(0, 0, 400)], options);
    const grown = hatchArea([square(0, 0, 600)], options);
    const bySeed = new Map(grown.map((l) => [l.seed, l]));
    // Strokes well inside the small square are not cut by either edge.
    const inner = small.filter((l) => ends(l).every((p) => p.x > 100 && p.x < 300 && p.y > 100 && p.y < 300));
    expect(inner.length).toBeGreaterThan(3);
    for (const line of inner) expect(bySeed.get(line.seed)).toEqual(line);
  });

  it('gives the same strokes inside bounds as without them', () => {
    const rings = [square(0, 0, 400)];
    const all = new Map(hatchArea(rings, options).map((l) => [l.seed, l]));
    const bounds = { x: 100, y: 100, width: 80, height: 80 };
    const some = hatchArea(rings, { ...options, bounds });
    expect(some.length).toBeGreaterThan(0);
    expect(some.length).toBeLessThan(all.size);
    for (const line of some) expect(all.get(line.seed)).toEqual(line);
  });

  it('gives nothing without spacing, length or an area', () => {
    expect(hatchArea([square(0, 0, 100)], { ...options, spacing: 0 })).toEqual([]);
    expect(hatchArea([square(0, 0, 100)], { ...options, length: 0 })).toEqual([]);
    expect(hatchArea([], options)).toEqual([]);
  });
});

describe('contourStrokes', () => {
  it('runs inside the area along the outer edge and around a hole', () => {
    for (const reversed of [false, true]) {
      const outer = square(0, 0, 200);
      const hole = square(80, 80, 40);
      const rings = reversed ? [outer.slice().reverse(), hole.slice().reverse()] : [outer, hole];
      const lines = contourStrokes(rings, { inset: 6, length: 50, seed: 'e' });
      expect(lines.length).toBeGreaterThan(10);
      for (const line of lines) for (const p of ends(line)) expect(insideRings(rings, p)).toBe(true);
    }
  });

  it('cuts the edge into strokes of about the given length', () => {
    // 800 units of edge in strokes of 100. Where the last stroke meets the first at the start, they join into one.
    const lines = contourStrokes([square(0, 0, 200)], { inset: 0, length: 100 });
    expect(lines.length).toBeGreaterThanOrEqual(7);
    expect(lines.length).toBeLessThanOrEqual(8);
  });
});

describe('hatchArea with flow and paint load', () => {
  const disc = (r: number, n = 64): Point[] => Array.from({ length: n }, (_, i) => ({ x: 200 + r * Math.cos((i / n) * 2 * Math.PI), y: 200 + r * Math.sin((i / n) * 2 * Math.PI) }));

  it('keeps every turned stroke inside the area', () => {
    const rings = [disc(150)];
    const lines = hatchArea(rings, { ...options, flow: 1, flowDistance: 60 });
    expect(lines.length).toBeGreaterThan(20);
    for (const line of lines) for (const p of ends(line)) expect(insideRings(rings, p)).toBe(true);
  });

  it('turns strokes near the edge to run along it, and leaves the middle alone', () => {
    const rings = [disc(150)];
    const plain = new Map(hatchArea(rings, options).map((l) => [l.seed, l]));
    const flowed = hatchArea(rings, { ...options, flow: 1, flowDistance: 40 });
    let turnedNearEdge = 0;
    for (const line of flowed) {
      const [a, b] = ends(line);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const fromCentre = Math.hypot(mid.x - 200, mid.y - 200);
      if (fromCentre < 60) expect(line).toEqual(plain.get(line.seed));
      if (fromCentre > 140) {
        // Along the edge of a disc means across the radius.
        const along = Math.abs(((b!.x - a!.x) * (mid.x - 200) + (b!.y - a!.y) * (mid.y - 200)) / (Math.hypot(b!.x - a!.x, b!.y - a!.y) * fromCentre));
        expect(along).toBeLessThan(0.5);
        turnedNearEdge++;
      }
    }
    expect(turnedNearEdge).toBeGreaterThan(3);
  });

  it('gives strokes a load that runs from 0 to 1 over each cycle, and 0 without cycles', () => {
    const rings = [square(0, 0, 400)];
    const loads = hatchArea(rings, { ...options, loadCycle: 4 }).map((l) => l.load);
    expect(Math.min(...loads)).toBe(0);
    expect(Math.max(...loads)).toBe(1);
    expect(new Set(loads).size).toBeGreaterThan(2);
    expect(hatchArea(rings, options).every((l) => l.load === 0)).toBe(true);
  });

  it('does not move the strokes when the cycles are turned on', () => {
    const rings = [square(0, 0, 300)];
    const strip = (l: SvgLine & { load: number }) => ({ ...l, load: 0 });
    expect(hatchArea(rings, { ...options, loadCycle: 5 }).map(strip)).toEqual(hatchArea(rings, options));
  });
});

describe('edges that are not real edges', () => {
  it('leaves edge strokes off a ring that is not listed', () => {
    const frame = square(0, 0, 400);
    const island = square(150, 150, 100);
    const rings = [frame, island];
    const lines = contourStrokes(rings, { inset: 5, length: 40, edges: [island] });
    expect(lines.length).toBeGreaterThan(5);
    // Every edge stroke runs around the island, none along the frame.
    for (const line of lines) for (const p of ends(line)) expect(Math.max(Math.abs(p.x - 200), Math.abs(p.y - 200))).toBeLessThan(60);
  });

  it('does not turn strokes along a ring left out of flowEdges', () => {
    const frame = square(0, 0, 400);
    const rings = [frame];
    expect(hatchArea(rings, { ...options, flow: 1, flowDistance: 50, flowEdges: [] })).toEqual(hatchArea(rings, options));
  });
});
