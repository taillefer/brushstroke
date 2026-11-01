import type { FlatLine } from './flatten';

/**
 * For every point of the line, a value from 0 to 1 that is 1 at the given
 * distances along the line and falls off smoothly to 0 at `spread` pixels from
 * them. On a closed line the distance wraps around the join.
 */
export function bumpAround(line: FlatLine, centres: readonly number[], spread: number): number[] {
  const width = Math.max(spread, 1e-6);
  return line.points.map((p) => {
    let best = 0;
    for (const centre of centres) {
      let gap = Math.abs(p.distance - centre);
      if (line.closed) gap = Math.min(gap, line.length - gap);
      if (gap < width) best = Math.max(best, smoothstep(1 - gap / width));
    }
    return best;
  });
}

/** Eases a value in [0, 1] so it starts and ends flat. */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
