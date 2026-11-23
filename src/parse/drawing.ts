import type { ParsedSvgDrawing, SvgShape, SvgStroke } from '../types';
import { fraction, parseColor, type Rgba } from './color';
import { parseLength } from './length';
import { applyToSubpath, multiply, parseTransform, type Matrix } from './matrix';
import { shapeToSubpaths } from './shapes';
import { childPaintContext, isDisplayNone, readProperty, rootPaintContext, type PaintContext } from './style';
import { CONTAINERS, parseSvgText, type SvgNode } from './svg';
import { rootViewport } from './viewport';

/** A fill or stroke value that a browser accepts. Anything else is ignored, so the parent's value applies. */
type Paint = { kind: 'none' } | { kind: 'currentColor' } | { kind: 'color'; color: Rgba };

type Linecap = SvgStroke['linecap'];
type Linejoin = SvgStroke['linejoin'];

interface DrawingContext {
  /** Only `hidden` is used from here; fill, stroke and color are read below with stricter rules. */
  paint: PaintContext;
  fill: Paint | undefined;
  stroke: Paint | undefined;
  color: Rgba | undefined;
  fillOpacity: number;
  strokeOpacity: number;
  /** The product of `opacity` on the element and all its ancestors. */
  groupOpacity: number;
  fillRule: string | undefined;
  strokeWidth: string | undefined;
  linecap: Linecap;
  linejoin: Linejoin;
}

const BLACK: Rgba = { hex: '#000000', alpha: 1 };

const rootContext: DrawingContext = {
  paint: rootPaintContext,
  fill: undefined,
  stroke: undefined,
  color: undefined,
  fillOpacity: 1,
  strokeOpacity: 1,
  groupOpacity: 1,
  fillRule: undefined,
  strokeWidth: undefined,
  linecap: 'butt',
  linejoin: 'miter',
};

/**
 * Parses SVG text into fills and strokes, with the browser's defaults: a shape
 * with no paint set is filled black and has no stroke. Unlike `parseSvg`, which
 * reads line art for the brush, this keeps filled shapes. Needs no DOM.
 */
export function parseSvgDrawing(text: string): ParsedSvgDrawing {
  return parseSvgDrawingTree(parseSvgText(text));
}

/** Parses an element tree whose root is an <svg> element into fills and strokes. */
export function parseSvgDrawingTree(root: SvgNode): ParsedSvgDrawing {
  const viewport = rootViewport(root.attributes);
  const shapes: SvgShape[] = [];

  const visit = (node: SvgNode, parentMatrix: Matrix, parent: DrawingContext, isRoot: boolean) => {
    if (isDisplayNone(node.attributes)) return;
    const matrix = isRoot ? parentMatrix : multiply(parentMatrix, parseTransform(node.attributes.transform));
    const context = childContext(parent, node.attributes);

    if (CONTAINERS.has(node.name)) {
      for (const child of node.children) visit(child, matrix, context, false);
      return;
    }

    const local = shapeToSubpaths(node.name, node.attributes);
    if (!local || local.length === 0 || context.paint.hidden) return;
    const subpaths = local.map((s) => applyToSubpath(matrix, s));

    // A <line> has no inside, so browsers never fill it.
    const fill = node.name === 'line' ? undefined : resolvePaint(context.fill ?? { kind: 'color', color: BLACK }, context);
    if (fill) {
      shapes.push({
        type: 'fill',
        subpaths,
        color: fill.hex,
        rule: context.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
        opacity: context.groupOpacity * context.fillOpacity * fill.alpha,
      });
    }
    const stroke = resolvePaint(context.stroke ?? { kind: 'none' }, context);
    const width = (parseLength(context.strokeWidth) ?? 1) * scaleOf(matrix);
    if (stroke && width > 0) {
      shapes.push({
        type: 'stroke',
        subpaths,
        color: stroke.hex,
        width,
        opacity: context.groupOpacity * context.strokeOpacity * stroke.alpha,
        linecap: context.linecap,
        linejoin: context.linejoin,
      });
    }
  };

  visit(root, viewport.matrix, rootContext, true);
  return { width: viewport.width, height: viewport.height, shapes };
}

type Attributes = Readonly<Record<string, string>>;

function childContext(parent: DrawingContext, attributes: Attributes): DrawingContext {
  const read = (name: string) => readProperty(attributes, name);
  // `color: currentColor` and colours that cannot be read leave the parent's colour.
  const color = optional(read('color'), parseColor);
  const opacity = optional(read('opacity'), fraction);
  return {
    paint: childPaintContext(parent.paint, attributes),
    fill: optional(read('fill'), readPaint) ?? parent.fill,
    stroke: optional(read('stroke'), readPaint) ?? parent.stroke,
    color: color ?? parent.color,
    fillOpacity: optional(read('fill-opacity'), fraction) ?? parent.fillOpacity,
    strokeOpacity: optional(read('stroke-opacity'), fraction) ?? parent.strokeOpacity,
    // opacity is not inherited: it applies to the element as a whole. Multiplying it down
    // the tree is exact for one shape, and close for overlapping shapes in a group.
    groupOpacity: parent.groupOpacity * (opacity ?? 1),
    fillRule: read('fill-rule') ?? parent.fillRule,
    strokeWidth: read('stroke-width') ?? parent.strokeWidth,
    linecap: optional(read('stroke-linecap'), readLinecap) ?? parent.linecap,
    linejoin: optional(read('stroke-linejoin'), readLinejoin) ?? parent.linejoin,
  };
}

function optional<T>(text: string | undefined, read: (text: string) => T | undefined): T | undefined {
  return text === undefined ? undefined : read(text);
}

function readPaint(text: string): Paint | undefined {
  const value = text.trim();
  const lower = value.toLowerCase();
  if (lower === 'none') return { kind: 'none' };
  if (lower === 'currentcolor') return { kind: 'currentColor' };
  // Gradients and patterns are not supported. Use the fallback colour after the url(...)
  // if there is one, or black, as brushstroke always has.
  if (lower.startsWith('url(')) {
    const fallback = value.slice(value.indexOf(')') + 1).trim();
    const paint = fallback ? readPaint(fallback) : undefined;
    return paint && paint.kind !== 'none' ? paint : { kind: 'color', color: BLACK };
  }
  const color = parseColor(value);
  return color ? { kind: 'color', color } : undefined;
}

/** The colour to paint with, or undefined for none. */
function resolvePaint(paint: Paint, context: DrawingContext): Rgba | undefined {
  if (paint.kind === 'none') return undefined;
  if (paint.kind === 'currentColor') return context.color ?? BLACK;
  return paint.color;
}

function readLinecap(text: string): Linecap | undefined {
  const value = text.toLowerCase();
  return value === 'butt' || value === 'round' || value === 'square' ? value : undefined;
}

function readLinejoin(text: string): Linejoin | undefined {
  const value = text.toLowerCase();
  if (value === 'miter-clip' || value === 'arcs') return 'miter';
  return value === 'miter' || value === 'round' || value === 'bevel' ? value : undefined;
}

/** How much a transform scales lengths, on average over directions. */
function scaleOf(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}
