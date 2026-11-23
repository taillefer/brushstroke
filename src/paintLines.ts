import { planLines } from './plan';
import { drawPlan, type PaintContext } from './render';
import type { BrushStyle } from './brushStyle';
import type { Rect } from './strokePlan';
import type { SvgLine } from './types';

export type { BrushStyle } from './brushStyle';

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
  /**
   * Only paint lines that can show inside this rectangle, in canvas pixels
   * (after the transform), for example a tile. Lines are kept or skipped
   * whole, so what is painted looks the same as without it.
   */
  bounds?: Rect;
}

/**
 * Paints lines onto an existing 2D context, as if drawn with a brush. The
 * same as `planLines` followed by `drawPlan`.
 *
 * The canvas is not resized or cleared, and the context's own transform (for
 * example the screen's pixel ratio) applies on top of `transform`. The scale
 * changes where the strokes go, not the brush: the brush size stays in canvas
 * pixels. The offset only moves the finished strokes, so painting the same
 * lines with two offsets, for example on two map tiles, joins up exactly.
 */
export function paintLines(context: PaintContext, lines: SvgLine[], options: PaintLinesOptions = {}): void {
  const { scale = 1, x = 0, y = 0 } = options.transform ?? {};
  const { transform: _, bounds, ...style } = options;
  const plan = planLines(lines, {
    ...style,
    scale,
    ...(bounds ? { bounds: { ...bounds, x: bounds.x - x, y: bounds.y - y } } : {}),
  });
  drawPlan(context, plan, { offset: { x, y }, ...(bounds ? { clip: bounds } : {}) });
}
