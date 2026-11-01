import type { ParsedSvg, SvgLine } from '../types';
import { applyToSubpath, multiply, parseTransform, type Matrix } from './matrix';
import { shapeToSubpaths } from './shapes';
import { childPaintContext, isDisplayNone, lineColor, rootPaintContext, type PaintContext } from './style';
import { rootViewport } from './viewport';

/** A minimal element tree, so the parser can run without a DOM. */
export interface SvgNode {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: readonly SvgNode[];
}

// Elements whose children are drawn. Nested <svg> elements are treated as
// plain groups: their own viewport and viewBox are not applied.
const CONTAINERS = new Set(['g', 'a', 'svg', 'switch']);

/** Parses SVG text into lines. Needs a global DOMParser, as in browsers. */
export function parseSvg(text: string): ParsedSvg {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
  if (root.getElementsByTagName('parsererror').length > 0 || root.localName !== 'svg') {
    throw new Error('brushstroke: the text is not a valid SVG document');
  }
  return parseSvgTree(fromDom(root));
}

/** Parses an element tree whose root is an <svg> element into lines. */
export function parseSvgTree(root: SvgNode): ParsedSvg {
  const viewport = rootViewport(root.attributes);
  const lines: SvgLine[] = [];

  const visit = (node: SvgNode, parentMatrix: Matrix, parentPaint: PaintContext, isRoot: boolean) => {
    if (isDisplayNone(node.attributes)) return;
    // The root <svg> has no transform of its own here; its viewBox is in the viewport matrix.
    const matrix = isRoot ? parentMatrix : multiply(parentMatrix, parseTransform(node.attributes.transform));
    const paint = childPaintContext(parentPaint, node.attributes);

    if (CONTAINERS.has(node.name)) {
      for (const child of node.children) visit(child, matrix, paint, false);
      return;
    }

    const subpaths = shapeToSubpaths(node.name, node.attributes);
    if (!subpaths) return;
    const color = lineColor(paint);
    if (color === null) return;
    // An element's id keeps its lines' look stable when other elements change.
    // Later subpaths of the same element get the id plus their position.
    const id = node.attributes.id?.trim();
    subpaths.forEach((subpath, i) => {
      const line: SvgLine = { ...applyToSubpath(matrix, subpath), color };
      if (id) line.seed = i === 0 ? id : `${id}/${i}`;
      lines.push(line);
    });
  };

  visit(root, viewport.matrix, rootPaintContext, true);
  return { width: viewport.width, height: viewport.height, lines };
}

function fromDom(element: Element): SvgNode {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) attributes[attribute.name] = attribute.value;
  return {
    name: element.localName,
    attributes,
    children: Array.from(element.children, fromDom),
  };
}
