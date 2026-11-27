import { bumpAround, smoothstep } from './geometry/bump';
import type { FlatLine, LinePoint } from './geometry/flatten';
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
 * `noise` is smooth 1D noise in [-1, 1], seeded for this line, sampled by
 * distance along it. With `options.at`, the noise at a point comes from there
 * instead, already in [-1, 1]. `options.ends` turns off the touch-down or the
 * lift-off at an end that is not a real end, where a longer line was cut.
 */
export function linePressure(
  line: FlatLine,
  brushSize: number,
  tuning: Tuning,
  noise: (x: number) => number,
  options: { at?: (point: LinePoint) => number; ends?: { start: boolean; end: boolean } } = {},
): number[] {
  const { points, length } = line;
  const spread = tuning.slowdownLength * brushSize;
  const anchorBump = bumpAround(line, points.filter((p) => p.anchor).map((p) => p.distance), spread);
  const cornerBump = bumpAround(line, points.filter((p) => p.corner).map((p) => p.distance), spread);
  // On a line whose width changes, each taper is as long as the brush is wide at its end.
  const startLength = tuning.startTaperLength * (points[0]?.width ?? brushSize);
  const endLength = tuning.endTaperLength * (points[points.length - 1]?.width ?? brushSize);

  return points.map((point, i) => {
    const direction = travelDirectionY(line, i);
    let pressure = tuning.basePressure
      + tuning.anchorPressure * anchorBump[i]!
      + tuning.cornerPressure * cornerBump[i]!
      + tuning.directionPressure * 0.5 * direction
      + tuning.noiseAmount * (options.at ? options.at(point) : noise(point.distance / tuning.noiseWavelength));

    if (options.ends?.start !== false) pressure = mix(tuning.touchDownPressure, pressure, ramp(point.distance, startLength));
    if (options.ends?.end !== false) pressure = mix(tuning.liftOffPressure, pressure, ramp(length - point.distance, endLength));
    return Math.min(1, Math.max(0, pressure));
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
  return smoothstep(Math.min(1, Math.max(0, distance / length)));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
