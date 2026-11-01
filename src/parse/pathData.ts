import type { Point, Segment, Subpath } from '../types';
import { arcToSegments } from './arc';

const ARGUMENT_COUNT: Record<string, number> = {
  m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0,
};

/**
 * Parses the `d` attribute of a `<path>` into subpaths of line and cubic
 * segments. Quadratic curves and arcs become cubics. As in browsers, an error
 * stops parsing and the path up to the error is kept.
 */
export function parsePathData(d: string): Subpath[] {
  const scanner = new Scanner(d);
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  let point: Point = { x: 0, y: 0 };
  // The control point the next S or T command reflects, if the last command
  // was a curve of the same kind.
  let lastCubicControl: Point | null = null;
  let lastQuadControl: Point | null = null;
  let command = '';

  const finish = () => {
    if (current && current.segments.length > 0) subpaths.push(current);
    current = null;
  };
  const add = (segment: Segment) => {
    current ??= { start: point, segments: [], closed: false };
    current.segments.push(segment);
    point = segment.to;
  };

  while (scanner.skipSeparators()) {
    const letter = scanner.readCommand();
    if (letter) command = letter;
    else if (!command || command.toLowerCase() === 'z') break;

    const lower = command.toLowerCase();
    const relative = command !== command.toUpperCase();
    const args = lower === 'a' ? scanner.readArcArguments() : scanner.readNumbers(ARGUMENT_COUNT[lower] ?? 0);
    if (!args) break;

    const abs = (x: number, y: number): Point =>
      relative ? { x: point.x + x, y: point.y + y } : { x, y };
    let cubicControl: Point | null = null;
    let quadControl: Point | null = null;

    switch (lower) {
      case 'm': {
        finish();
        point = abs(args[0]!, args[1]!);
        current = { start: point, segments: [], closed: false };
        // Further coordinate pairs after a moveto are linetos.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'l':
        add({ kind: 'line', to: abs(args[0]!, args[1]!) });
        break;
      case 'h':
        add({ kind: 'line', to: { x: relative ? point.x + args[0]! : args[0]!, y: point.y } });
        break;
      case 'v':
        add({ kind: 'line', to: { x: point.x, y: relative ? point.y + args[0]! : args[0]! } });
        break;
      case 'c': {
        const c1 = abs(args[0]!, args[1]!);
        const c2 = abs(args[2]!, args[3]!);
        add({ kind: 'cubic', c1, c2, to: abs(args[4]!, args[5]!) });
        cubicControl = c2;
        break;
      }
      case 's': {
        const c1 = reflect(lastCubicControl, point);
        const c2 = abs(args[0]!, args[1]!);
        add({ kind: 'cubic', c1, c2, to: abs(args[2]!, args[3]!) });
        cubicControl = c2;
        break;
      }
      case 'q': {
        const control = abs(args[0]!, args[1]!);
        add(quadToCubic(point, control, abs(args[2]!, args[3]!)));
        quadControl = control;
        break;
      }
      case 't': {
        const control = reflect(lastQuadControl, point);
        add(quadToCubic(point, control, abs(args[0]!, args[1]!)));
        quadControl = control;
        break;
      }
      case 'a': {
        const [rx, ry, rotation, largeArc, sweep, x, y] = args as [number, number, number, number, number, number, number];
        const from = point;
        const to = abs(x, y);
        const segments = arcToSegments(from, rx, ry, rotation, largeArc === 1, sweep === 1, to);
        for (const segment of segments) add(segment);
        point = to;
        break;
      }
      case 'z': {
        if (current) {
          const { start } = current;
          if (point.x !== start.x || point.y !== start.y) add({ kind: 'line', to: start });
          current.closed = true;
          point = start;
          finish();
        }
        break;
      }
    }
    lastCubicControl = cubicControl;
    lastQuadControl = quadControl;
  }
  finish();
  return subpaths;
}

function reflect(control: Point | null, around: Point): Point {
  return control ? { x: 2 * around.x - control.x, y: 2 * around.y - control.y } : around;
}

/** A quadratic Bézier written as the identical cubic. */
function quadToCubic(from: Point, control: Point, to: Point): Segment {
  return {
    kind: 'cubic',
    c1: { x: from.x + (2 / 3) * (control.x - from.x), y: from.y + (2 / 3) * (control.y - from.y) },
    c2: { x: to.x + (2 / 3) * (control.x - to.x), y: to.y + (2 / 3) * (control.y - to.y) },
    to,
  };
}

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

class Scanner {
  private index = 0;
  constructor(private readonly text: string) {}

  /** Skips whitespace and commas. Returns false at the end of the text. */
  skipSeparators(): boolean {
    while (this.index < this.text.length && /[\s,]/.test(this.text[this.index]!)) this.index++;
    return this.index < this.text.length;
  }

  readCommand(): string | null {
    const char = this.text[this.index];
    if (char && /[MmLlHhVvCcSsQqTtAaZz]/.test(char)) {
      this.index++;
      return char;
    }
    return null;
  }

  readNumber(): number | null {
    this.skipSeparators();
    NUMBER.lastIndex = this.index;
    const match = NUMBER.exec(this.text);
    if (!match) return null;
    this.index = NUMBER.lastIndex;
    return Number(match[0]);
  }

  readNumbers(count: number): number[] | null {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      const value = this.readNumber();
      if (value === null) return null;
      values.push(value);
    }
    return values;
  }

  /** Arc flags are single characters and may be written without separators, as in "a5 5 0 01 10 10". */
  readArcArguments(): number[] | null {
    const radii = this.readNumbers(3);
    if (!radii) return null;
    const flags: number[] = [];
    for (let i = 0; i < 2; i++) {
      this.skipSeparators();
      const char = this.text[this.index];
      if (char !== '0' && char !== '1') return null;
      flags.push(Number(char));
      this.index++;
    }
    const end = this.readNumbers(2);
    return end ? [...radii, ...flags, ...end] : null;
  }
}
