import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { paintLines, type PaintLinesOptions } from '../src/paintLines';
import type { SvgLine } from '../src/types';
import { loggingContext, rendering } from './callLog';

// Safety net for performance work: the exact canvas calls paintLines makes for
// a few inputs, recorded from the code before any optimisation. A change that
// alters these logs changes what gets painted. Only regenerate the fixtures
// (BRUSHSTROKE_WRITE_FIXTURES=1 npm test) for a change that is meant to alter
// the look, never to make a speed-up pass.

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'calls');

const straight: SvgLine = { start: { x: 4, y: 6 }, segments: [{ kind: 'line', to: { x: 70, y: 16 } }], closed: false, color: 'black' };
const cubic: SvgLine = {
  start: { x: 10, y: 30 },
  segments: [{ kind: 'cubic', c1: { x: 40, y: 0 }, c2: { x: 70, y: 80 }, to: { x: 110, y: 40 } }],
  closed: false,
  color: 'teal',
};
const square: SvgLine = {
  start: { x: 10, y: 10 },
  segments: [
    { kind: 'line', to: { x: 30, y: 10 } },
    { kind: 'line', to: { x: 30, y: 30 } },
    { kind: 'line', to: { x: 10, y: 30 } },
    { kind: 'line', to: { x: 10, y: 10 } },
  ],
  closed: true,
  color: '#345',
};
const zigzag: SvgLine = {
  start: { x: 0, y: 0 },
  segments: [
    { kind: 'line', to: { x: 20, y: 20 } },
    { kind: 'line', to: { x: 40, y: 0 } },
    { kind: 'cubic', c1: { x: 50, y: 30 }, c2: { x: 60, y: -30 }, to: { x: 80, y: 0 } },
  ],
  closed: false,
  color: 'sienna',
};

const cases: Record<string, { lines: SvgLine[]; options: PaintLinesOptions }> = {
  'straight-flat-scale1': { lines: [straight], options: {} },
  'cubic-round-scale0.5': { lines: [cubic], options: { brush: 'round', size: 8, transform: { scale: 0.5 } } },
  'many-flat-scale2': {
    lines: [{ ...straight, seed: 'road-1' }, { ...zigzag, seed: 42 }, { ...straight, start: { x: 4, y: 30 } }],
    options: { seed: 7, size: 6, transform: { scale: 2, x: 30, y: -12 } },
  },
  'square-round-left-scale2': { lines: [square], options: { brush: 'round', hand: 'left', size: 10, transform: { scale: 2 } } },
  'zigzag-flat-scale0.5-dry': {
    lines: [zigzag, { ...straight, seed: 'x' }],
    options: { seed: 3, size: 5, transform: { scale: 0.5, x: 3.25, y: 1.5 }, tuning: { dryDistance: 40, grainAmount: 0.9 } },
  },
};

const record = ({ lines, options }: (typeof cases)[string]) => {
  const { context, log } = loggingContext();
  paintLines(context, lines, options);
  return log;
};

describe('paintLines call log', () => {
  for (const [name, input] of Object.entries(cases)) {
    it(`paints ${name} exactly as recorded`, () => {
      const file = join(FIXTURES, `${name}.txt`);
      const log = record(input);
      if (process.env.BRUSHSTROKE_WRITE_FIXTURES === '1' || !existsSync(file)) {
        if (process.env.CI) throw new Error(`missing fixture ${file}`);
        mkdirSync(FIXTURES, { recursive: true });
        writeFileSync(file, `${log.join('\n')}\n`);
      }
      const expected = readFileSync(file, 'utf8').trimEnd().split('\n');
      expect(log.length).toBeGreaterThan(100);
      // The same strokes, with the same state, in the same order. The calls
      // themselves may differ: drawing skips setting a property to the value
      // it already has, which paints the same pixels.
      expect(rendering(log)).toEqual(rendering(expected));
    });
  }
});

describe('rendering', () => {
  const log = ['save()', 'translate(5,0)', 'globalAlpha=0.5', 'strokeStyle=red', 'beginPath()', 'moveTo(0,0)', 'lineTo(1,1)', 'stroke()', 'restore()'];

  it('ignores a property set to the value it already has, and one no stroke uses', () => {
    const redundant = [...log.slice(0, 4), 'globalAlpha=0.5', 'lineWidth=3', 'lineWidth=1', ...log.slice(4), 'strokeStyle=blue'];
    expect(rendering(redundant)).toEqual(rendering([...log.slice(0, 4), 'lineWidth=1', ...log.slice(4)]));
  });

  it('tells apart a different opacity, colour, position or stroke order', () => {
    const base = rendering(log);
    expect(rendering(log.map((e) => (e === 'globalAlpha=0.5' ? 'globalAlpha=0.25' : e)))).not.toEqual(base);
    expect(rendering(log.map((e) => (e === 'strokeStyle=red' ? 'strokeStyle=blue' : e)))).not.toEqual(base);
    expect(rendering(log.map((e) => (e === 'translate(5,0)' ? 'translate(6,0)' : e)))).not.toEqual(base);
    expect(rendering(log.filter((e) => e !== 'stroke()'))).not.toEqual(base);
  });
});
