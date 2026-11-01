import { resolveBrush, type BrushStyle } from './paintLines';
import { parseSvg } from './parse/svg';
import { planPainting } from './plan';
import { resolveSeed } from './random';
import { drawPlan } from './render';
import { resolveTuning } from './tuning';

export interface PaintOptions extends BrushStyle {
  /** Seed for the random variations. Default: a hash of the SVG text. */
  seed?: number;
  /** Paint on this canvas instead of creating one. It is resized and cleared. */
  canvas?: HTMLCanvasElement;
  /** Output width in CSS pixels. Default: the SVG's own width. The height keeps the SVG's proportions. */
  width?: number;
}

export type SvgSource = string | URL | SVGSVGElement;

/**
 * Paints the lines of an SVG on a canvas, as if drawn with a brush.
 *
 * `source` can be SVG text, a URL to an SVG file, or an `<svg>` element.
 */
export async function paintSvg(source: SvgSource, options: PaintOptions = {}): Promise<HTMLCanvasElement> {
  const text = await readSource(source);
  const parsed = parseSvg(text);
  const plan = planPainting(
    parsed,
    resolveSeed(text, options.seed),
    options.width ?? parsed.width,
    resolveBrush(options),
    resolveTuning(options.tuning),
  );
  const canvas = options.canvas ?? document.createElement('canvas');
  drawPlan(canvas, plan, globalThis.devicePixelRatio || 1);
  return canvas;
}

/** The SVG text for any accepted source. Elements are serialised, so the seed is always a hash of text. */
export async function readSource(source: SvgSource): Promise<string> {
  if (typeof source === 'string' && source.trimStart().startsWith('<')) return source;
  if (typeof source === 'string' || source instanceof URL) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`brushstroke: could not load ${String(source)} (${response.status})`);
    return response.text();
  }
  return new XMLSerializer().serializeToString(source);
}
