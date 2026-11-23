import { describe, expect, it } from 'vitest';
import { bumpAround, smoothstep } from '../src/geometry/bump';
import type { FlatLine } from '../src/geometry/flatten';
import { createRandom } from '../src/random';

/** The plain definition: the largest bump of all centres. */
const naive = (line: FlatLine, centres: number[], spread: number) => {
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
};

const line = (length: number, closed: boolean): FlatLine => ({
  points: Array.from({ length: length + 1 }, (_, i) => ({ x: i, y: 0, distance: i, anchor: false, corner: false, turn: 0 })),
  closed,
  length,
  color: 'black',
});

describe('bumpAround', () => {
  it('gives exactly the largest bump of all centres, open or closed, in any order', () => {
    const random = createRandom(9);
    for (let round = 0; round < 50; round++) {
      const flat = line(200, round % 2 === 0);
      const centres = Array.from({ length: Math.floor(random.next() * 12) }, () => random.next() * 200);
      const spread = random.next() * 40;
      expect(bumpAround(flat, centres, spread)).toEqual(naive(flat, centres, spread));
    }
  });
});
