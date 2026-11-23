import { paintBristles, type BrushOptions, type Paper } from './brush/brush';
import { resolveBrush, type BrushStyle } from './brushStyle';
import { flattenLine, POINT_SPACING } from './geometry/flatten';
import { splitAtCorners } from './geometry/split';
import { orientLine } from './hand';
import { applyToSubpath, scale } from './parse/matrix';
import { linePressure } from './pressure';
import { createNoise1D, createNoise2D, createRandom, lineSeedNumber } from './random';
import { intersects, PlanBuilder, type BristleSink, type Rect, type StrokePlan } from './strokePlan';
import { resolveTuning, type Tuning } from './tuning';
import type { ParsedSvg, SvgLine } from './types';
import { wobbleLine } from './wobble';

export interface PlanLinesOptions extends BrushStyle {
  /** Seed for the random variations. Default 0. Lines with their own `seed` mix it with this one. */
  seed?: number;
  /** Plan coordinates are line coordinates × scale. The brush size stays in plan pixels. Default 1. */
  scale?: number;
  /**
   * Only plan lines that can paint inside this rectangle, in plan coordinates
   * (line × scale). A line is kept or skipped whole, never cut, so the lines
   * that are kept look exactly as without `bounds`.
   */
  bounds?: Rect;
}

/**
 * Plans painted strokes for lines, without drawing them: everything
 * `paintLines` does except touching a canvas. Draw the result with
 * `drawPlan`, as often as needed. No DOM or canvas is involved, so it runs in
 * Node and in a Worker, and gives the same result everywhere.
 */
export function planLines(lines: SvgLine[], options: PlanLinesOptions = {}): StrokePlan {
  const builder = new PlanBuilder();
  planStrokes(
    lines,
    (options.seed ?? 0) >>> 0,
    options.scale ?? 1,
    resolveBrush(options),
    resolveTuning(options.tuning),
    builder,
    options.bounds,
  );
  return builder.finish();
}

export interface PaintingPlan {
  /** Output size in CSS pixels. */
  width: number;
  height: number;
  strokes: StrokePlan;
}

/** Plans a whole SVG, scaled to the output width. */
export function planPainting(
  parsed: ParsedSvg,
  seed: number,
  width: number,
  brush: BrushOptions,
  tuning: Tuning,
): PaintingPlan {
  const factor = width / parsed.width;
  const builder = new PlanBuilder();
  planStrokes(parsed.lines, seed, factor, brush, tuning, builder);
  return { width, height: parsed.height * factor, strokes: builder.finish() };
}

/**
 * Everything up to drawing: scales the lines by `factor`, and turns every
 * line into bristle paths, handed to `sink` in drawing order.
 *
 * The look is worked out in the scaled coordinates. Brush size, wobble and
 * paper grain are in output pixels, so zooming in moves the strokes apart
 * instead of making the bristles thicker.
 */
export function planStrokes(
  lines: SvgLine[],
  seed: number,
  factor: number,
  brush: BrushOptions,
  tuning: Tuning,
  sink: BristleSink,
  bounds?: Rect,
): void {
  const random = createRandom(seed);
  // The paper is shared by all strokes. Lines without a seed use forks 0, 1, 2…
  // by position, the paper takes -1, and lines with their own seed fork from -2.
  const seeded = random.fork(-2);
  const grain = createNoise2D(Math.floor(random.fork(-1).next() * 4294967296));
  const paper: Paper = (x, y) => (grain(x / tuning.grainSize, y / tuning.grainSize) + 1) / 2;
  const margin = paintedMargin(brush, tuning);
  const spacing = Math.max(POINT_SPACING, brush.size * tuning.lodPointSpacing);

  lines.forEach((svgLine, index) => {
    // Skipping a line leaves the randomness of the others alone: it is forked by index or seed.
    if (bounds && !intersects(lineBox(svgLine, factor, margin), bounds)) return;
    const lineRandom = svgLine.seed === undefined ? random.fork(index) : seeded.fork(lineSeedNumber(svgLine.seed));
    const scaled = { ...applyToSubpath(scale(factor, factor), svgLine), color: svgLine.color };
    // Each piece of a split line is its own stroke, with its own randomness.
    splitAtCorners(flattenLine(scaled, tuning, spacing), tuning, spacing).forEach((piece, pieceIndex) => {
      const strokeRandom = lineRandom.fork(pieceIndex);
      const wobble = createNoise1D(Math.floor(strokeRandom.fork(2).next() * 4294967296));
      const stroke = wobbleLine(orientLine(piece, brush.hand), tuning, wobble);
      const noise = createNoise1D(Math.floor(strokeRandom.fork(0).next() * 4294967296));
      const pressure = linePressure(stroke, brush.size, tuning, noise);
      paintBristles(stroke, pressure, brush, tuning, strokeRandom.fork(1), paper, sink);
    });
  });
}

/** How far paint can reach from a line's geometry: the brush, its bristles' width, the wobble and the overshoot at splits. */
function paintedMargin(brush: BrushOptions, tuning: Tuning): number {
  const bristle = Math.max(0.5, (brush.size / tuning.bristleCount) * tuning.bristleWidth);
  return brush.size * (1 + tuning.bristleJitter) + bristle + tuning.wobbleAmount + tuning.splitOvershoot;
}

/** A box around a line scaled by `factor`, from its anchors and control points, grown by `margin`. */
function lineBox(line: SvgLine, factor: number, margin: number): Rect {
  let minX = line.start.x;
  let maxX = minX;
  let minY = line.start.y;
  let maxY = minY;
  const add = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const segment of line.segments) {
    // A cubic stays inside the hull of its control points.
    if (segment.kind === 'cubic') {
      add(segment.c1.x, segment.c1.y);
      add(segment.c2.x, segment.c2.y);
    }
    add(segment.to.x, segment.to.y);
  }
  const x1 = Math.min(minX * factor, maxX * factor);
  const x2 = Math.max(minX * factor, maxX * factor);
  const y1 = Math.min(minY * factor, maxY * factor);
  const y2 = Math.max(minY * factor, maxY * factor);
  return { x: x1 - margin, y: y1 - margin, width: x2 - x1 + 2 * margin, height: y2 - y1 + 2 * margin };
}
