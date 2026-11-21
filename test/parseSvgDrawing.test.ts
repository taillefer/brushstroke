// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseSvgDrawing } from '../src';
import type { SvgFill, SvgStroke } from '../src';
import { anchors, expectPoints } from './helpers';

const svg = (body: string, attrs = 'viewBox="0 0 10 10"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('parseSvgDrawing', () => {
  it('fills a shape with no paint set in black and gives it no stroke', () => {
    const { shapes } = parseSvgDrawing(svg('<rect width="4" height="4"/>'));
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ type: 'fill', color: 'black', rule: 'nonzero' });
  });

  it('gives the fill before the stroke for one element, and keeps document order', () => {
    const { shapes } = parseSvgDrawing(svg('<circle cx="5" cy="5" r="2" fill="red" stroke="blue"/><rect width="1" height="1" fill="green"/>'));
    expect(shapes.map((s) => `${s.type}:${s.color}`)).toEqual(['fill:red', 'stroke:blue', 'fill:green']);
  });

  it('never fills a line', () => {
    const { shapes } = parseSvgDrawing(svg('<line x1="0" y1="0" x2="5" y2="5" stroke="black"/>'));
    expect(shapes.map((s) => s.type)).toEqual(['stroke']);
  });

  it('reads the fill rule, also when inherited', () => {
    const { shapes } = parseSvgDrawing(svg('<g fill-rule="evenodd"><path d="M0 0H10V10H0Z M2 2H8V8H2Z"/></g>'));
    const fill = shapes[0] as SvgFill;
    expect(fill.rule).toBe('evenodd');
    expect(fill.subpaths).toHaveLength(2);
  });

  it('scales the stroke width and the points with the transforms and the viewBox', () => {
    const { width, shapes } = parseSvgDrawing(
      svg('<g transform="scale(2)"><path d="M0 0L3 0" stroke="#123456" stroke-width="0.5" fill="none"/></g>', 'viewBox="0 0 10 10" width="100" height="100"'),
    );
    expect(width).toBe(100);
    const stroke = shapes[0] as SvgStroke;
    expect(stroke.color).toBe('#123456');
    expect(stroke.width).toBeCloseTo(10);
    expectPoints(anchors(stroke.subpaths[0]!), [[0, 0], [60, 0]]);
  });

  it('skips hidden elements and elements with fill and stroke set to none', () => {
    const { shapes } = parseSvgDrawing(
      svg('<rect width="1" height="1" display="none"/><rect width="1" height="1" visibility="hidden"/><rect width="1" height="1" fill="none"/>'),
    );
    expect(shapes).toEqual([]);
  });

  it('uses currentColor and the fallback after a gradient', () => {
    const { shapes } = parseSvgDrawing(svg('<g color="purple"><rect width="1" height="1" fill="currentColor"/><rect width="1" height="1" fill="url(#g) orange"/></g>'));
    expect(shapes.map((s) => s.color)).toEqual(['purple', 'orange']);
  });

  it('throws on text that is not SVG', () => {
    expect(() => parseSvgDrawing('not svg')).toThrow(/not a valid SVG/);
  });
});
