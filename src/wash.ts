// A filled area painted as a watercolour wash: the paint, pooled paint along
// the edge, blotches, spots the brush missed and paper grain.
//
// All the texture is noise laid out in the caller's line coordinates, in
// octaves of 2^k units. An octave stays at its place whatever the transform
// does; zooming only changes how strongly each one shows. So nothing slides
// while a map pans or zooms, and finer blotches fade in as it zooms in. See
// docs/adr/0003-wash-texture-in-octaves.md.

import { paintLines, type LineTransform } from './paintLines';
import type { PaintContext } from './render';
import { contourStrokes, hatchArea } from './geometry/hatch';
import { parseColor } from './parse/color';
import { createRandom, hashText } from './random';
import type { Rect } from './strokePlan';
import { defaultWashTuning, type WashEdge, type WashGradient, type WashLayer, type WashPigment, type WashStrokes, type WashTuning } from './tuning';
import type { Point, SvgLine } from './types';

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

type Rgb = { r: number; g: number; b: number };

function toRgb(color: string): Rgb {
  const hex = parseColor(color)?.hex ?? '#000000';
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

const toHex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/**
 * A colour as a painter could mix it: less saturated, lighter, and pulled
 * towards one shared undertone, so colours picked on a screen sit together
 * like paint from one box. Returns #rrggbb.
 */
export function pigment(color: string, settings: WashPigment = defaultWashTuning.pigment): string {
  const { r, g, b } = toRgb(color);
  // Saturation is taken out by moving each channel towards the colour's own grey.
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const muted = { r: grey + (r - grey) * (1 - settings.mute), g: grey + (g - grey) * (1 - settings.mute), b: grey + (b - grey) * (1 - settings.mute) };
  const light = { r: muted.r + (255 - muted.r) * settings.lighten, g: muted.g + (255 - muted.g) * settings.lighten, b: muted.b + (255 - muted.b) * settings.lighten };
  const [ur, ug, ub] = settings.undertone;
  const t = settings.undertoneAmount;
  return toHex({ r: light.r + (ur - light.r) * t, g: light.g + (ug - light.g) * t, b: light.b + (ub - light.b) * t });
}

export interface PaintGradientOptions {
  /** Maps line coordinates to canvas pixels, as in `paintLines`. */
  transform?: LineTransform;
}

/**
 * A soft band of `color` inside the area, strongest along `edges` and fading
 * inward over `gradient.width` line units. `edges` are the rings the band
 * follows, such as an island's shore but not the map's border. The band is
 * clipped to the area.
 */
export function paintEdgeGradient(context: PaintContext, rings: Point[][], edges: Point[][], color: string, gradient: WashGradient, options: PaintGradientOptions = {}): void {
  const { scale = 1, x = 0, y = 0 } = options.transform ?? {};
  const steps = edgeSteps({ width: gradient.width * scale, alpha: gradient.amount, falloff: gradient.falloff, steps: gradient.steps });
  if (steps.length === 0 || edges.length === 0) return;
  const toPath = (list: Point[][]) => {
    const path = new Path2D();
    for (const ring of list) {
      ring.forEach((p, i) => (i === 0 ? path.moveTo(p.x * scale + x, p.y * scale + y) : path.lineTo(p.x * scale + x, p.y * scale + y)));
      path.closePath();
    }
    return path;
  };
  const area = toPath(rings);
  const edge = toPath(edges);
  const { r, g, b } = toRgb(color);
  context.save();
  context.clip(area, 'evenodd');
  context.lineJoin = 'round';
  for (const step of steps) {
    context.lineWidth = step.reach * 2;
    context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${step.alpha})`;
    context.stroke(edge);
  }
  context.restore();
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
  /**
   * Lay the fill as a transparent glaze (multiplied, at `tuning.glaze`) over
   * what is under it, normally paper, so the paper shows through. Default false.
   */
  glaze?: boolean;
  /**
   * The rings that are real edges, where paint pools. Default all of
   * `rings`. Leave out a border that is not an edge, such as the map's frame.
   */
  edges?: Point[][];
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

/** A tile from the cache, or made with `paint` and kept under `key`. */
function cachedTile(key: string, size: number, paint: (context: PaintContext) => boolean): TileCanvas | null {
  const cached = tileCache.get(key);
  if (cached !== undefined) return cached;
  const canvas = makeCanvas(size);
  const context = canvas?.getContext('2d') as PaintContext | null | undefined;
  const made = canvas && context && paint(context) ? canvas : null;
  if (tileCache.size >= TILE_CACHE_SIZE) tileCache.delete(tileCache.keys().next().value!);
  tileCache.set(key, made);
  return made;
}

function noiseLayerTile(layer: WashLayer, index: number, size: number): TileCanvas | null {
  const seed = (layer.seed + Math.imul(index, 7919)) >>> 0;
  const key = JSON.stringify(['noise', seed, size, layer.cells, layer.ink, layer.paper, layer.missed, layer.missedRim]);
  return cachedTile(key, size, (context) => {
    if (typeof ImageData === 'undefined') return false;
    context.putImageData(new ImageData(tilePixels(noiseTile(seed, size, Math.max(1, Math.round(layer.cells))), layer), size, size), 0, 0);
    return true;
  });
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

/**
 * Fills the current clip with a layer's visible octaves, each tile laid over
 * the line coordinates at 2^k units and drawn at its octave's weight.
 */
function drawLayer(
  context: PaintContext,
  transform: Required<LineTransform>,
  band: { fromPx: number; toPx: number; tiles: number },
  tileFor: (index: number) => TileCanvas | null,
  seed: number,
  tileSize: number,
): void {
  if (typeof DOMMatrix === 'undefined') return;
  const tiles = Math.max(1, Math.round(band.tiles));
  const base = context.globalAlpha;
  const area = canvasArea(context);
  for (const { k, weight } of visibleOctaves(transform.scale, band)) {
    const source = tileFor(((k % tiles) + tiles) % tiles);
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
  const size = tuning.tileSize;
  const { wash, grain } = tuning;
  if (layers.wash !== false) drawLayer(context, transform, wash, (i) => noiseLayerTile(wash, i, size), seed, size);
  if (layers.grain !== false) drawLayer(context, transform, grain, (i) => noiseLayerTile(grain, i, size), (seed ^ 0x1f2e3d) >>> 0, size);
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
    context.save();
    context.fillStyle = color;
    if (options.glaze) {
      context.globalCompositeOperation = 'multiply';
      context.globalAlpha *= tuning.glaze;
    }
    context.fill(path, 'evenodd');
    context.restore();
  }
  context.clip(path, 'evenodd');
  const edgePath = options.edges ? new Path2D() : path;
  if (options.edges) {
    for (const ring of options.edges) {
      ring.forEach((p, i) => (i === 0 ? edgePath.moveTo(p.x * scale + x, p.y * scale + y) : edgePath.lineTo(p.x * scale + x, p.y * scale + y)));
      edgePath.closePath();
    }
  }
  if (layers.edge !== false) {
    context.lineJoin = 'round';
    const [r, g, b] = tuning.edgeColor;
    for (const step of edgeSteps(tuning.edge)) {
      // Half the line is outside the clip, so it is twice as wide as the band that shows.
      context.lineWidth = step.reach * 2;
      context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${step.alpha})`;
      context.stroke(edgePath);
    }
  }
  paintWashTexture(context, options);
  context.restore();
}

/** `color` moved `amount` (0 to 1) of the way towards `to`, as #rrggbb. */
function mixColor(color: Rgb, to: readonly number[], amount: number): string {
  const channel = (from: number, target: number) => Math.round(from + (target - from) * amount).toString(16).padStart(2, '0');
  return `#${channel(color.r, to[0]!)}${channel(color.g, to[1]!)}${channel(color.b, to[2]!)}`;
}

/**
 * The strokes `paintWashStrokes` paints for one area, in line units: the edge
 * strokes first, then the fill strokes, each with its own shade of `color`
 * and its own width in canvas pixels. `scale` is the canvas pixels per line
 * unit the lengths in `strokes` are measured at. `bounds` (line units) leaves
 * out strokes that cannot reach into it.
 */
export function washStrokeLines(
  rings: Point[][],
  color: string,
  strokes: WashStrokes,
  scale: number,
  options: { seed?: string | number; bounds?: Rect; edges?: Point[][] } = {},
): SvgLine[] {
  if (!(scale > 0)) return [];
  const rgb = toRgb(color);
  const prefix = `${options.seed ?? ''}${strokes.seed}`;
  const edge = strokes.contour
    ? contourStrokes(rings, { inset: strokes.contourInset / scale, length: strokes.contourLength / scale, seed: `${prefix}c`, ...(options.edges ? { edges: options.edges } : {}) })
    : [];
  const fill = hatchArea(rings, {
    spacing: strokes.spacing / scale,
    length: strokes.length / scale,
    angle: strokes.angle,
    angleJitter: strokes.angleJitter,
    bend: strokes.bend,
    overlap: strokes.overlap,
    inset: strokes.inset / scale,
    flow: strokes.flow,
    flowDistance: strokes.flowDistance / scale,
    ...(options.edges ? { flowEdges: options.edges } : {}),
    loadCycle: strokes.load > 0 ? strokes.loadCycle : 0,
    seed: `${prefix}h`,
    ...(options.bounds ? { bounds: options.bounds } : {}),
  });
  return [...edge, ...fill].map((line) => {
    const own = createRandom(hashText(String(line.seed)));
    const light = own.next() < strokes.light;
    // A fresh load of paint is darker; the last strokes before the next dip are lighter.
    const load = 'load' in line && typeof line.load === 'number' ? strokes.load * (line.load - 0.35) : 0;
    const shift = (light ? 1 : -1) * strokes.shade * own.next() + load;
    const { load: _, ...plain } = line as SvgLine & { load?: number };
    return {
      ...plain,
      color: mixColor(rgb, shift >= 0 ? strokes.paper : strokes.ink, Math.min(1, Math.abs(shift))),
      width: strokes.width * (0.85 + 0.3 * own.next()),
    };
  });
}

export interface PaintWashStrokesOptions {
  /** Maps line coordinates to canvas pixels, as in `paintLines`. Default `{ scale: 1, x: 0, y: 0 }`. */
  transform?: LineTransform;
  /** Put before the strokes' seeds, so two maps differ. The grid of strokes does not depend on it. */
  seed?: string | number;
  /** The look, on top of `defaultWashTuning`. */
  tuning?: Partial<WashTuning>;
  /** The rings that are real edges: edge strokes follow them and fill strokes turn along them. Default all of `rings`. */
  edges?: Point[][];
}

/**
 * Paints brush strokes inside one area: strokes along its edge, then rows of
 * strokes that start and end inside it, each a shade of `color`. Nothing
 * reaches past the edge: the strokes are cut inside it and the paint is
 * clipped to it.
 *
 * The strokes lie on a grid fixed to the line coordinates, so they stay in
 * place when the view pans, and when an area changes only strokes at the
 * changed edge change. Their lengths in `WashTuning.strokes` are canvas
 * pixels at `transform.scale`, and the brush's noise is anchored at that
 * scale too. To keep them still while a view zooms, paint them at a few
 * zoom steps and scale the result between steps.
 *
 * `paintLines` sets the opacity of every bristle itself, so
 * `strokes.opacity` is for the caller to apply when it composites the
 * strokes, for example from a tile.
 */
export function paintWashStrokes(context: PaintContext, rings: Point[][], color: string, options: PaintWashStrokesOptions = {}): void {
  const tuning = { ...defaultWashTuning, ...options.tuning };
  const { strokes } = tuning;
  const { scale = 1, x = 0, y = 0 } = options.transform ?? {};
  const area = canvasArea(context);
  const bounds = { x: (area.x - x) / scale, y: (area.y - y) / scale, width: area.width / scale, height: area.height / scale };
  const lines = washStrokeLines(rings, color, strokes, scale, {
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.edges ? { edges: options.edges } : {}),
    bounds,
  });
  if (lines.length === 0) return;
  const path = new Path2D();
  for (const ring of rings) {
    ring.forEach((p, i) => (i === 0 ? path.moveTo(p.x * scale + x, p.y * scale + y) : path.lineTo(p.x * scale + x, p.y * scale + y)));
    path.closePath();
  }
  context.save();
  context.clip(path, 'evenodd');
  paintLines(context, lines, {
    brush: strokes.brush,
    size: strokes.width,
    transform: { scale, x, y },
    anchorScale: scale,
    bounds: area,
    tuning: {
      dryDistance: Math.max(1, strokes.dryness * strokes.length),
      // Fill strokes are many and narrow: fewer bristles and points paint them several times faster.
      lodBristleSpacing: strokes.bristleSpacing,
      lodPointSpacing: strokes.pointSpacing,
    },
  });
  context.restore();
}
