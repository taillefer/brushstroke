import { brushLine, type BristlePath, type BrushOptions, type Paper } from './brush/brush';
import { flattenLine } from './geometry/flatten';
import { splitAtCorners } from './geometry/split';
import { orientLine } from './hand';
import { applyToSubpath, scale } from './parse/matrix';
import { linePressure } from './pressure';
import { createNoise1D, createNoise2D, createRandom, lineSeedNumber } from './random';
import type { Tuning } from './tuning';
import type { ParsedSvg, SvgLine } from './types';
import { wobbleLine } from './wobble';

export interface PaintingPlan {
  /** Output size in CSS pixels. */
  width: number;
  height: number;
  /** Bristle paths in drawing order. */
  paths: BristlePath[];
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
  return { width, height: parsed.height * factor, paths: planLines(parsed.lines, seed, factor, brush, tuning) };
}

/**
 * Everything up to drawing: scales the lines by `factor`, and turns every
 * line into bristle paths. No DOM or canvas is involved, so the result is the
 * same in every browser and in Node.
 *
 * The look is worked out in the scaled coordinates. Brush size, wobble and
 * paper grain are in output pixels, so zooming in moves the strokes apart
 * instead of making the bristles thicker.
 */
export function planLines(lines: SvgLine[], seed: number, factor: number, brush: BrushOptions, tuning: Tuning): BristlePath[] {
  const random = createRandom(seed);
  const paths: BristlePath[] = [];
  // The paper is shared by all strokes. Lines without a seed use forks 0, 1, 2…
  // by position, the paper takes -1, and lines with their own seed fork from -2.
  const seeded = random.fork(-2);
  const grain = createNoise2D(Math.floor(random.fork(-1).next() * 4294967296));
  const paper: Paper = (x, y) => (grain(x / tuning.grainSize, y / tuning.grainSize) + 1) / 2;

  lines.forEach((svgLine, index) => {
    const lineRandom = svgLine.seed === undefined ? random.fork(index) : seeded.fork(lineSeedNumber(svgLine.seed));
    const scaled = { ...applyToSubpath(scale(factor, factor), svgLine), color: svgLine.color };
    // Each piece of a split line is its own stroke, with its own randomness.
    splitAtCorners(flattenLine(scaled, tuning), tuning).forEach((piece, pieceIndex) => {
      const strokeRandom = lineRandom.fork(pieceIndex);
      const wobble = createNoise1D(Math.floor(strokeRandom.fork(2).next() * 4294967296));
      const stroke = wobbleLine(orientLine(piece, brush.hand), tuning, wobble);
      const noise = createNoise1D(Math.floor(strokeRandom.fork(0).next() * 4294967296));
      const pressure = linePressure(stroke, brush.size, tuning, noise);
      paths.push(...brushLine(stroke, pressure, brush, tuning, strokeRandom.fork(1), paper));
    });
  });

  return paths;
}
