import { withDistances, type FlatLine, type LinePoint } from './geometry/flatten';

export type Hand = 'right' | 'left';

/**
 * Orders a line's points in the direction the painter's hand would move.
 *
 * - Open lines: a right hand paints mostly-horizontal lines left to right, a
 *   left hand right to left. Both paint mostly-vertical lines top to bottom.
 * - Closed shapes: the brush starts at the top-left point. A right hand goes
 *   counter-clockwise on screen, a left hand clockwise, as most people draw
 *   circles.
 */
export function orientLine(line: FlatLine, hand: Hand): FlatLine {
  const points = line.closed ? orientClosed(line.points, hand) : orientOpen(line.points, hand);
  return points === line.points ? line : { ...line, points: withDistances(points) };
}

function orientOpen(points: LinePoint[], hand: Hand): LinePoint[] {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const wanted = Math.abs(dx) > Math.abs(dy)
    ? (hand === 'right' ? dx > 0 : dx < 0)
    : dy >= 0;
  return wanted ? points : [...points].reverse();
}

function orientClosed(points: LinePoint[], hand: Hand): LinePoint[] {
  // The last point repeats the first. Work on the ring without the copy.
  const ring = points.slice(0, -1);
  if (ring.length < 2) return points;

  // Positive area means clockwise on screen, where y points down.
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  const clockwise = area > 0;
  const ordered = clockwise === (hand === 'left') ? ring : [...ring].reverse();

  let startIndex = 0;
  ordered.forEach((p, i) => {
    const best = ordered[startIndex]!;
    if (p.x + p.y < best.x + best.y - 1e-9) startIndex = i;
  });
  const rotated = [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
  return [...rotated, rotated[0]!];
}
