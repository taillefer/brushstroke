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

/** One line to paint, with its colour. */
export interface SvgLine extends Subpath {
  color: string;
  /**
   * Keeps this line's random variations stable when other lines are added or
   * removed, for example an object id. Without it, a line's variations depend
   * on its position in the list.
   */
  seed?: string | number;
  /**
   * Brush width for this line, used instead of the `size` option. It follows
   * the same rule as `size`: it is in output (canvas or plan) pixels and is
   * not multiplied by `transform.scale` or the `scale` of `planLines`, so the
   * brush keeps its width on screen when the map zooms. Default: `size`.
   * *Since 0.3.0.*
   */
  width?: number;
  /**
   * Brush width at the end of the line, in the same pixels as `width`. The
   * width changes linearly with the distance along the line, from `width` (or
   * `size`) at the start to `widthEnd` at the end, for example a river that
   * widens towards the sea. The touch-down and lift-off tapers still apply on
   * top. "Start" is the first point of the line as given, whichever way the
   * painter's hand then paints it. Default: the same as `width`.
   * *Since 0.3.0.*
   */
  widthEnd?: number;
}

/** A filled shape. All subpaths fill together with the fill rule, so inner subpaths can be holes. */
export interface SvgFill {
  type: 'fill';
  subpaths: Subpath[];
  /** `#rrggbb`. Any alpha in the colour is in `opacity`. */
  color: string;
  rule: 'nonzero' | 'evenodd';
  /** From 0 to 1: `opacity` of the element and its groups, times `fill-opacity`, times the colour's alpha. */
  opacity: number;
}

/** A stroked outline. `width` is in CSS pixels, scaled by the element's transform. */
export interface SvgStroke {
  type: 'stroke';
  subpaths: Subpath[];
  /** `#rrggbb`. Any alpha in the colour is in `opacity`. */
  color: string;
  width: number;
  /** From 0 to 1: `opacity` of the element and its groups, times `stroke-opacity`, times the colour's alpha. */
  opacity: number;
  /** `stroke-linecap`, default `butt`. */
  linecap: 'butt' | 'round' | 'square';
  /** `stroke-linejoin`, default `miter`. SVG 2's `miter-clip` and `arcs` are read as `miter`. */
  linejoin: 'miter' | 'round' | 'bevel';
}

export type SvgShape = SvgFill | SvgStroke;

/** An SVG read as a drawing: fills and strokes as a browser would paint them. */
export interface ParsedSvgDrawing {
  /** Size of the SVG in CSS pixels. */
  width: number;
  height: number;
  /** Shapes in paint order. */
  shapes: SvgShape[];
}

export interface ParsedSvg {
  /** Size of the SVG in CSS pixels. */
  width: number;
  height: number;
  /** Lines in document order. */
  lines: SvgLine[];
}
