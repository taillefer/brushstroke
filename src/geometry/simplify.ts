import type { Point } from '../types';

/**
 * Ramer–Douglas–Peucker: drops points so that no dropped point is farther than
 * `tolerance` from the simplified line. The first and last points of an open
 * line are always kept.
 *
 * With `closed`, the points are a ring (the first point is not repeated at the
 * end; if it is, the copy is dropped). The ring is split at the point farthest
 * from its first point, so both halves keep their ends, and the first point is
 * always kept. A ring that collapses
 * to fewer than 3 points gives an empty list.
 *
 * Returns new arrays and never changes `points`. Kept points are the same objects.
 */
export function simplify(points: readonly Point[], tolerance: number, closed = false): Point[] {
  if (!closed) return simplifyOpen(points, tolerance);

  let ring = points;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first!.x === last!.x && first!.y === last!.y) ring = ring.slice(0, -1);
  if (ring.length < 3) return [];
  const start = ring[0]!;
  let far = 1;
  let farDistance = -1;
  ring.forEach((p, i) => {
    const d = (p.x - start.x) ** 2 + (p.y - start.y) ** 2;
    if (d > farDistance) {
      farDistance = d;
      far = i;
    }
  });
  const a = simplifyOpen(ring.slice(0, far + 1), tolerance);
  const b = simplifyOpen([...ring.slice(far), start], tolerance);
  const result = [...a, ...b.slice(1, -1)];
  return result.length >= 3 ? result : [];
}

function simplifyOpen(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  // An explicit stack, so long lines cannot overflow the call stack.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index > 0 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
