import { brushLine, type BristlePath, type BrushOptions } from './brush/brush';
import { flattenLine } from './geometry/flatten';
import { splitAtCorners } from './geometry/split';
import { orientLine } from './hand';
import { applyToSubpath, scale } from './parse/matrix';
import { linePressure } from './pressure';
import { createNoise1D, createRandom } from './random';
import type { Tuning } from './tuning';
import type { ParsedSvg } from './types';
import { wobbleLine } from './wobble';

export interface PaintingPlan {
  /** Output size in CSS pixels. */
  width: number;
  height: number;
  /** Bristle paths in drawing order. */
  paths: BristlePath[];
}

/**
 * Everything up to drawing: scales the SVG to the output width, and turns
 * every line into bristle paths. No DOM or canvas is involved, so the result
 * is the same in every browser and in Node.
 */
export function planPainting(
  parsed: ParsedSvg,
  seed: number,
  width: number,
  brush: BrushOptions,
  tuning: Tuning,
): PaintingPlan {
  const factor = width / parsed.width;
  const random = createRandom(seed);
  const paths: BristlePath[] = [];

  parsed.lines.forEach((svgLine, index) => {
    const lineRandom = random.fork(index);
    const scaled = { ...applyToSubpath(scale(factor, factor), svgLine), color: svgLine.color };
    // Each piece of a split line is its own stroke, with its own randomness.
    splitAtCorners(flattenLine(scaled, tuning), tuning).forEach((piece, pieceIndex) => {
      const strokeRandom = lineRandom.fork(pieceIndex);
      const wobble = createNoise1D(Math.floor(strokeRandom.fork(2).next() * 4294967296));
      const stroke = wobbleLine(orientLine(piece, brush.hand), tuning, wobble);
      const noise = createNoise1D(Math.floor(strokeRandom.fork(0).next() * 4294967296));
      const pressure = linePressure(stroke, brush.size, tuning, noise);
      paths.push(...brushLine(stroke, pressure, brush, tuning, strokeRandom.fork(1)));
    });
  });

  return { width, height: parsed.height * factor, paths };
}
