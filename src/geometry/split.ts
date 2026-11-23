import type { Tuning } from '../tuning';
import type { Point } from '../types';
import { POINT_SPACING, withDistances, type FlatLine, type LinePoint } from './flatten';

/**
 * Splits a line into separate strokes at sharp corners, the way a person
 * lifts the brush. Each piece runs on `splitOvershoot` pixels past the
 * corners it touches, so the strokes overlap a little.
 *
 * Closed shapes and open lines have separate limits. People often paint a
 * rectangle as several strokes, but paint a zigzag or handwriting in one go
 * and only lift the brush at a near-reversal.
 *
 * Only marked corners can split a line, so a limit below `cornerAngle`
 * splits at every corner.
 */
export function splitAtCorners(
  line: FlatLine,
  tuning: Pick<Tuning, 'splitAngleClosed' | 'splitAngleOpen' | 'splitOvershoot'>,
  spacing = POINT_SPACING,
): FlatLine[] {
  const limit = ((line.closed ? tuning.splitAngleClosed : tuning.splitAngleOpen) * Math.PI) / 180;
  const { points } = line;
  const last = points.length - 1;
  const isSplit = (p: LinePoint, i: number) => p.corner && p.turn > limit && (line.closed || (i > 0 && i < last));
  // A closed line repeats its first point at the end. Leave the copy out.
  const ring = line.closed ? points.slice(0, -1) : points;
  const splits = ring.flatMap((p, i) => (isSplit(p, i) ? [i] : []));
  if (splits.length === 0) return [line];

  const pieces: { points: LinePoint[]; startsAtCorner: boolean; endsAtCorner: boolean }[] = [];
  if (line.closed) {
    for (let k = 0; k < splits.length; k++) {
      const from = splits[k]!;
      const to = splits[(k + 1) % splits.length]!;
      const piece = to > from ? ring.slice(from, to + 1) : [...ring.slice(from), ...ring.slice(0, to + 1)];
      pieces.push({ points: piece, startsAtCorner: true, endsAtCorner: true });
    }
  } else {
    const bounds = [0, ...splits, last];
    for (let k = 0; k + 1 < bounds.length; k++) {
      pieces.push({
        points: points.slice(bounds[k]!, bounds[k + 1]! + 1),
        startsAtCorner: k > 0,
        endsAtCorner: k + 2 < bounds.length,
      });
    }
  }

  return pieces.map(({ points: piece, startsAtCorner, endsAtCorner }) => {
    // The ends of a piece are stroke ends now, not corners inside a stroke.
    let result = piece.map((p, i) => (i === 0 || i === piece.length - 1 ? { ...p, corner: false, turn: 0 } : p));
    if (startsAtCorner) result = [...extension(result, 'start', tuning.splitOvershoot, spacing), ...result];
    if (endsAtCorner) result = [...result, ...extension(result, 'end', tuning.splitOvershoot, spacing)];
    const withLength = withDistances(result);
    return { points: withLength, closed: false, length: withLength.at(-1)!.distance, color: line.color };
  });
}

/** Points that continue the piece straight on past one of its ends, `spacing` apart. */
function extension(points: LinePoint[], end: 'start' | 'end', length: number, spacing: number): LinePoint[] {
  const count = Math.floor(length / spacing);
  if (count === 0 || points.length < 2) return [];
  // Measure the direction over a few points, so one uneven step does not tilt the overshoot.
  const reach = Math.min(points.length - 1, 3);
  const [tip, inner] = end === 'end'
    ? [points[points.length - 1]!, points[points.length - 1 - reach]!]
    : [points[0]!, points[reach]!];
  const direction = unit({ x: tip.x - inner.x, y: tip.y - inner.y });
  const added = Array.from({ length: count }, (_, i): LinePoint => ({
    x: tip.x + direction.x * spacing * (i + 1),
    y: tip.y + direction.y * spacing * (i + 1),
    distance: 0,
    anchor: false,
    corner: false,
    turn: 0,
  }));
  return end === 'end' ? added : added.reverse();
}

function unit(v: Point): Point {
  const length = Math.hypot(v.x, v.y);
  return length > 0 ? { x: v.x / length, y: v.y / length } : { x: 0, y: 0 };
}
