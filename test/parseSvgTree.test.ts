import { describe, expect, it } from 'vitest';
import { parseTransform, applyToPoint } from '../src/parse/matrix';
import { parseSvgTree, type SvgNode } from '../src/parse/svg';
import { anchors, expectPoint, expectPoints, samplePoints } from './helpers';

const el = (name: string, attributes: Record<string, string> = {}, children: SvgNode[] = []): SvgNode =>
  ({ name, attributes, children });

const svg = (children: SvgNode[], attributes: Record<string, string> = { width: '100', height: '100' }) =>
  el('svg', attributes, children);

describe('element types', () => {
  it('line', () => {
    const { lines } = parseSvgTree(svg([el('line', { x1: '1', y1: '2', x2: '30', y2: '40' })]));
    expect(lines).toHaveLength(1);
    expectPoints(anchors(lines[0]!), [[1, 2], [30, 40]]);
    expect(lines[0]!.closed).toBe(false);
  });

  it('polyline and polygon', () => {
    const { lines } = parseSvgTree(svg([
      el('polyline', { points: '0,0 10,0 10,10' }),
      el('polygon', { points: '0 0, 10 0, 10 10' }),
    ]));
    expectPoints(anchors(lines[0]!), [[0, 0], [10, 0], [10, 10]]);
    expect(lines[0]!.closed).toBe(false);
    expectPoints(anchors(lines[1]!), [[0, 0], [10, 0], [10, 10], [0, 0]]);
    expect(lines[1]!.closed).toBe(true);
  });

  it('rect, with and without rounded corners', () => {
    const { lines } = parseSvgTree(svg([
      el('rect', { x: '10', y: '20', width: '30', height: '40' }),
      el('rect', { x: '0', y: '0', width: '40', height: '20', rx: '5' }),
    ]));
    expectPoints(anchors(lines[0]!), [[10, 20], [40, 20], [40, 60], [10, 60], [10, 20]]);

    const rounded = lines[1]!;
    expect(rounded.closed).toBe(true);
    expectPoint(rounded.start, 5, 0);
    expectPoint(rounded.segments.at(-1)!.to, 5, 0);
    // Every point lies inside the rectangle, and the corner is cut off.
    for (const p of samplePoints(rounded)) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(40 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(20 + 1e-9);
      expect(p.x < 1 && p.y < 1).toBe(false);
    }
  });

  it('circle and ellipse', () => {
    const { lines } = parseSvgTree(svg([
      el('circle', { cx: '50', cy: '50', r: '20' }),
      el('ellipse', { cx: '50', cy: '50', rx: '30', ry: '10' }),
    ]));
    const [circle, ellipse] = lines;
    expectPoint(circle!.start, 70, 50);
    // Clockwise on screen: the first quarter ends at the bottom.
    expectPoint(circle!.segments[0]!.to, 50, 70);
    // A cubic quarter circle is off by at most 0.027% of the radius.
    for (const p of samplePoints(circle!)) expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(20, 1);
    for (const p of samplePoints(ellipse!)) {
      expect(((p.x - 50) / 30) ** 2 + ((p.y - 50) / 10) ** 2).toBeCloseTo(1, 2);
    }
  });

  it('path with several subpaths gives one line per subpath', () => {
    const { lines } = parseSvgTree(svg([el('path', { d: 'M0 0 L10 0 M0 10 L10 10' })]));
    expect(lines).toHaveLength(2);
  });

  it('skips shapes with zero size and unknown elements', () => {
    const { lines } = parseSvgTree(svg([
      el('circle', { cx: '5', cy: '5', r: '0' }),
      el('rect', { width: '0', height: '10' }),
      el('text', {}, []),
      el('defs', {}, [el('line', { x2: '10' })]),
    ]));
    expect(lines).toHaveLength(0);
  });
});

describe('transforms', () => {
  it('parses each transform function', () => {
    expectPoint(applyToPoint(parseTransform('translate(5, 7)'), { x: 1, y: 1 }), 6, 8);
    expectPoint(applyToPoint(parseTransform('scale(2)'), { x: 1, y: 3 }), 2, 6);
    expectPoint(applyToPoint(parseTransform('scale(2 3)'), { x: 1, y: 1 }), 2, 3);
    expectPoint(applyToPoint(parseTransform('rotate(90)'), { x: 1, y: 0 }), 0, 1);
    expectPoint(applyToPoint(parseTransform('rotate(90 10 10)'), { x: 20, y: 10 }), 10, 20);
    expectPoint(applyToPoint(parseTransform('matrix(1 0 0 1 3 4)'), { x: 0, y: 0 }), 3, 4);
    expectPoint(applyToPoint(parseTransform('skewX(45)'), { x: 0, y: 10 }), 10, 10);
    expectPoint(applyToPoint(parseTransform('skewY(45)'), { x: 10, y: 0 }), 10, 10);
  });

  it('applies a list of transforms right to left, like SVG', () => {
    // Scale first, then translate.
    expectPoint(applyToPoint(parseTransform('translate(10,0) scale(2)'), { x: 1, y: 1 }), 12, 2);
  });

  it('applies nested group transforms, outer last', () => {
    const { lines } = parseSvgTree(svg([
      el('g', { transform: 'translate(100 0)' }, [
        el('g', { transform: 'scale(2)' }, [
          el('line', { x1: '0', y1: '0', x2: '10', y2: '5', transform: 'translate(1 1)' }),
        ]),
      ]),
    ], { width: '300', height: '100' }));
    expectPoints(anchors(lines[0]!), [[102, 2], [122, 12]]);
  });
});

describe('viewport', () => {
  it('maps the viewBox to width and height', () => {
    const parsed = parseSvgTree(svg([el('line', { x1: '0', y1: '0', x2: '10', y2: '10' })],
      { width: '200', height: '200', viewBox: '0 0 10 10' }));
    expect(parsed.width).toBe(200);
    expectPoints(anchors(parsed.lines[0]!), [[0, 0], [200, 200]]);
  });

  it('keeps the aspect ratio and centres the content by default', () => {
    const parsed = parseSvgTree(svg([el('line', { x1: '0', y1: '0', x2: '10', y2: '10' })],
      { width: '200', height: '100', viewBox: '0 0 10 10' }));
    expectPoints(anchors(parsed.lines[0]!), [[50, 0], [150, 100]]);
  });

  it('uses the viewBox size when width and height are missing', () => {
    const parsed = parseSvgTree(svg([], { viewBox: '0 0 24 12' }));
    expect([parsed.width, parsed.height]).toEqual([24, 12]);
  });

  it('derives a missing height from the viewBox ratio', () => {
    const parsed = parseSvgTree(svg([], { width: '48', viewBox: '0 0 24 12' }));
    expect(parsed.height).toBe(24);
  });
});

describe('colours and skipped elements', () => {
  const colorOf = (attributes: Record<string, string>, groupAttributes: Record<string, string> = {}) => {
    const { lines } = parseSvgTree(svg([el('g', groupAttributes, [el('rect', { width: '10', height: '10', ...attributes })])]));
    return lines[0]?.color ?? null;
  };

  it('uses the stroke colour', () => {
    expect(colorOf({ stroke: '#ff0000' })).toBe('#ff0000');
  });

  it('paints black when neither stroke nor fill is set', () => {
    expect(colorOf({})).toBe('black');
  });

  it('skips a shape with a fill and no stroke', () => {
    expect(colorOf({ fill: 'red' })).toBeNull();
  });

  it('paints a shape with both fill and stroke, using the stroke', () => {
    expect(colorOf({ fill: 'red', stroke: 'blue' })).toBe('blue');
  });

  it('paints a shape whose fill is none in black', () => {
    expect(colorOf({ fill: 'none' })).toBe('black');
  });

  it('skips stroke="none"', () => {
    expect(colorOf({ stroke: 'none' })).toBeNull();
  });

  it('inherits stroke and fill from groups', () => {
    expect(colorOf({}, { stroke: 'green' })).toBe('green');
    expect(colorOf({}, { fill: 'green' })).toBeNull();
  });

  it('lets the style attribute win over the stroke attribute', () => {
    expect(colorOf({ stroke: 'red', style: 'stroke: blue; fill: none' })).toBe('blue');
  });

  it('resolves currentColor and gradient fallbacks', () => {
    expect(colorOf({ stroke: 'currentColor' }, { color: 'purple' })).toBe('purple');
    expect(colorOf({ stroke: 'url(#gradient) orange' })).toBe('orange');
    expect(colorOf({ stroke: 'url(#gradient)' })).toBe('black');
  });

  it('skips hidden elements', () => {
    expect(colorOf({ display: 'none' })).toBeNull();
    expect(colorOf({}, { display: 'none' })).toBeNull();
    expect(colorOf({ visibility: 'hidden' })).toBeNull();
  });
});
