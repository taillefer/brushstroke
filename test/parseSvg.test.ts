// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseSvg } from '../src/parse/svg';
import { anchors, expectPoints } from './helpers';

describe('parseSvg', () => {
  it('parses SVG text with DOMParser', () => {
    const parsed = parseSvg(`<?xml version="1.0"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="100" height="100">
        <!-- a comment -->
        <g stroke="navy" transform="translate(1 0)">
          <line x1="0" y1="0" x2="5" y2="5"/>
        </g>
        <rect width="4" height="4" fill="red"/>
      </svg>`);
    expect(parsed.width).toBe(100);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0]!.color).toBe('navy');
    expectPoints(anchors(parsed.lines[0]!), [[10, 0], [60, 50]]);
  });

  it('throws on text that is not SVG', () => {
    expect(() => parseSvg('<svg><line></svg>')).toThrow(/not a valid SVG/);
    expect(() => parseSvg('<html></html>')).toThrow(/not a valid SVG/);
  });
});
