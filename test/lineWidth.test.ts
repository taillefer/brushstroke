import { describe, expect, it } from 'vitest';
import { parseSvgDrawing, planLines, strokesToLines, type SvgLine } from '../src';
import { planPaths } from './helpers';

const river: SvgLine = {
  start: { x: 0, y: 50 },
  segments: [{ kind: 'line', to: { x: 300, y: 50 } }],
  closed: false,
  color: '#2a6f97',
  seed: 'river',
};

/** How far apart the bristles are across the line (in y) near x, over all paths. */
function spreadNear(lines: SvgLine[], x: number, options: Parameters<typeof planLines>[1] = {}): number {
  const ys = planPaths(planLines(lines, { brush: 'round', ...options }))
    .flatMap((path) => path.points.filter((p) => Math.abs(p.x - x) < 0.6).map((p) => p.y));
  return Math.max(...ys) - Math.min(...ys);
}

describe('SvgLine.width', () => {
  it('paints exactly like the same size given for the whole call', () => {
    const { seed: _, ...unseeded } = river;
    for (const line of [river, unseeded]) {
      expect(planLines([{ ...line, width: 6 }], { seed: 4 })).toEqual(planLines([line], { seed: 4, size: 6 }));
      expect(planLines([{ ...line, width: 12 }], { seed: 4 })).toEqual(planLines([line], { seed: 4 }));
    }
  });

  it('lets roads of different widths share one call, each as if painted alone', () => {
    const road = { ...river, seed: 'road', start: { x: 0, y: 150 }, segments: [{ kind: 'line' as const, to: { x: 300, y: 150 } }] };
    const together = planPaths(planLines([{ ...river, width: 20 }, { ...road, width: 4 }], { seed: 1 }));
    const alone = [
      ...planPaths(planLines([river], { seed: 1, size: 20 })),
      ...planPaths(planLines([road], { seed: 1, size: 4 })),
    ];
    expect(together).toEqual(alone);
  });

  it('is not scaled by the plan scale, like size', () => {
    const scaled = planLines([{ ...river, width: 6 }], { seed: 2, scale: 3 });
    expect(scaled).toEqual(planLines([river], { seed: 2, scale: 3, size: 6 }));
  });

  it('gives fewer bristles to a narrow line when lodBristleSpacing is on', () => {
    const tuning = { lodBristleSpacing: 1 };
    expect(planLines([{ ...river, width: 4 }], { tuning }).paths).toHaveLength(4);
    expect(planLines([river], { tuning }).paths).toHaveLength(12);
    // And one stroke below lodSingleStroke.
    expect(planLines([{ ...river, width: 3 }], { tuning: { lodSingleStroke: 4 } }).paths).toHaveLength(1);
  });

  it('grows the bounds margin with the line, so a wide line is not skipped', () => {
    const bounds = { x: 0, y: 70, width: 300, height: 20 };
    expect(planLines([river], { bounds, size: 10 }).paths).toHaveLength(0);
    expect(planLines([{ ...river, width: 60 }], { bounds, size: 10 }).paths.length).toBeGreaterThan(0);
  });

  it('skips a line of width 0 and refuses a negative or non-number width', () => {
    expect(planLines([{ ...river, width: 0 }]).paths).toHaveLength(0);
    expect(planLines([{ ...river, width: 0, widthEnd: 0 }]).paths).toHaveLength(0);
    expect(() => planLines([{ ...river, width: -1 }])).toThrow(RangeError);
    expect(() => planLines([{ ...river, widthEnd: Number.NaN }])).toThrow(RangeError);
  });
});

describe('SvgLine.widthEnd', () => {
  it('widens the brush along the line, from width to widthEnd', () => {
    const line = { ...river, width: 4, widthEnd: 24 };
    const plan = planLines([line], { brush: 'round' });
    expect(plan.widths).not.toBeNull();
    expect(plan.paths.every((p) => p.varies)).toBe(true);
    const start = spreadNear([line], 60);
    const middle = spreadNear([line], 150);
    const end = spreadNear([line], 240);
    expect(start).toBeLessThan(middle);
    expect(middle).toBeLessThan(end);
    // Width 4 at x=0 and 24 at x=300: about 8 at x=60 and 20 at x=240.
    expect(start).toBeLessThan(10);
    expect(end).toBeGreaterThan(15);
    expect(end).toBeLessThan(26);
  });

  it('follows the line as given, whichever way the hand paints it', () => {
    const reversed: SvgLine = { ...river, start: { x: 300, y: 50 }, segments: [{ kind: 'line', to: { x: 0, y: 50 } }], width: 24, widthEnd: 4 };
    for (const hand of ['left', 'right'] as const) {
      expect(spreadNear([reversed], 60, { hand })).toBeLessThan(spreadNear([reversed], 240, { hand }));
    }
  });

  it('starts at size when only widthEnd is set', () => {
    expect(spreadNear([{ ...river, widthEnd: 30 }], 30, { size: 6 })).toBeLessThan(10);
    expect(spreadNear([{ ...river, widthEnd: 6 }], 150, { size: 6 }))
      .toBeCloseTo(spreadNear([river], 150, { size: 6 }), 6);
  });

  it('keeps the width along a closed line and its split pieces', () => {
    const square: SvgLine = {
      start: { x: 0, y: 0 },
      segments: [
        { kind: 'line', to: { x: 200, y: 0 } },
        { kind: 'line', to: { x: 200, y: 200 } },
        { kind: 'line', to: { x: 0, y: 200 } },
        { kind: 'line', to: { x: 0, y: 0 } },
      ],
      closed: true,
      color: 'black',
      width: 2,
      widthEnd: 20,
    };
    const plan = planLines([square], { brush: 'round' });
    expect(plan.paths.length).toBeGreaterThan(0);
    for (let i = 0; i < plan.points.length; i++) expect(Number.isFinite(plan.points[i]!)).toBe(true);
  });
});

describe('strokesToLines and width', () => {
  it('sets each line width from its stroke, which paintLines then uses instead of size', () => {
    const drawing = parseSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M0 10L90 10" fill="none" stroke="black" stroke-width="3"/>
      <path d="M0 50L90 50" fill="none" stroke="black" stroke-width="8"/>
    </svg>`);
    const lines = strokesToLines(drawing, { scale: 2 });
    expect(lines.map((l) => l.width)).toEqual([6, 16]);
    const plain = lines.map(({ width: _w, opacity: _o, ...line }) => line);
    expect(planPaths(planLines(lines, { seed: 5 }))).toEqual([
      ...planPaths(planLines([plain[0]!], { seed: 5, size: 6 })),
      ...planPaths(planLines([plain[1]!], { seed: 5, size: 16 })),
    ]);
  });
});
