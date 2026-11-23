import type { ParsedSvg, SvgLine } from '../types';
import { applyToSubpath, multiply, parseTransform, type Matrix } from './matrix';
import { shapeToSubpaths } from './shapes';
import { childPaintContext, isDisplayNone, lineColor, rootPaintContext, type PaintContext } from './style';
import { rootViewport } from './viewport';
import { readXml } from './xml';

/** A minimal element tree, so the parser can run without a DOM. */
export interface SvgNode {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: readonly SvgNode[];
}

// Elements whose children are drawn. Nested <svg> elements are treated as
// plain groups: their own viewport and viewBox are not applied.
export const CONTAINERS = new Set(['g', 'a', 'svg', 'switch']);

/** Parses SVG text into lines. Needs no DOM, so it runs in Node and in workers too. */
export function parseSvg(text: string): ParsedSvg {
  return parseSvgTree(parseSvgText(text));
}

/**
 * Parses SVG text into an element tree, with the library's own XML reader.
 * Throws if the text is not well-formed XML or its root is not an <svg> element.
 */
export function parseSvgText(text: string): SvgNode {
  let root: SvgNode;
  try {
    root = readXml(text);
  } catch (error) {
    throw new Error(`brushstroke: the text is not a valid SVG document: ${(error as Error).message}`);
  }
  if (root.name !== 'svg') throw new Error('brushstroke: the text is not a valid SVG document: the root element is not <svg>');
  return root;
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
