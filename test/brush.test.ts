import { describe, expect, it } from 'vitest';
import { brushLine, flatBrushAxis, type BristlePath, type BrushOptions } from '../src/brush/brush';
import { flattenLine } from '../src/geometry/flatten';
import { parsePathData } from '../src/parse/pathData';
import { createRandom } from '../src/random';
import { resolveTuning, type Tuning } from '../src/tuning';

const paint = (d: string, options: Partial<BrushOptions> = {}, overrides: Partial<Tuning> = {}, pressure = 1) => {
  const tuning = resolveTuning({ dryDistance: 3000, dryVariation: 0, ...overrides });
  const line = flattenLine({ ...parsePathData(d)[0]!, color: 'black' }, tuning);
  const full: BrushOptions = { brush: 'flat', size: 20, hand: 'right', ...options };
  return brushLine(line, line.points.map(() => pressure), full, tuning, createRandom(7));
};

/** Width of the painted mark across the travel direction, at point index `at`. */
const markWidth = (paths: BristlePath[], across: 'x' | 'y', at = 50) => {
  const touching = paths.map((p) => p.points[at]!).filter((p) => p.alpha > 0.01);
  const values = touching.map((p) => p[across]);
  return Math.max(...values) - Math.min(...values);
};

describe('brushLine', () => {
  it('gives one path per bristle, following the line', () => {
    const paths = paint('M0 0 L100 0');
    expect(paths).toHaveLength(resolveTuning().bristleCount);
    for (const path of paths) expect(path.points).toHaveLength(101);
  });

  it('changes with the brush kind and the size', () => {
    const flat = paint('M0 0 L100 0', { brush: 'flat' });
    expect(paint('M0 0 L100 0', { brush: 'round' })).not.toEqual(flat);
    expect(markWidth(paint('M0 0 L100 0', { size: 40 }), 'y')).toBeGreaterThan(markWidth(flat, 'y') * 1.8);
  });

  it('makes a flat brush thick across its edge and thin along it', () => {
    // A right-hand flat brush at 45° has its edge from lower left to upper right.
    const acrossEdge = paint('M0 0 L100 100'); // moving down-right, across the edge
    const alongEdge = paint('M0 100 L100 0'); // moving up-right, along the edge
    // The mark's width is its spread perpendicular to the travel direction.
    const perpendicular = (paths: BristlePath[], direction: [number, number]) => {
      const [dx, dy] = direction;
      const values = paths.map((p) => p.points[50]!).filter((p) => p.alpha > 0.01).map((p) => -dy * p.x + dx * p.y);
      return Math.max(...values) - Math.min(...values);
    };
    expect(perpendicular(acrossEdge, [Math.SQRT1_2, Math.SQRT1_2]))
      .toBeGreaterThan(3 * perpendicular(alongEdge, [Math.SQRT1_2, -Math.SQRT1_2]));
  });

  it('makes a round brush as wide in every direction', () => {
    const horizontal = markWidth(paint('M0 0 L100 0', { brush: 'round' }, { bristleJitter: 0 }), 'y');
    const vertical = markWidth(paint('M0 0 L0 100', { brush: 'round' }, { bristleJitter: 0 }), 'x');
    expect(horizontal / vertical).toBeGreaterThan(0.9);
    expect(horizontal / vertical).toBeLessThan(1.1);
  });

  it('paints a narrower and lighter mark at low pressure', () => {
    for (const brush of ['flat', 'round'] as const) {
      const heavy = paint('M0 0 L100 0', { brush }, {}, 1);
      const light = paint('M0 0 L100 0', { brush }, {}, 0.2);
      expect(markWidth(light, 'y')).toBeLessThan(markWidth(heavy, 'y'));
      const centre = (paths: BristlePath[]) => Math.max(...paths.map((p) => p.points[50]!.alpha));
      expect(centre(light)).toBeLessThan(centre(heavy));
    }
  });

  it('mirrors the flat brush angle for a left hand', () => {
    const tuning = resolveTuning();
    const right = flatBrushAxis('right', tuning);
    const left = flatBrushAxis('left', tuning);
    expect(left.x).toBeCloseTo(-right.x, 9);
    expect(left.y).toBeCloseTo(right.y, 9);

    const rightPaths = paint('M0 0 L0 100', { hand: 'right' });
    const leftPaths = paint('M0 0 L0 100', { hand: 'left' });
    rightPaths.forEach((path, i) => {
      expect(leftPaths[i]!.points[0]!.x).toBeCloseTo(-path.points[0]!.x, 9);
      expect(leftPaths[i]!.points[0]!.y).toBeCloseTo(path.points[0]!.y, 9);
    });
  });

  it('runs bristles dry after their dry distance, leaving gaps', () => {
    const paths = paint('M0 0 L1000 0', {}, { dryDistance: 300, dryVariation: 0, dryFade: 0.5 });
    const alphaAt = (i: number) => paths.map((p) => p.points[i]!.alpha);
    expect(alphaAt(200).every((a) => a > 0)).toBe(true);
    expect(alphaAt(400).some((a) => a === 0)).toBe(true);
    expect(alphaAt(500).every((a) => a === 0)).toBe(true);
  });
});
