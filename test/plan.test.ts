import { describe, expect, it } from 'vitest';
import { drawPlan, paintLines, planLines } from '../src/index';
import type { SvgLine } from '../src/types';
import { loggingContext, rendering } from './callLog';
import { planPaths } from './helpers';

const wave: SvgLine = {
  start: { x: 10, y: 40 },
  segments: [{ kind: 'cubic', c1: { x: 40, y: 0 }, c2: { x: 70, y: 80 }, to: { x: 110, y: 40 } }],
  closed: false,
  color: 'teal',
};
const road: SvgLine = { start: { x: 20, y: 70 }, segments: [{ kind: 'line', to: { x: 100, y: 75 } }], closed: false, color: 'sienna', seed: 'road' };
const far: SvgLine = { start: { x: 900, y: 900 }, segments: [{ kind: 'line', to: { x: 980, y: 900 } }], closed: false, color: 'navy' };
const lines = [wave, road];

const drawLog = (draw: (context: ReturnType<typeof loggingContext>['context']) => void) => {
  const { context, log } = loggingContext();
  draw(context);
  return log;
};

describe('planLines', () => {
  it('plans one path per bristle into typed arrays, with boxes around the points', () => {
    const plan = planLines(lines, { seed: 3, size: 10 });
    expect(plan.points).toBeInstanceOf(Float64Array);
    expect(plan.alphas).toBeInstanceOf(Uint8Array);
    expect(plan.widths).toBeNull();
    expect(plan.paths).toHaveLength(2 * 24);
    expect(plan.points.length).toBe(2 * plan.alphas.length);
    for (const path of plan.paths) {
      for (let i = path.start; i < path.start + path.count; i++) {
        const [x, y] = [plan.points[2 * i]!, plan.points[2 * i + 1]!];
        expect(x).toBeGreaterThanOrEqual(path.box.x + path.width / 2 - 1e-9);
        expect(x).toBeLessThanOrEqual(path.box.x + path.box.width - path.width / 2 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(path.box.y + path.width / 2 - 1e-9);
        expect(y).toBeLessThanOrEqual(path.box.y + path.box.height - path.width / 2 + 1e-9);
      }
      // The last point starts no piece.
      expect(plan.alphas[path.start + path.count - 1]).toBe(0);
      const box = plan.box!;
      expect(path.box.x).toBeGreaterThanOrEqual(box.x);
      expect(path.box.y).toBeGreaterThanOrEqual(box.y);
      expect(path.box.x + path.box.width).toBeLessThanOrEqual(box.x + box.width + 1e-9);
      expect(path.box.y + path.box.height).toBeLessThanOrEqual(box.y + box.height + 1e-9);
    }
  });

  it('is plain data that survives a structured clone, as when sent from a Worker', () => {
    const plan = planLines(lines, { seed: 3 });
    const copy = structuredClone(plan);
    expect(copy).toEqual(plan);
    expect(drawLog((c) => drawPlan(c, copy))).toEqual(drawLog((c) => drawPlan(c, plan)));
  });

  it('gives an empty plan for no lines', () => {
    const plan = planLines([]);
    expect(plan.paths).toEqual([]);
    expect(plan.box).toBeNull();
    expect(drawLog((c) => drawPlan(c, plan))).toEqual(['save()', 'translate(0,0)', 'lineCap=butt', 'lineJoin=round', 'restore()']);
  });

  it('skips lines that cannot paint inside bounds, and leaves the others unchanged', () => {
    const all = planPaths(planLines([wave, far, road], { seed: 3, scale: 2 }));
    const inside = planPaths(planLines([wave, far, road], { seed: 3, scale: 2, bounds: { x: 0, y: 0, width: 300, height: 200 } }));
    expect(inside.map((p) => p.color)).not.toContain('navy');
    expect(inside).toEqual(all.filter((p) => p.color !== 'navy'));
  });

  it('keeps a line that only grazes the bounds whole, and counts the brush around it', () => {
    const all = planPaths(planLines([road], { size: 10 }));
    // The road's geometry ends at x = 100; its paint reaches a few pixels further.
    const grazing = planPaths(planLines([road], { size: 10, bounds: { x: 102, y: 0, width: 50, height: 200 } }));
    expect(grazing).toEqual(all);
    expect(planLines([road], { size: 10, bounds: { x: 140, y: 0, width: 50, height: 200 } }).paths).toEqual([]);
  });
});

describe('drawPlan', () => {
  it('draws exactly what paintLines paints', () => {
    const options = { seed: 5, size: 8, brush: 'round' as const };
    const painted = drawLog((c) => paintLines(c, lines, { ...options, transform: { scale: 1.5, x: 20, y: -4 } }));
    const drawn = drawLog((c) => drawPlan(c, planLines(lines, { ...options, scale: 1.5 }), { offset: { x: 20, y: -4 } }));
    expect(drawn).toEqual(painted);
  });

  it('draws at scale 2 with every coordinate and line width doubled', () => {
    const plan = planLines(lines, { seed: 5 });
    const once = drawLog((c) => drawPlan(c, plan));
    const twice = drawLog((c) => drawPlan(c, plan, { scale: 2 }));
    expect(twice).toHaveLength(once.length);
    const doubled = once.map((entry) => {
      const point = /^(moveTo|lineTo)\((.*),(.*)\)$/.exec(entry);
      if (point) return [point[1], Number(point[2]) * 2, Number(point[3]) * 2] as const;
      const width = /^lineWidth=(.*)$/.exec(entry);
      if (width) return ['lineWidth', Number(width[1]) * 2] as const;
      return entry;
    });
    twice.forEach((entry, i) => {
      const expected = doubled[i]!;
      if (typeof expected === 'string') return expect(entry).toBe(expected);
      const actual = /^(\w+)[(=](-?[\d.e-]+),?(-?[\d.e-]+)?\)?$/.exec(entry)!;
      expect(actual[1]).toBe(expected[0]);
      expect(Number(actual[2])).toBeCloseTo(expected[1], 5);
      if (expected.length === 3) expect(Number(actual[3])).toBeCloseTo(expected[2], 5);
    });
  });

  it('skips paths outside the clip rectangle, after scale and offset', () => {
    const plan = planLines([wave, far], { seed: 3 });
    const options = { scale: 0.5, offset: { x: 10, y: 10 } };
    const all = rendering(drawLog((c) => drawPlan(c, plan, options)));
    const clipped = rendering(drawLog((c) => drawPlan(c, plan, { ...options, clip: { x: 0, y: 0, width: 100, height: 100 } })));
    const navy = all.filter((s) => s.includes('strokeStyle=navy'));
    expect(navy.length).toBeGreaterThan(0);
    expect(clipped).toEqual(all.filter((s) => !s.includes('strokeStyle=navy')));
    // Nothing at all when the whole plan is outside.
    expect(drawLog((c) => drawPlan(c, plan, { clip: { x: -500, y: -500, width: 10, height: 10 } }))).toEqual([]);
  });

  it('paints a tile with paintLines bounds the same as without, where it shows', () => {
    const tile = { x: 0, y: 0, width: 64, height: 64 };
    const transform = { scale: 2, x: -40, y: -60 };
    const withBounds = rendering(drawLog((c) => paintLines(c, [wave, far, road], { seed: 1, transform, bounds: tile })));
    const without = rendering(drawLog((c) => paintLines(c, [wave, far, road], { seed: 1, transform })));
    expect(withBounds.length).toBeGreaterThan(0);
    expect(withBounds.length).toBeLessThan(without.length);
    // Every stroke drawn with bounds is drawn the same without them.
    const set = new Set(without);
    for (const stroke of withBounds) expect(set.has(stroke)).toBe(true);
  });
});

describe('level of detail', () => {
  const long: SvgLine = { start: { x: 0, y: 0 }, segments: [{ kind: 'line', to: { x: 200, y: 20 } }], closed: false, color: 'black' };

  it('is off by default', () => {
    expect(planLines([long], { tuning: { lodBristleSpacing: 0, lodSingleStroke: 0, lodPointSpacing: 0 } })).toEqual(planLines([long]));
  });

  it('gives a small brush fewer bristles, and leaves a large one alone', () => {
    const tuning = { lodBristleSpacing: 1 };
    expect(planLines([long], { size: 6, tuning }).paths).toHaveLength(6);
    expect(planLines([long], { size: 48, tuning }).paths).toEqual(planLines([long], { size: 48 }).paths);
    const few = planLines([long], { size: 6, tuning });
    // Fewer, wider bristles: the mark stays about as wide.
    expect(few.paths[0]!.width).toBeCloseTo((6 / 6) * 1.6, 9);
    const spread = (plan: typeof few) => plan.box!.height;
    expect(spread(few)).toBeGreaterThan(spread(planLines([long], { size: 6 })) * 0.8);
  });

  it('paints a tiny brush as one stroke whose width follows the pressure', () => {
    const plan = planLines([long], { size: 3, tuning: { lodSingleStroke: 4 } });
    expect(plan.paths).toHaveLength(1);
    const [path] = plan.paths;
    expect(path!.varies).toBe(true);
    expect(path!.width).toBe(3);
    const widths = Array.from(plan.widths!.subarray(path!.start, path!.start + path!.count - 1));
    // Narrow at touch-down and lift-off, full in the middle.
    expect(widths[0]).toBeLessThan(widths[100]!);
    expect(widths.at(-1)).toBeLessThan(widths[100]!);
    expect(Math.max(...widths)).toBeLessThanOrEqual(plan.widthSteps);
    // The stroke is darker than one bristle, as several bristles overlap.
    const alphas = Array.from(plan.alphas.subarray(path!.start + 50, path!.start + 150));
    expect(Math.max(...alphas) / plan.alphaSteps).toBeGreaterThan(0.6);
    // A brush at the limit still gets bristles.
    expect(planLines([long], { size: 4, tuning: { lodSingleStroke: 4 } }).paths).toHaveLength(24);
  });

  it('draws a stroke of varying width with the width of each piece', () => {
    const plan = planLines([long], { size: 3, tuning: { lodSingleStroke: 4 } });
    const log = drawLog((c) => drawPlan(c, plan, { scale: 2 }));
    const widths = log.filter((e) => e.startsWith('lineWidth=')).map((e) => Number(e.slice(10)));
    expect(new Set(widths).size).toBeGreaterThan(3);
    expect(Math.max(...widths)).toBeLessThanOrEqual(6);
    expect(Math.min(...widths)).toBeGreaterThan(0);
  });

  it('spaces points further apart for a larger brush', () => {
    const fine = planLines([long], { size: 20 });
    const coarse = planLines([long], { size: 20, tuning: { lodPointSpacing: 0.25 } });
    // 5 px apart instead of 1 px.
    expect(coarse.paths[0]!.count).toBeLessThan(fine.paths[0]!.count / 4);
    expect(coarse.paths[0]!.count).toBeGreaterThan(fine.paths[0]!.count / 6);
    // Never closer than 1 px.
    expect(planLines([long], { size: 2, tuning: { lodPointSpacing: 0.25 } }).paths[0]!.count).toBe(fine.paths[0]!.count);
  });
});
