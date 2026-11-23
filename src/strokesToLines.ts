import type { ParsedSvgDrawing, Point, Segment, Subpath, SvgLine } from './types';

/** A line from a stroke of a drawing, with the stroke's width and opacity. */
export interface StrokeLine extends SvgLine {
  /**
   * The stroke width in the same units as the points, after `scale`. This is
   * `SvgLine.width`, so `paintLines` paints the line with a brush this wide
   * instead of `size`. Like `size`, `paintLines` reads it in canvas pixels and
   * does not multiply it by `transform.scale`: to paint at the SVG's stroke
   * widths, put the zoom in this function's `scale` rather than in the
   * transform.
   */
  width: number;
  /** From 0 to 1, as on the stroke. */
  opacity: number;
}

export interface StrokesToLinesOptions {
  /**
   * Put before each line's seed. Line seeds are `<prefix><stroke>` for a
   * stroke's first subpath and `<prefix><stroke>/<subpath>` for later ones,
   * where `<stroke>` counts strokes only, so fills can change without changing
   * the strokes' look. Default: an empty string.
   */
  seedPrefix?: string;
  /** Multiplies the points and the width. Default 1. */
  scale?: number;
}

/**
 * Turns the strokes of a parsed drawing into lines for `paintLines`, one line
 * per subpath, in paint order. Fills are left out.
 */
export function strokesToLines(drawing: Pick<ParsedSvgDrawing, 'shapes'>, options: StrokesToLinesOptions = {}): StrokeLine[] {
  const prefix = options.seedPrefix ?? '';
  const scale = options.scale ?? 1;
  const lines: StrokeLine[] = [];
  let strokeIndex = 0;
  for (const shape of drawing.shapes) {
    if (shape.type !== 'stroke') continue;
    shape.subpaths.forEach((subpath, i) => {
      lines.push({
        ...scaleSubpath(subpath, scale),
        color: shape.color,
        seed: i === 0 ? `${prefix}${strokeIndex}` : `${prefix}${strokeIndex}/${i}`,
        width: shape.width * scale,
        // Drawings made by hand may lack the field added in 0.3.0.
        opacity: shape.opacity ?? 1,
      });
    });
    strokeIndex++;
  }
  return lines;
}

function scaleSubpath(subpath: Subpath, scale: number): Subpath {
  const p = (point: Point): Point => ({ x: point.x * scale, y: point.y * scale });
  const segments = subpath.segments.map((s): Segment =>
    s.kind === 'line' ? { kind: 'line', to: p(s.to) } : { kind: 'cubic', c1: p(s.c1), c2: p(s.c2), to: p(s.to) },
  );
  return { start: p(subpath.start), segments, closed: subpath.closed };
}
