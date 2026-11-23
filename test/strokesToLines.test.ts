import { describe, expect, it } from 'vitest';
import { parseColor, parseSvgDrawing, strokesToLines, type SvgLine } from '../src';

const drawing = parseSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <rect width="10" height="10" fill="green"/>
  <path d="M0 0L5 0M0 5L5 5" fill="none" stroke="rgba(255,0,0,0.5)" stroke-width="2"/>
  <circle cx="5" cy="5" r="2" fill="red" stroke="navy"/>
</svg>`);

describe('strokesToLines', () => {
  it('gives one line per stroke subpath, with colour, width, opacity and seeds', () => {
    const lines = strokesToLines(drawing, { seedPrefix: 'tree-' });
    expect(lines.map((l) => [l.color, l.width, l.opacity, l.seed])).toEqual([
      ['#ff0000', 2, 0.5, 'tree-0'],
      ['#ff0000', 2, 0.5, 'tree-0/1'],
      ['#000080', 1, 1, 'tree-1'],
    ]);
    expect(lines[1]!.start).toEqual({ x: 0, y: 5 });
    // The lines can go straight to paintLines.
    const paintable: SvgLine[] = lines;
    expect(paintable).toHaveLength(3);
  });

  it('scales the points and the width, and is the same every time', () => {
    const lines = strokesToLines(drawing, { scale: 3 });
    expect(lines[0]!.segments[0]!.to).toEqual({ x: 15, y: 0 });
    expect(lines[0]!.width).toBe(6);
    expect(lines[0]!.seed).toBe('0');
    expect(strokesToLines(drawing, { scale: 3 })).toEqual(lines);
  });

  it('keeps stroke seeds when fills are added', () => {
    const more = { shapes: [{ type: 'fill' as const, subpaths: [], color: '#000000', rule: 'nonzero' as const, opacity: 1 }, ...drawing.shapes] };
    expect(strokesToLines(more).map((l) => l.seed)).toEqual(strokesToLines(drawing).map((l) => l.seed));
  });
});

describe('parseColor', () => {
  it('reads CSS colours as #rrggbb and alpha', () => {
    expect(parseColor('Navy')).toEqual({ hex: '#000080', alpha: 1 });
    expect(parseColor(' #F00 ')).toEqual({ hex: '#ff0000', alpha: 1 });
    expect(parseColor('rgba(0, 128, 255, 40%)')).toEqual({ hex: '#0080ff', alpha: 0.4 });
    expect(parseColor('hsl(240 100% 50%)')).toEqual({ hex: '#0000ff', alpha: 1 });
    expect(parseColor('hsl(0.5turn, 100%, 50%)')).toEqual({ hex: '#00ffff', alpha: 1 });
  });

  it('returns undefined for what it cannot read', () => {
    for (const text of ['currentColor', 'none', 'url(#g)', 'var(--c)', '#12345', 'rgb(1,2)', 'oklch(0.5 0.1 20)', '']) {
      expect(parseColor(text), text).toBeUndefined();
    }
  });
});
