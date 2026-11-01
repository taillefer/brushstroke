import { describe, expect, it } from 'vitest';
import { flattenLine } from '../src/geometry/flatten';
import { parsePathData } from '../src/parse/pathData';
import { defaultTuning } from '../src/tuning';
import type { SvgLine } from '../src/types';

const line = (d: string): SvgLine => ({ ...parsePathData(d)[0]!, color: 'black' });
const flatten = (d: string) => flattenLine(line(d), defaultTuning);

const gaps = (points: { x: number; y: number }[]) =>
  points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));

describe('flattenLine', () => {
  it('spaces points about 1 px apart on a straight line', () => {
    const flat = flatten('M0 0 L100 0');
    expect(flat.points).toHaveLength(101);
    for (const gap of gaps(flat.points)) expect(gap).toBeCloseTo(1, 6);
    expect(flat.length).toBeCloseTo(100, 6);
    expect(flat.points.at(-1)!.distance).toBeCloseTo(100, 6);
  });

  it('spaces points about 1 px apart on a circle', () => {
    const flat = flatten('M60 50 A10 10 0 1 1 40 50 A10 10 0 1 1 60 50 Z');
    expect(flat.length).toBeCloseTo(2 * Math.PI * 10, 1);
    for (const gap of gaps(flat.points)) {
      expect(gap).toBeGreaterThan(0.9);
      expect(gap).toBeLessThanOrEqual(1.0001);
    }
  });

  it('keeps every anchor point exactly, and marks it', () => {
    const flat = flatten('M0 0 L10.5 0 L10.5 7.25');
    const anchors = flat.points.filter((p) => p.anchor);
    expect(anchors.map((p) => [p.x, p.y])).toEqual([[0, 0], [10.5, 0], [10.5, 7.25]]);
  });

  it('marks each corner of a zigzag once, at the vertex', () => {
    const flat = flatten('M0 0 L20 20 L40 0 L60 20');
    const corners = flat.points.filter((p) => p.corner);
    expect(corners.map((p) => [p.x, p.y])).toEqual([[20, 20], [40, 0]]);
  });

  it('marks no corners on a smooth curve', () => {
    const flat = flatten('M0 50 C30 0 70 0 100 50 S170 100 200 50');
    expect(flat.points.some((p) => p.corner)).toBe(false);
  });

  it('marks the corners of a closed square, including the start', () => {
    const flat = flatten('M0 0 H30 V30 H0 Z');
    expect(flat.closed).toBe(true);
    const corners = flat.points.filter((p) => p.corner).map((p) => [p.x, p.y]);
    expect(corners).toEqual([[0, 0], [30, 0], [30, 30], [0, 30], [0, 0]]);
  });

  it('respects cornerAngle', () => {
    // A 30° bend is a corner only when the limit is below 30°.
    const d = `M0 0 L50 0 L${50 + 50 * Math.cos(Math.PI / 6)} ${50 * Math.sin(Math.PI / 6)}`;
    expect(flattenLine(line(d), { cornerAngle: 20 }).points.some((p) => p.corner)).toBe(true);
    expect(flattenLine(line(d), { cornerAngle: 40 }).points.some((p) => p.corner)).toBe(false);
  });
});
