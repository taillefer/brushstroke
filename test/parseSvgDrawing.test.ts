import { describe, expect, it } from 'vitest';
import { parseSvgDrawing } from '../src';
import type { SvgFill, SvgStroke } from '../src';
import { anchors, expectPoints } from './helpers';

const svg = (body: string, attrs = 'viewBox="0 0 10 10"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('parseSvgDrawing', () => {
  it('fills a shape with no paint set in black and gives it no stroke', () => {
    const { shapes } = parseSvgDrawing(svg('<rect width="4" height="4"/>'));
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ type: 'fill', color: '#000000', rule: 'nonzero', opacity: 1 });
  });

  it('gives the fill before the stroke for one element, and keeps document order', () => {
    const { shapes } = parseSvgDrawing(svg('<circle cx="5" cy="5" r="2" fill="red" stroke="blue"/><rect width="1" height="1" fill="green"/>'));
    expect(shapes.map((s) => `${s.type}:${s.color}`)).toEqual(['fill:#ff0000', 'stroke:#0000ff', 'fill:#008000']);
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
    expect(shapes.map((s) => s.color)).toEqual(['#800080', '#ffa500']);
  });

  it('throws on text that is not SVG', () => {
    expect(() => parseSvgDrawing('not svg')).toThrow(/not a valid SVG/);
  });
});

describe('parseSvgDrawing colours and opacity', () => {
  const colors = (body: string) => parseSvgDrawing(svg(body)).shapes.map((s) => [s.color, Number(s.opacity.toFixed(3))]);
  const rect = (fill: string) => `<rect width="1" height="1" fill="${fill}"/>`;

  it('normalises colours to #rrggbb and moves alpha into opacity', () => {
    expect(colors(['RED', '#AbC', '#abcd', '#a1b2c3', '#a1b2c380', 'rgb(255, 0, 128)', 'rgb(100% 0% 50%)',
      'rgba(0,0,255,0.25)', 'rgb(0 0 255 / 50%)', 'hsl(120, 100%, 25%)', 'hsla(0deg 100% 50% / .5)', 'transparent'].map(rect).join(''))).toEqual([
      ['#ff0000', 1], ['#aabbcc', 1], ['#aabbcc', 0.867], ['#a1b2c3', 1], ['#a1b2c3', 0.502], ['#ff0080', 1], ['#ff0080', 1],
      ['#0000ff', 0.25], ['#0000ff', 0.5], ['#008000', 1], ['#ff0000', 0.5], ['#000000', 0],
    ]);
  });

  it('ignores colours it cannot read, so the inherited paint applies', () => {
    expect(colors(`<g fill="navy">${rect('var(--x)')}${rect('lab(50% 40 59)')}</g>${rect('bogus')}`)).toEqual([
      ['#000080', 1], ['#000080', 1], ['#000000', 1],
    ]);
  });

  it('resolves currentColor at the element that uses it, keeping the alpha of color', () => {
    expect(colors(`<g fill="currentColor" color="rgba(255,0,0,0.5)">${rect('currentColor')}<g color="blue"><rect width="1" height="1"/></g></g>${rect('currentColor')}`)).toEqual([
      ['#ff0000', 0.5], ['#0000ff', 1], ['#000000', 1],
    ]);
  });

  it('combines opacity down the tree with fill-opacity and stroke-opacity', () => {
    const { shapes } = parseSvgDrawing(svg(`<g opacity="0.5" fill-opacity="50%">
      <rect width="1" height="1" opacity="0.5" stroke="rgba(0,0,0,0.5)" stroke-opacity="0.8"/>
      <rect width="1" height="1"/>
    </g>`));
    expect(shapes.map((s) => [s.type, s.opacity])).toEqual([['fill', 0.125], ['stroke', 0.1], ['fill', 0.25]]);
  });

  it('clamps opacity and ignores values it cannot read', () => {
    const { shapes } = parseSvgDrawing(svg('<g fill-opacity="0.5"><rect width="1" height="1" opacity="2"/><rect width="1" height="1" fill-opacity="x"/></g>'));
    expect(shapes.map((s) => s.opacity)).toEqual([0.5, 0.5]);
  });

  it('reads stroke-linecap and stroke-linejoin, inherited, with SVG defaults', () => {
    const { shapes } = parseSvgDrawing(svg(`
      <path d="M0 0L1 1" fill="none" stroke="red"/>
      <g style="stroke-linecap: round; stroke-linejoin: round"><path d="M0 0L1 1" fill="none" stroke="red" stroke-linejoin="bevel"/></g>
      <path d="M0 0L1 1" fill="none" stroke="red" stroke-linecap="square" stroke-linejoin="miter-clip"/>
      <path d="M0 0L1 1" fill="none" stroke="red" stroke-linecap="wide"/>`));
    expect((shapes as SvgStroke[]).map((s) => [s.linecap, s.linejoin])).toEqual([
      ['butt', 'miter'], ['round', 'bevel'], ['square', 'miter'], ['butt', 'miter'],
    ]);
  });
});
