import { describe, expect, it } from 'vitest';
import { paintLines } from '../src/paintLines';
import { planLines } from '../src/plan';
import type { PaintContext } from '../src/render';
import type { SvgLine } from '../src/types';
import { planPaths } from './helpers';

const lines: SvgLine[] = [
  { start: { x: 10, y: 40 }, segments: [{ kind: 'cubic', c1: { x: 40, y: 0 }, c2: { x: 70, y: 80 }, to: { x: 110, y: 40 } }], closed: false, color: 'teal' },
  { start: { x: 20, y: 70 }, segments: [{ kind: 'line', to: { x: 100, y: 75 } }], closed: false, color: 'sienna', seed: 'road' },
];

interface Recorded {
  /** Every lineTo and moveTo in canvas coordinates, with the alpha it was drawn at. */
  points: { x: number; y: number; alpha: number }[];
  /** Calls that would change existing content or the canvas size. */
  destructive: string[];
}

/** A context that records what is drawn, following translate, save and restore. */
function recordingContext(): { context: PaintContext; recorded: Recorded } {
  const recorded: Recorded = { points: [], destructive: [] };
  let offset = { x: 0, y: 0, alpha: 1 };
  const stack: (typeof offset)[] = [];
  const record = (x: number, y: number) => recorded.points.push({ x: x + offset.x, y: y + offset.y, alpha: offset.alpha });
  const context = {
    save: () => stack.push({ ...offset }),
    restore: () => (offset = stack.pop()!),
    translate: (x: number, y: number) => (offset = { ...offset, x: offset.x + x, y: offset.y + y }),
    set globalAlpha(alpha: number) {
      offset.alpha = alpha;
    },
    get globalAlpha() {
      return offset.alpha;
    },
    beginPath: () => {},
    stroke: () => {},
    moveTo: record,
    lineTo: record,
    clearRect: () => recorded.destructive.push('clearRect'),
    fillRect: () => recorded.destructive.push('fillRect'),
    setTransform: () => recorded.destructive.push('setTransform'),
    resetTransform: () => recorded.destructive.push('resetTransform'),
  };
  return { context: context as unknown as PaintContext, recorded };
}

const paint = (options: Parameters<typeof paintLines>[2]) => {
  const { context, recorded } = recordingContext();
  paintLines(context, lines, options);
  return recorded;
};

describe('paintLines', () => {
  it('paints the same strokes, paper grain included, moved by exactly the offset', () => {
    const here = paint({ seed: 3 });
    const there = paint({ seed: 3, transform: { x: 256, y: -128 } });
    expect(here.points.length).toBeGreaterThan(100);
    expect(there.points).toEqual(here.points.map((p) => ({ ...p, x: p.x + 256, y: p.y - 128 })));
  });

  it('keeps the brush the same size when the lines are scaled', () => {
    const straight: SvgLine[] = [{ start: { x: 0, y: 0 }, segments: [{ kind: 'line', to: { x: 100, y: 0 } }], closed: false, color: 'black' }];
    const spread = (factor: number) => {
      const paths = planPaths(planLines(straight, { seed: 1, scale: factor, size: 12 }));
      const middle = paths.flatMap((p) => p.points.filter((q) => Math.abs(q.x - 50 * factor) < 1).map((q) => q.y));
      return { widths: new Set(paths.map((p) => p.width)), across: Math.max(...middle) - Math.min(...middle) };
    };
    const one = spread(1);
    const two = spread(2);
    expect(two.widths).toEqual(one.widths);
    // The painted width stays about the brush size instead of doubling.
    expect(two.across).toBeGreaterThan(one.across * 0.7);
    expect(two.across).toBeLessThan(one.across * 1.4);
  });

  it('places scaled lines at line × scale + offset', () => {
    const at = paint({ seed: 3, transform: { scale: 2, x: 5, y: 7 } });
    const xs = at.points.map((p) => p.x);
    // The lines run from x = 10 to 110, so 25 to 225 on the canvas, give or take the brush.
    expect(Math.min(...xs)).toBeGreaterThan(5);
    expect(Math.max(...xs)).toBeLessThan(245);
    expect(Math.max(...xs)).toBeGreaterThan(200);
  });

  it('leaves existing content, size and context state alone', () => {
    const { context, recorded } = recordingContext();
    context.globalAlpha = 0.25;
    paintLines(context, lines, { transform: { x: 10, y: 10 } });
    expect(recorded.destructive).toEqual([]);
    expect(context.globalAlpha).toBe(0.25);
    context.translate(0, 0);
    // A point drawn now is not shifted by the offset paintLines used.
    context.lineTo(1, 1);
    expect(recorded.points.at(-1)).toEqual({ x: 1, y: 1, alpha: 0.25 });
  });

  it('uses seed 0 by default and gives a different painting for another seed', () => {
    expect(paint({})).toEqual(paint({ seed: 0 }));
    expect(paint({ seed: 1 })).not.toEqual(paint({ seed: 0 }));
  });
});
