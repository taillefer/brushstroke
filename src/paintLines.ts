import type { BrushKind, BrushOptions } from './brush/brush';
import type { Hand } from './hand';
import { planLines } from './plan';
import { drawPaths, type PaintContext } from './render';
import { resolveTuning, type Tuning } from './tuning';
import type { SvgLine } from './types';

/** How the brush looks. Shared by `paintLines` and `paintSvg`. */
export interface BrushStyle {
  /** 'flat' (default) or 'round'. */
  brush?: BrushKind;
  /** Brush width in CSS pixels. Default 12. */
  size?: number;
  /** The painter's hand. Default 'right'. */
  hand?: Hand;
  /** Fine control over the look, on top of `defaultTuning`. */
  tuning?: Partial<Tuning>;
}

/** Maps line coordinates to canvas coordinates: `canvas = line × scale + (x, y)`. */
export interface LineTransform {
  /** Default 1. */
  scale?: number;
  /** Offset in canvas pixels, applied after scaling. Default 0. */
  x?: number;
  y?: number;
}

export interface PaintLinesOptions extends BrushStyle {
  /** Seed for the random variations. Default 0. Lines with their own `seed` mix it with this one. */
  seed?: number;
  transform?: LineTransform;
}

const DEFAULT_SIZE = 12;

export function resolveBrush(style: BrushStyle): BrushOptions {
  return { brush: style.brush ?? 'flat', size: style.size ?? DEFAULT_SIZE, hand: style.hand ?? 'right' };
}

/**
 * Paints lines onto an existing 2D context, as if drawn with a brush.
 *
 * The canvas is not resized or cleared, and the context's own transform (for
 * example the screen's pixel ratio) applies on top of `transform`. The scale
 * changes where the strokes go, not the brush: the brush size stays in canvas
 * pixels. The offset only moves the finished strokes, so painting the same
 * lines with two offsets, for example on two map tiles, joins up exactly.
 */
export function paintLines(context: PaintContext, lines: SvgLine[], options: PaintLinesOptions = {}): void {
  const { scale = 1, x = 0, y = 0 } = options.transform ?? {};
  const paths = planLines(lines, (options.seed ?? 0) >>> 0, scale, resolveBrush(options), resolveTuning(options.tuning));
  context.save();
  context.translate(x, y);
  drawPaths(context, paths);
  context.restore();
}
