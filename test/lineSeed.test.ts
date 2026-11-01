// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseSvg } from '../src/parse/svg';
import { planPainting } from '../src/plan';
import { lineSeedNumber } from '../src/random';
import { resolveTuning } from '../src/tuning';
import type { ParsedSvg, SvgLine } from '../src/types';

const line = (y: number, color: string, seed?: string | number): SvgLine => ({
  start: { x: 10, y },
  segments: [{ kind: 'line', to: { x: 90, y: y + 10 } }],
  closed: false,
  color,
  ...(seed === undefined ? {} : { seed }),
});

const parsed = (lines: SvgLine[]): ParsedSvg => ({ width: 100, height: 100, lines });

/** The bristle paths of the line painted in `color`. Each test line has its own colour. */
const pathsOf = (svg: ParsedSvg, color: string, seed = 7) =>
  planPainting(svg, seed, 100, { brush: 'flat', size: 12, hand: 'right' }, resolveTuning()).paths.filter(
    (path) => path.color === color,
  );

describe('seed per line', () => {
  const a = line(20, 'red', 'coast-1');
  const b = line(50, 'blue', 42);
  const extra = line(80, 'green');

  it('keeps a seeded line identical when a line is added or removed before it', () => {
    const before = parsed([a, b]);
    expect(pathsOf(parsed([extra, a, b]), 'red')).toEqual(pathsOf(before, 'red'));
    expect(pathsOf(parsed([extra, a, b]), 'blue')).toEqual(pathsOf(before, 'blue'));
    expect(pathsOf(parsed([b]), 'blue')).toEqual(pathsOf(before, 'blue'));
  });

  it('moves an unseeded line with its position, as before', () => {
    const unseeded = line(20, 'red');
    expect(pathsOf(parsed([extra, unseeded]), 'red')).not.toEqual(pathsOf(parsed([unseeded]), 'red'));
  });

  it('still changes a seeded line when the overall seed changes', () => {
    expect(pathsOf(parsed([a]), 'red', 1)).not.toEqual(pathsOf(parsed([a]), 'red', 2));
  });

  it('gives different lines different variations', () => {
    const twin = { ...a, color: 'blue', seed: 'coast-2' };
    const paths = (l: SvgLine) => pathsOf(parsed([l]), l.color).map((p) => p.points);
    expect(paths(twin)).not.toEqual(paths(a));
  });

  it('does not mix up a numeric line seed with a line position', () => {
    const atZero = line(20, 'red');
    const seededZero = { ...atZero, seed: 0 };
    expect(pathsOf(parsed([seededZero]), 'red')).not.toEqual(pathsOf(parsed([atZero]), 'red'));
  });

  it('hashes text seeds and keeps number seeds', () => {
    expect(lineSeedNumber('coast-1')).toBe(lineSeedNumber('coast-1'));
    expect(lineSeedNumber('coast-1')).not.toBe(lineSeedNumber('coast-2'));
    expect(lineSeedNumber(42)).toBe(42);
  });
});

describe('seed from the SVG element id', () => {
  const svg = (front: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    ${front}
    <path id="river" d="M10 10 C40 80 60 80 90 10 M10 90 L90 90" stroke="teal"/>
  </svg>`;

  it('takes the seed from the id, and tells the subpaths of one element apart', () => {
    expect(parseSvg(svg('')).lines.map((l) => l.seed)).toEqual(['river', 'river/1']);
  });

  it('leaves lines without an id unseeded', () => {
    expect(parseSvg(svg('<line x1="0" y1="0" x2="10" y2="10"/>')).lines[0]!.seed).toBeUndefined();
  });

  it('paints an element with an id the same after another element is added in front of it', () => {
    const plain = parseSvg(svg(''));
    const added = parseSvg(svg('<line x1="0" y1="0" x2="100" y2="100" stroke="black"/>'));
    expect(pathsOf(added, 'teal', 42)).toEqual(pathsOf(plain, 'teal', 42));
  });
});
