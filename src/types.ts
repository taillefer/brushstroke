export interface Point {
  x: number;
  y: number;
}

/** A straight piece or a cubic Bézier curve, ending at `to`. */
export type Segment =
  | { kind: 'line'; to: Point }
  | { kind: 'cubic'; c1: Point; c2: Point; to: Point };

/**
 * One continuous line: the brush touches down at `start` and lifts after the
 * last segment. Every segment end is an anchor point from the SVG.
 */
export interface Subpath {
  start: Point;
  segments: Segment[];
  /** True when the SVG closed the shape. The closing segment is included. */
  closed: boolean;
}

/** One line to paint, in output pixels, with its colour. */
export interface SvgLine extends Subpath {
  color: string;
}

export interface ParsedSvg {
  /** Size of the SVG in CSS pixels. */
  width: number;
  height: number;
  /** Lines in document order. */
  lines: SvgLine[];
}
