import type { FlatLine } from './geometry/flatten';
import type { Tuning } from './tuning';

/**
 * Moves every point a little sideways, the way a hand drifts from the line it
 * means to follow. The drift is smooth along the line and never larger than
 * `wobbleAmount`. On a closed line it returns to the same value where the
 * line meets itself, so there is no step at the join.
 *
 * `noise` is smooth 1D noise in [-1, 1], seeded for this stroke.
 */
export function wobbleLine(
  line: FlatLine,
  tuning: Pick<Tuning, 'wobbleAmount' | 'wobbleWavelength'>,
  noise: (x: number) => number,
): FlatLine {
  if (tuning.wobbleAmount === 0 || line.points.length < 2) return line;
  const { points, length } = line;
  const scale = 1 / tuning.wobbleWavelength;

  const drift = (distance: number): number => {
    if (!line.closed || length === 0) return noise(distance * scale);
    // Blend towards the noise one lap earlier, so the end matches the start.
    const share = distance / length;
    return noise(distance * scale) * (1 - share) + noise((distance - length) * scale) * share;
  };

  return {
    ...line,
    points: points.map((point, i) => {
      const last = points.length - 1;
      // On a closed line the first and last points are the same, so their neighbours wrap around the join.
      const before = points[i > 0 ? i - 1 : line.closed ? last - 1 : 0]!;
      const after = points[i < last ? i + 1 : line.closed ? 1 : last]!;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const span = Math.hypot(dx, dy);
      if (span === 0) return point;
      const offset = drift(point.distance) * tuning.wobbleAmount;
      // The normal points to the left of the travel direction.
      return { ...point, x: point.x - (dy / span) * offset, y: point.y + (dx / span) * offset };
    }),
  };
}
