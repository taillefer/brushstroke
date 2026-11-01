import { identity, multiply, scale, translate, type Matrix } from './matrix';
import { parseLength } from './length';

type Attributes = Readonly<Record<string, string>>;

// The size browsers give an <svg> with no width, height or viewBox.
const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 150;

export interface Viewport {
  width: number;
  height: number;
  /** Maps viewBox coordinates to CSS pixels inside width × height. */
  matrix: Matrix;
}

/** The size of the root <svg> and the transform from its viewBox, including preserveAspectRatio. */
export function rootViewport(attributes: Attributes): Viewport {
  const viewBox = parseViewBox(attributes.viewBox);
  let width = positive(parseLength(attributes.width));
  let height = positive(parseLength(attributes.height));

  if (!viewBox) {
    return { width: width ?? DEFAULT_WIDTH, height: height ?? DEFAULT_HEIGHT, matrix: identity };
  }

  const ratio = viewBox.width / viewBox.height;
  if (width === undefined && height === undefined) {
    width = viewBox.width;
    height = viewBox.height;
  } else if (width === undefined) {
    width = height! * ratio;
  } else if (height === undefined) {
    height = width / ratio;
  }

  return { width, height: height!, matrix: viewBoxMatrix(viewBox, width, height!, attributes.preserveAspectRatio) };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function viewBoxMatrix(box: Box, width: number, height: number, preserve: string | undefined): Matrix {
  const parts = (preserve ?? '').trim().split(/\s+/).filter((p) => p && p !== 'defer');
  const align = parts[0] ?? 'xMidYMid';
  const slice = parts[1] === 'slice';
  const sx = width / box.width;
  const sy = height / box.height;

  if (align === 'none') return multiply(scale(sx, sy), translate(-box.x, -box.y));

  const s = slice ? Math.max(sx, sy) : Math.min(sx, sy);
  const offset = (mode: string, room: number) =>
    mode === 'Min' ? 0 : mode === 'Max' ? room : room / 2;
  const alignX = /^x(Min|Mid|Max)/.exec(align)?.[1] ?? 'Mid';
  const alignY = /Y(Min|Mid|Max)$/.exec(align)?.[1] ?? 'Mid';
  const tx = offset(alignX, width - box.width * s);
  const ty = offset(alignY, height - box.height * s);
  return multiply(translate(tx, ty), multiply(scale(s, s), translate(-box.x, -box.y)));
}

function parseViewBox(text: string | undefined): Box | undefined {
  if (!text) return undefined;
  const numbers = text.trim().split(/[\s,]+/).map(Number);
  if (numbers.length !== 4 || numbers.some(Number.isNaN)) return undefined;
  const [x, y, width, height] = numbers as [number, number, number, number];
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}
