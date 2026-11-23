import type { Point, Segment, SvgLine } from '../types';
import { SegmentMeasure, subSegment } from './bezier';

export interface DashLineOptions {
  /**
   * How far into the pattern the line starts, in the units of the line, like
   * SVG `stroke-dashoffset`. Negative values start before it. Default 0.
   */
  offset?: number;
}

// Lengths closer than this, in the units of the line, are taken as equal, so
// a dash that ends on an anchor does not leave a sliver.
const EPSILON = 1e-9;

/**
 * Cuts a line into dashes, so each dash is painted as its own brush stroke
 * with its own touch-down and lift-off. Run it before `paintLines` or
 * `planLines`.
 *
 * `pattern` alternates dash and gap lengths in the units of the line, like
 * SVG `stroke-dasharray`: `[12, 6]` is 12 on, 6 off. A pattern with an odd
 * number of entries is repeated once to make it even. An empty pattern, or
 * one whose lengths are all 0, leaves the line solid and returns it as is.
 * For dots, use a dash much shorter than the brush is wide, such as
 * `[0.1, 10]`: the brush touches down and lifts at once, which leaves a dab.
 * Dashes of length 0 are left out.
 *
 * Segments are cut exactly where the length runs out: a line is cut into a
 * line, and a cubic into the cubic that runs over the same part of the curve
 * (the position along a cubic is found numerically, to well below a
 * thousandth of a unit). Each dash keeps the anchors inside it.
 *
 * On a closed line, a dash that runs over the start point is one dash, not
 * two. Dashes are open lines, in order along the line.
 *
 * Every dash has the line's fields, such as `color`, with its own `seed`:
 * `<seed>/d<n>` for the n-th dash, counted from 0, so each dash keeps its look
 * as long as its place in the pattern does. A line without a seed gives
 * dashes without one, whose look then depends on their position in the list.
 *
 * `width` is kept. With `widthEnd`, each dash gets the widths the line has
 * where the dash starts and ends, so the dashes widen together like the
 * whole line would; `width` must then be set too.
 */
export function dashLine<T extends SvgLine>(line: T, pattern: readonly number[], options: DashLineOptions = {}): T[] {
  for (const length of pattern) {
    if (!(Number.isFinite(length) && length >= 0)) {
      throw new RangeError(`brushstroke: a dash pattern needs lengths of 0 or more, not ${length}`);
    }
  }
  const lengths = pattern.length % 2 === 1 ? [...pattern, ...pattern] : [...pattern];
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return [line];
  if (line.widthEnd !== undefined && line.width === undefined) {
    throw new RangeError('brushstroke: dashLine needs `width` on a line that has `widthEnd`');
  }
  const offset = options.offset ?? 0;
  if (!Number.isFinite(offset)) throw new RangeError('brushstroke: a dash offset must be a number');

  // Where in the pattern the line starts.
  let index = 0;
  let remaining = ((offset % total) + total) % total;
  while (remaining >= lengths[index]!) {
    remaining -= lengths[index]!;
    index = (index + 1) % lengths.length;
  }
  remaining = lengths[index]! - remaining;

  interface Piece {
    start: Point;
    segments: Segment[];
    from: number;
    to: number;
  }
  const pieces: Piece[] = [];
  let current: Piece | null = null;
  let travelled = 0;
  let from = line.start;

  const add = (segmentFrom: Point, segment: Segment, measure: SegmentMeasure, s0: number, s1: number) => {
    if (s1 - s0 <= EPSILON) return;
    const t0 = measure.tAt(s0);
    const t1 = s1 >= measure.length - EPSILON ? 1 : measure.tAt(s1);
    const part = subSegment(segmentFrom, segment, t0, t1);
    if (!current) current = { start: part.start, segments: [], from: travelled + s0, to: travelled + s0 };
    current.segments.push(part.segment);
    current.to = travelled + s1;
  };

  for (const segment of line.segments) {
    const measure = new SegmentMeasure(from, segment);
    let s = 0;
    for (;;) {
      const left = measure.length - s;
      const on = index % 2 === 0;
      if (remaining > left + EPSILON) {
        if (on) add(from, segment, measure, s, measure.length);
        remaining -= left;
        break;
      }
      // The dash or gap ends inside this segment (or on its end).
      if (on) {
        add(from, segment, measure, s, Math.min(measure.length, s + remaining));
        if (current) pieces.push(current);
        current = null;
      }
      s = Math.min(measure.length, s + remaining);
      index = (index + 1) % lengths.length;
      remaining = lengths[index]!;
    }
    travelled += measure.length;
    from = segment.to;
  }
  if (current) pieces.push(current);

  let closed = false;
  if (line.closed && pieces.length > 0) {
    const first = pieces[0]!;
    const last = pieces[pieces.length - 1]!;
    const startsOn = first.from <= EPSILON;
    const endsOn = last.to >= travelled - EPSILON;
    if (pieces.length === 1 && startsOn && endsOn) {
      // The pattern is longer than the ring: one dash all round.
      closed = true;
    } else if (pieces.length > 1 && startsOn && endsOn) {
      pieces[0] = { start: last.start, segments: [...last.segments, ...first.segments], from: last.from, to: first.to };
      pieces.pop();
    }
  }

  const widthAt = (distance: number): number => {
    const start = line.width!;
    const end = line.widthEnd!;
    return start + (end - start) * (travelled > 0 ? distance / travelled : 0);
  };
  return pieces.map((piece, n): T => ({
    ...line,
    start: piece.start,
    segments: piece.segments,
    closed,
    ...(line.seed === undefined ? {} : { seed: `${line.seed}/d${n}` }),
    ...(line.widthEnd === undefined ? {} : { width: widthAt(piece.from), widthEnd: widthAt(piece.to) }),
  }));
}
