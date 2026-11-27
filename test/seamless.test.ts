import { describe, expect, it } from 'vitest';
import { flattenLine } from '../src/geometry/flatten';
import { planLines } from '../src/plan';
import { linePressure } from '../src/pressure';
import { resolveTuning } from '../src/tuning';
import type { StrokePlan } from '../src/strokePlan';
import type { SvgLine } from '../src/types';

/** A straight line along y = 10 from `from` to `to`, made of short pieces as a contour line is. */
function line(from: number, to: number): SvgLine {
  const segments = [];
  for (let x = from + 4; x <= to; x += 4) segments.push({ kind: 'line' as const, to: { x, y: 10 + Math.sin(x / 30) * 6 } });
  return { start: { x: from, y: 10 + Math.sin(from / 30) * 6 }, segments, closed: false, color: '#000000', seed: 'contour' };
}

/** Every bristle point as x, y and alpha, for the points between x0 and x1. */
function pointsBetween(plan: StrokePlan, x0: number, x1: number): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  plan.paths.forEach((path, p) => {
    for (let k = 0; k < path.count; k++) {
      const i = path.start + k;
      const x = plan.points[2 * i]!;
      if (x < x0 || x > x1) continue;
      out.set(`${p}:${x.toFixed(3)}`, [plan.points[2 * i + 1]!, plan.alphas[i]!]);
    }
  });
  return out;
}

describe('seamless', () => {
  const options = { brush: 'round' as const, size: 6, seed: 39, anchorScale: 1 };
  // Two tiles side by side: each plans the line from a little before it to a little past it.
  const left = { x: 0, y: -50, width: 200, height: 100 };
  const right = { x: 200, y: -50, width: 200, height: 100 };

  it('paints the stretch two pieces share the same, wherever the pieces start and end', () => {
    const a = planLines([line(-60, 260)], { ...options, seamless: true, bounds: left });
    const b = planLines([line(140, 460)], { ...options, seamless: true, bounds: right });
    // Around the tiles' shared edge, both pieces put the same bristles in the same places.
    const fromA = pointsBetween(a, 180, 220);
    const fromB = pointsBetween(b, 180, 220);
    expect(fromA.size).toBeGreaterThan(0);
    let compared = 0;
    for (const [key, [y, alpha]] of fromA) {
      const other = fromB.get(key);
      if (!other) continue;
      compared++;
      expect(other[0]).toBeCloseTo(y, 6);
      expect(other[1]).toBeCloseTo(alpha, 6);
    }
    expect(compared).toBeGreaterThan(fromA.size * 0.9);
  });

  it('does not taper an end that is a cut', () => {
    const flat = flattenLine(line(0, 400), resolveTuning(), 1);
    const tuning = resolveTuning();
    const tapered = linePressure(flat, 6, tuning, () => 0);
    const cut = linePressure(flat, 6, tuning, () => 0, { ends: { start: false, end: false } });
    // At a real end the pressure blends toward the touch-down; at a cut it stays as further in.
    expect(cut[0]).not.toBeCloseTo(tapered[0]!, 3);
    expect(cut[0]).toBeCloseTo(cut[Math.floor(cut.length / 2)]!, 1);
  });

  it('leaves lines without it as they were', () => {
    const a = planLines([line(0, 300)], options);
    const b = planLines([line(0, 300)], { ...options, seamless: false });
    expect(Array.from(b.points)).toEqual(Array.from(a.points));
    expect(Array.from(b.alphas)).toEqual(Array.from(a.alphas));
  });
});
