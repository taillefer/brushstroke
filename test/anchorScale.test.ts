import { describe, expect, it } from 'vitest';
import { paintLines } from '../src/paintLines';
import { planLines } from '../src/plan';
import type { PaintContext } from '../src/render';
import type { StrokePlan } from '../src/strokePlan';
import type { Tuning } from '../src/tuning';
import type { SvgLine } from '../src/types';

// A long straight line, so every look number that is not noise is the same all along it.
const line: SvgLine = { start: { x: 0, y: 0 }, segments: [{ kind: 'line', to: { x: 400, y: 0 } }], closed: false, color: '#000000', seed: 'l' };

// Everything that is measured in brush widths, or that sits at a fixed place, is turned off,
// so only the noise (pressure noise, dry gaps, wobble) changes the paint along the line.
const noiseOnly: Partial<Tuning> = {
  startTaperLength: 0,
  endTaperLength: 0,
  anchorPressure: 0,
  cornerPressure: 0,
  poolAmount: 0,
  directionPressure: 0,
  grainAmount: 0,
  noiseAmount: 0.4,
  noiseWavelength: 15,
  dryDistance: 80,
  dryFade: 2,
  dryGapLength: 4,
  wobbleAmount: 0,
};

/** The first bristle's points as [x, y, alpha step] for every point. */
function firstPath(plan: StrokePlan): [number, number, number][] {
  const path = plan.paths[0]!;
  return Array.from({ length: path.count - 1 }, (_, k) => {
    const i = path.start + k;
    return [plan.points[2 * i]!, plan.points[2 * i + 1]!, plan.alphas[i]!];
  });
}

/** The alpha step of the piece that starts at line x = `at`, on a plan made at `scale`. */
function alphaAt(plan: StrokePlan, scale: number, at: number): number {
  const points = firstPath(plan);
  let best = points[0]!;
  for (const p of points) if (Math.abs(p[0] - at * scale) < Math.abs(best[0] - at * scale)) best = p;
  return best[2];
}

describe('anchorScale', () => {
  const options = { brush: 'round' as const, size: 6, seed: 3, tuning: noiseOnly };

  it('paints the same plan as before when it equals scale', () => {
    for (const scale of [1, 2.5]) {
      const plain = planLines([line], { ...options, scale });
      const same = planLines([line], { ...options, scale, anchorScale: scale });
      expect(Array.from(same.points)).toEqual(Array.from(plain.points));
      expect(Array.from(same.alphas)).toEqual(Array.from(plain.alphas));
    }
  });

  it('keeps pressure noise and dry gaps at the same places on the line when the scale changes', () => {
    const near = planLines([line], { ...options, scale: 1, anchorScale: 1 });
    const far = planLines([line], { ...options, scale: 2, anchorScale: 1 });
    const samples = Array.from({ length: 30 }, (_, k) => 20 + k * 12);
    const nearAlphas = samples.map((at) => alphaAt(near, 1, at));
    const farAlphas = samples.map((at) => alphaAt(far, 2, at));
    // The noise varies along the line, or the test would prove nothing.
    expect(new Set(nearAlphas).size).toBeGreaterThan(3);
    expect(farAlphas).toEqual(nearAlphas);
  });

  it('lets the noise slide along the line without it', () => {
    const near = planLines([line], { ...options, scale: 1 });
    const far = planLines([line], { ...options, scale: 2 });
    const samples = Array.from({ length: 30 }, (_, k) => 20 + k * 12);
    expect(samples.map((at) => alphaAt(far, 2, at))).not.toEqual(samples.map((at) => alphaAt(near, 1, at)));
  });

  it('keeps the wobble at the same places, with its reach in plan pixels', () => {
    const wobbly = { ...options, tuning: { ...noiseOnly, wobbleAmount: 3, wobbleWavelength: 40 } };
    const near = firstPath(planLines([line], { ...wobbly, scale: 1, anchorScale: 1 }));
    const far = firstPath(planLines([line], { ...wobbly, scale: 2, anchorScale: 1 }));
    const yAt = (points: [number, number, number][], x: number) =>
      points.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1];
    for (const at of [50, 130, 210, 290]) expect(yAt(far, at * 2)).toBeCloseTo(yAt(near, at), 1);
    // The reach is not scaled: the drift stays within the bristle's offset plus `wobbleAmount`.
    const ys = far.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(6 + 2 * 3 + 0.01);
  });

  it('is passed on by paintLines', () => {
    const calls: number[] = [];
    const context = {
      save() {}, restore() {}, translate() {}, beginPath() {}, stroke() {}, moveTo() {},
      lineTo: (x: number) => calls.push(x),
      set globalAlpha(a: number) { calls.push(-a); },
      set strokeStyle(_: string) {}, set lineWidth(_: number) {}, set lineCap(_: string) {}, set lineJoin(_: string) {},
    } as unknown as PaintContext;
    paintLines(context, [line], { ...options, transform: { scale: 2 }, anchorScale: 1 });
    const viaPaint = calls.slice();
    calls.length = 0;
    paintLines(context, [line], { ...options, transform: { scale: 2 } });
    expect(viaPaint).not.toEqual(calls);
  });

  it('rejects a scale of 0 or less', () => {
    expect(() => planLines([line], { anchorScale: 0 })).toThrow(RangeError);
    expect(() => planLines([line], { anchorScale: Number.NaN })).toThrow(RangeError);
  });
});
