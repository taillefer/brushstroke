import type { FlatLine } from './flatten';

/**
 * For every point of the line, a value from 0 to 1 that is 1 at the given
 * distances along the line and falls off smoothly to 0 at `spread` pixels from
 * them. On a closed line the distance wraps around the join.
 */
export function bumpAround(line: FlatLine, centres: readonly number[], spread: number): number[] {
  const width = Math.max(spread, 1e-6);
  const sorted = [...centres].sort((a, b) => a - b);
  const last = sorted.length - 1;
  // The bump falls off with the gap, so only the nearest centre counts: one of
  // the two around the point, or across the join of a closed line, the first
  // or the last.
  const bump = (distance: number, centre: number): number => {
    let gap = Math.abs(distance - centre);
    if (line.closed) gap = Math.min(gap, line.length - gap);
    return gap < width ? smoothstep(1 - gap / width) : 0;
  };
  return line.points.map((p) => {
    if (last < 0) return 0;
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sorted[middle]! < p.distance) low = middle + 1;
      else high = middle;
    }
    let best = 0;
    if (low <= last) best = Math.max(best, bump(p.distance, sorted[low]!));
    if (low > 0) best = Math.max(best, bump(p.distance, sorted[low - 1]!));
    if (line.closed) best = Math.max(best, bump(p.distance, sorted[0]!), bump(p.distance, sorted[last]!));
    return best;
  });
}

/** Eases a value in [0, 1] so it starts and ends flat. */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
