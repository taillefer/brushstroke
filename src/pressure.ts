import type { FlatLine } from './geometry/flatten';
import type { Tuning } from './tuning';

/**
 * The pressure at every point of a line, from 0 to 1. It is built from four
 * parts:
 *
 * 1. A base pressure with extra weight where the hand slows down: at the
 *    SVG's anchor points and, more, at corners.
 * 2. More pressure when the brush pulls down, less when it pushes up.
 * 3. Smooth seeded noise along the line.
 * 4. A touch-down at the start and a lift-off at the end, which blend the
 *    result toward lighter pressures.
 *
 * `noise` is smooth 1D noise in [-1, 1], seeded for this line.
 */
export function linePressure(
  line: FlatLine,
  brushSize: number,
  tuning: Tuning,
  noise: (x: number) => number,
): number[] {
  const { points, length } = line;
  const spread = Math.max(tuning.slowdownLength * brushSize, 1e-6);
  const anchorBump = bumpAround(line, (p) => p.anchor, spread);
  const cornerBump = bumpAround(line, (p) => p.corner, spread);
  const startLength = tuning.startTaperLength * brushSize;
  const endLength = tuning.endTaperLength * brushSize;

  return points.map((point, i) => {
    const direction = travelDirectionY(line, i);
    let pressure = tuning.basePressure
      + tuning.anchorPressure * anchorBump[i]!
      + tuning.cornerPressure * cornerBump[i]!
      + tuning.directionPressure * 0.5 * direction
      + tuning.noiseAmount * noise(point.distance / tuning.noiseWavelength);

    pressure = mix(tuning.touchDownPressure, pressure, ramp(point.distance, startLength));
    pressure = mix(tuning.liftOffPressure, pressure, ramp(length - point.distance, endLength));
    return Math.min(1, Math.max(0, pressure));
  });
}

/**
 * For every point, a value from 0 to 1 that is 1 at the marked points and
 * falls off smoothly to 0 at `spread` pixels from them.
 */
function bumpAround(line: FlatLine, marked: (p: FlatLine['points'][number]) => boolean, spread: number): number[] {
  const centres = line.points.filter(marked).map((p) => p.distance);
  return line.points.map((p) => {
    let best = 0;
    for (const centre of centres) {
      let gap = Math.abs(p.distance - centre);
      if (line.closed) gap = Math.min(gap, line.length - gap);
      if (gap < spread) best = Math.max(best, smooth(1 - gap / spread));
    }
    return best;
  });
}

/** The vertical part of the travel direction at a point: 1 straight down, -1 straight up. */
function travelDirectionY(line: FlatLine, i: number): number {
  const { points } = line;
  const before = points[Math.max(0, i - 1)]!;
  const after = points[Math.min(points.length - 1, i + 1)]!;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy);
  return length > 0 ? dy / length : 0;
}

/** 0 at distance 0, rising smoothly to 1 at `length`. */
function ramp(distance: number, length: number): number {
  if (length <= 0) return 1;
  return smooth(Math.min(1, Math.max(0, distance / length)));
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
