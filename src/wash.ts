// A filled area painted as a watercolour wash: the paint, pooled paint along
// the edge, blotches, spots the brush missed and paper grain.
//
// All the texture is noise laid out in the caller's line coordinates, in
// octaves of 2^k units. An octave stays at its place whatever the transform
// does; zooming only changes how strongly each one shows. So nothing slides
// while a map pans or zooms, and finer blotches fade in as it zooms in. See
// docs/adr/0003-wash-texture-in-octaves.md.

import type { LineTransform } from './paintLines';
import { createRandom } from './random';
import type { PaintContext } from './render';
import { defaultWashTuning, type WashEdge, type WashLayer, type WashTuning } from './tuning';
import type { Point } from './types';

/** Smooth step from 0 to 1 with zero slope and curvature at both ends. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Tileable value noise: `size`×`size` values in [-1, 1], row by row. The
 * lattice wraps, so the right edge continues the left and the bottom the top.
 * A lattice of twice as many cells adds smaller detail at half strength.
 */
export function noiseTile(seed: number, size: number, cells: number): Float32Array {
  const lattice = (n: number, random: ReturnType<typeof createRandom>) => Float32Array.from({ length: n * n }, () => random.next() * 2 - 1);
  const random = createRandom(seed);
  const coarse = lattice(cells, random.fork(0));
  const fine = lattice(cells * 2, random.fork(1));
  const sample = (grid: Float32Array, n: number, x: number, y: number) => {
    const gx = (x / size) * n;
    const gy = (y / size) * n;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const tx = fade(gx - x0);
    const ty = fade(gy - y0);
    const top = grid[y0 * n + x0]! + (grid[y0 * n + x1]! - grid[y0 * n + x0]!) * tx;
    const bottom = grid[y1 * n + x0]! + (grid[y1 * n + x1]! - grid[y1 * n + x0]!) * tx;
    return top + (bottom - top) * ty;
  };
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (sample(coarse, cells, x, y) + 0.5 * sample(fine, cells * 2, x, y)) / 1.5;
      out[y * size + x] = Math.max(-1, Math.min(1, v * 1.6));
    }
  }
  return out;
}

/**
 * RGBA pixels for a tile: `ink` where the noise is above 0, `paper` where it
 * is below, each more opaque the further from 0, and strong paper below
 * `missed`.
 */
export function tilePixels(values: Float32Array, layer: Pick<WashLayer, 'ink' | 'paper' | 'missed' | 'missedRim'>): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(values.length * 4));
  const [ir, ig, ib, ia] = layer.ink;
  const [pr, pg, pb, pa] = layer.paper;
  const rimWidth = Math.max(1e-6, layer.missedRim);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    const o = i * 4;
    if (v >= 0) {
      out[o] = ir;
      out[o + 1] = ig;
      out[o + 2] = ib;
      out[o + 3] = Math.round(255 * ia * v);
    } else {
      // A missed spot has a soft rim, so it reads as paint that did not reach rather than a hole.
      const rim = layer.missed < 1 ? Math.min(1, Math.max(0, (layer.missed + rimWidth - v) / rimWidth)) : 0;
      out[o] = pr;
      out[o + 1] = pg;
      out[o + 2] = pb;
      out[o + 3] = Math.round(255 * Math.min(1, pa * Math.max(-v, rim * 1.8)));
    }
  }
  return out;
}

export interface Octave {
  /** The octave's tile is 2^k line units wide. */
  k: number;
  /** Its share of the layer's opacity, from 0 to 1. */
  weight: number;
}

/**
 * The octaves of a layer that show at `scale` (canvas pixels per line unit),
 * with their weights. Each fades in over one octave from `fromPx` and out
 * over one octave up to `toPx`. When the band is a whole number of octaves
 * wide the weights add up to the same total at every scale.
 */
export function visibleOctaves(scale: number, layer: Pick<WashLayer, 'fromPx' | 'toPx'>): Octave[] {
  if (!(scale > 0) || !(layer.toPx > layer.fromPx) || !(layer.fromPx > 0)) return [];
  const lo = Math.log2(layer.fromPx);
  const hi = Math.log2(layer.toPx);
  const zoom = Math.log2(scale);
  const out: Octave[] = [];
  for (let k = Math.floor(lo - zoom); k + zoom < hi; k++) {
    // log2 of the tile's width on the canvas.
    const s = k + zoom;
    const weight = Math.min(1, s - lo, hi - s);
    if (weight > 0) out.push({ k, weight });
  }
  return out;
}

/** Where octave `k` of a seed starts, in line units: a different place in the noise per seed and octave. */
export function octaveOffset(seed: number, k: number): Point {
  const random = createRandom(seed).fork(k + 1000);
  const period = 2 ** k;
  return { x: random.next() * period, y: random.next() * period };
}

/**
 * The pattern matrix `[a, 0, 0, a, e, f]` that lays octave `k`'s tile over
 * the line coordinates: tile pixel `u` lands on line point
 * `u × 2^k / tileSize + offset`, drawn at `point × scale + (x, y)`. The
 * translation is reduced by whole tiles, so it stays small far from the origin.
 */
export function octaveMatrix(transform: Required<LineTransform>, k: number, offset: Point, tileSize: number): { a: number; e: number; f: number } {
  const period = 2 ** k * transform.scale;
  const wrap = (v: number) => v - Math.floor(v / period) * period;
  return {
    a: period / tileSize,
    e: wrap(transform.x + offset.x * transform.scale),
    f: wrap(transform.y + offset.y * transform.scale),
  };
}

export interface EdgeStep {
  /** How far inward this stroke reaches, in canvas pixels. */
  reach: number;
  /** Its opacity. */
  alpha: number;
}

/**
 * The strokes that build the edge gradient, widest first. A stroke covers
 * everything closer to the edge than its reach, so near the edge many strokes
 * stack up. Each one's opacity is chosen so that, stacked, they give
 * `alpha × (1 − distance / width) ^ falloff` in the middle of every step.
 */
export function edgeSteps(edge: Pick<WashEdge, 'width' | 'alpha' | 'falloff' | 'steps'>): EdgeStep[] {
  const n = Math.max(1, Math.round(edge.steps));
  if (!(edge.width > 0) || !(edge.alpha > 0)) return [];
  const alpha = Math.min(1, edge.alpha);
  const falloff = Math.max(0, edge.falloff);
  // The target opacity in the middle of step i, counted from the edge.
  const target = (i: number) => alpha * (1 - (i + 0.5) / n) ** falloff;
  const steps: EdgeStep[] = [];
  // From the widest stroke inward: what is already covered by wider strokes stays.
  let covered = 0;
  for (let i = n - 1; i >= 0; i--) {
    const want = Math.max(covered, target(i));
    const stepAlpha = covered >= 1 ? 0 : 1 - (1 - want) / (1 - covered);
    covered = want;
    if (stepAlpha > 0) steps.push({ reach: (edge.width * (i + 1)) / n, alpha: stepAlpha });
  }
  return steps;
}

export interface PaintWashOptions {
  /** Maps line coordinates to canvas pixels, as in `paintLines`. Default `{ scale: 1, x: 0, y: 0 }`. */
  transform?: LineTransform;
  /** Seed of the blotches, so two maps do not share them. Default 0. */
  seed?: number;
  /** The look, on top of `defaultWashTuning`. */
  tuning?: Partial<WashTuning>;
  /** Leave out parts, for comparing. All default to true. */
  layers?: { fill?: boolean; edge?: boolean; wash?: boolean; grain?: boolean };
}

type TileCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(size: number): TileCanvas | undefined {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  return undefined;
}

// Tiles are slow to make (a 512 px tile is a quarter of a million pixels), so
// they are kept by everything that shapes them. A tuning page makes new ones
// as sliders move; the cache drops the oldest.
const tileCache = new Map<string, TileCanvas | null>();
const TILE_CACHE_SIZE = 24;

function tile(layer: WashLayer, index: number, size: number): TileCanvas | null {
  const seed = (layer.seed + Math.imul(index, 7919)) >>> 0;
  const key = JSON.stringify([seed, size, layer.cells, layer.ink, layer.paper, layer.missed, layer.missedRim]);
  const cached = tileCache.get(key);
  if (cached !== undefined) return cached;
  const canvas = makeCanvas(size);
  const context = canvas?.getContext('2d') as PaintContext | null | undefined;
  let made: TileCanvas | null = null;
  if (canvas && context && typeof ImageData !== 'undefined') {
    context.putImageData(new ImageData(tilePixels(noiseTile(seed, size, Math.max(1, Math.round(layer.cells))), layer), size, size), 0, 0);
    made = canvas;
  }
  if (tileCache.size >= TILE_CACHE_SIZE) tileCache.delete(tileCache.keys().next().value!);
  tileCache.set(key, made);
  return made;
}

const patternCache = new WeakMap<object, Map<TileCanvas, CanvasPattern | null>>();

function pattern(context: PaintContext, source: TileCanvas): CanvasPattern | null {
  let patterns = patternCache.get(context);
  if (!patterns) patternCache.set(context, (patterns = new Map()));
  let made = patterns.get(source);
  if (made === undefined) {
    made = context.createPattern(source, 'repeat') ?? null;
    if (patterns.size >= TILE_CACHE_SIZE) patterns.delete(patterns.keys().next().value!);
    patterns.set(source, made);
  }
  return made;
}

/** The whole canvas in the context's current coordinates. */
function canvasArea(context: PaintContext): { x: number; y: number; width: number; height: number } {
  const { width, height } = context.canvas;
  const inverse = context.getTransform().inverse();
  const corners = [new DOMPoint(0, 0), new DOMPoint(width, 0), new DOMPoint(0, height), new DOMPoint(width, height)].map((p) => inverse.transformPoint(p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function drawLayer(context: PaintContext, transform: Required<LineTransform>, layer: WashLayer, seed: number, tileSize: number): void {
  if (typeof DOMMatrix === 'undefined') return;
  const tiles = Math.max(1, Math.round(layer.tiles));
  const base = context.globalAlpha;
  const area = canvasArea(context);
  for (const { k, weight } of visibleOctaves(transform.scale, layer)) {
    const source = tile(layer, ((k % tiles) + tiles) % tiles, tileSize);
    const fill = source && pattern(context, source);
    if (!fill) continue;
    const m = octaveMatrix(transform, k, octaveOffset(seed, k), tileSize);
    fill.setTransform(new DOMMatrix([m.a, 0, 0, m.a, m.e, m.f]));
    context.globalAlpha = base * weight;
    context.fillStyle = fill;
    // The clip keeps it to the area.
    context.fillRect(area.x, area.y, area.width, area.height);
  }
  context.globalAlpha = base;
}

/**
 * Paints the blotches and the paper grain over everything inside the
 * context's current clip, anchored to the line coordinates of `transform`.
 * Use it to texture many areas at once: fill them, clip to them (or to the
 * whole map), then call this once.
 */
export function paintWashTexture(context: PaintContext, options: PaintWashOptions = {}): void {
  const tuning = { ...defaultWashTuning, ...options.tuning };
  const transform = { scale: 1, x: 0, y: 0, ...options.transform };
  const seed = (options.seed ?? 0) >>> 0;
  const layers = options.layers ?? {};
  if (layers.wash !== false) drawLayer(context, transform, tuning.wash, seed, tuning.tileSize);
  if (layers.grain !== false) drawLayer(context, transform, tuning.grain, (seed ^ 0x1f2e3d) >>> 0, tuning.tileSize);
}

/**
 * Paints an area as a watercolour wash: `rings` filled with `color` (holes
 * by the even-odd rule), paint pooled along the inside of the edge, and the
 * texture of `paintWashTexture` on top, all inside the area.
 *
 * The canvas is not cleared and the context's settings are restored. The
 * context's own transform (such as the screen's pixel ratio) applies on top.
 */
export function paintWash(context: PaintContext, rings: Point[][], color: string, options: PaintWashOptions = {}): void {
  const tuning = { ...defaultWashTuning, ...options.tuning };
  const { scale = 1, x = 0, y = 0 } = options.transform ?? {};
  const layers = options.layers ?? {};
  const path = new Path2D();
  for (const ring of rings) {
    ring.forEach((p, i) => (i === 0 ? path.moveTo(p.x * scale + x, p.y * scale + y) : path.lineTo(p.x * scale + x, p.y * scale + y)));
    path.closePath();
  }
  context.save();
  if (layers.fill !== false) {
    context.fillStyle = color;
    context.fill(path, 'evenodd');
  }
  context.clip(path, 'evenodd');
  if (layers.edge !== false) {
    context.lineJoin = 'round';
    const [r, g, b] = tuning.edgeColor;
    for (const step of edgeSteps(tuning.edge)) {
      // Half the line is outside the clip, so it is twice as wide as the band that shows.
      context.lineWidth = step.reach * 2;
      context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${step.alpha})`;
      context.stroke(path);
    }
  }
  paintWashTexture(context, options);
  context.restore();
}
