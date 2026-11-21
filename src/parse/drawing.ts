import type { ParsedSvgDrawing, SvgShape } from '../types';
import { parseLength } from './length';
import { applyToSubpath, multiply, parseTransform, type Matrix } from './matrix';
import { shapeToSubpaths } from './shapes';
import { childPaintContext, isDisplayNone, readProperty, resolveColor, rootPaintContext, type PaintContext } from './style';
import { CONTAINERS, parseSvgText, type SvgNode } from './svg';
import { rootViewport } from './viewport';


interface DrawingContext {
  paint: PaintContext;
  fillRule: string | undefined;
  strokeWidth: string | undefined;
}

/**
 * Parses SVG text into fills and strokes, with the browser's defaults: a shape
 * with no paint set is filled black and has no stroke. Unlike `parseSvg`, which
 * reads line art for the brush, this keeps filled shapes. Needs a global DOMParser.
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
    const context: DrawingContext = {
      paint: childPaintContext(parent.paint, node.attributes),
      fillRule: readProperty(node.attributes, 'fill-rule') ?? parent.fillRule,
      strokeWidth: readProperty(node.attributes, 'stroke-width') ?? parent.strokeWidth,
    };

    if (CONTAINERS.has(node.name)) {
      for (const child of node.children) visit(child, matrix, context, false);
      return;
    }

    const local = shapeToSubpaths(node.name, node.attributes);
    if (!local || local.length === 0 || context.paint.hidden) return;
    const subpaths = local.map((s) => applyToSubpath(matrix, s));
    const { paint } = context;

    // A <line> has no inside, so browsers never fill it.
    const fill = node.name === 'line' ? 'none' : (paint.fill ?? 'black');
    if (fill !== 'none') {
      shapes.push({ type: 'fill', subpaths, color: resolveColor(fill, paint.color), rule: context.fillRule === 'evenodd' ? 'evenodd' : 'nonzero' });
    }
    const stroke = paint.stroke ?? 'none';
    const width = (parseLength(context.strokeWidth) ?? 1) * scaleOf(matrix);
    if (stroke !== 'none' && width > 0) {
      shapes.push({ type: 'stroke', subpaths, color: resolveColor(stroke, paint.color), width });
    }
  };

  visit(root, viewport.matrix, { paint: rootPaintContext, fillRule: undefined, strokeWidth: undefined }, true);
  return { width: viewport.width, height: viewport.height, shapes };
}

/** How much a transform scales lengths, on average over directions. */
function scaleOf(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

