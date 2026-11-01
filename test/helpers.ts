import { expect } from 'vitest';
import type { Point, Segment, Subpath } from '../src/types';

/** The start point and every segment end: the anchor points of a subpath. */
export function anchors(subpath: Subpath): Point[] {
  return [subpath.start, ...subpath.segments.map((s) => s.to)];
}

export function expectPoint(actual: Point | undefined, x: number, y: number, digits = 6): void {
  expect(actual, `expected a point near (${x}, ${y})`).toBeDefined();
  expect(actual!.x).toBeCloseTo(x, digits);
  expect(actual!.y).toBeCloseTo(y, digits);
}

export function expectPoints(actual: Point[], expected: [number, number][], digits = 6): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach(([x, y], i) => expectPoint(actual[i], x, y, digits));
}

/** The point at t on a segment that starts at `from`. */
export function pointOnSegment(from: Point, segment: Segment, t: number): Point {
  if (segment.kind === 'line') {
    return { x: from.x + (segment.to.x - from.x) * t, y: from.y + (segment.to.y - from.y) * t };
  }
  const u = 1 - t;
  const { c1, c2, to } = segment;
  return {
    x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
  };
}

/** Samples a subpath at several points per segment. */
export function samplePoints(subpath: Subpath, perSegment = 8): Point[] {
  const points: Point[] = [];
  let from = subpath.start;
  for (const segment of subpath.segments) {
    for (let i = 0; i < perSegment; i++) points.push(pointOnSegment(from, segment, i / perSegment));
    from = segment.to;
  }
  points.push(from);
  return points;
}
