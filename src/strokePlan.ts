/** An axis-aligned rectangle. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One painted path in a `StrokePlan`, usually the track of one bristle. */
export interface StrokePath {
  color: string;
  /** Line width in pixels. For a path with varying width, the full width that the width steps are shares of. */
  width: number;
  /** Index of the path's first point in the plan (counted in points, not in numbers). */
  start: number;
  /** Number of points. */
  count: number;
  /** True when the width varies along the path, see `StrokePlan.widths`. */
  varies: boolean;
  /** Bounding box of the path, half the line width included. */
  box: Rect;
}

/**
 * Painted strokes, ready to draw: the result of `planLines`.
 *
 * Plain data (typed arrays, numbers and strings), so it can be kept between
 * frames, structured-cloned, or sent from a Worker (transfer `points.buffer`,
 * `alphas.buffer` and `widths.buffer` to avoid a copy).
 *
 * Point `i` is at (`points[2i]`, `points[2i + 1]`). The piece of a path from
 * its point `i` to point `i + 1` is drawn with opacity `alphas[i] / alphaSteps`;
 * 0 means it is not drawn. On a path that `varies`, it is drawn
 * `widths[i] / widthSteps` times the path's width. The slot of a path's last
 * point is unused.
 */
export interface StrokePlan {
  points: Float64Array;
  alphas: Uint8Array;
  /** Null when no path varies in width. */
  widths: Uint8Array | null;
  alphaSteps: number;
  widthSteps: number;
  /** In drawing order. */
  paths: StrokePath[];
  /** Bounding box of all paths, or null for an empty plan. */
  box: Rect | null;
}

// Opacity changes along a bristle are drawn in this many steps. Neighbouring
// pieces with the same step share one canvas path, which keeps drawing fast.
export const ALPHA_STEPS = 32;
// Width changes along a path of varying width are drawn in this many steps.
export const WIDTH_STEPS = 16;

/** Receives bristle paths point by point, as the brush paints them. */
export interface BristleSink {
  /** Starts a path. `count` is the number of points that follow. */
  beginPath(color: string, width: number, count: number, varies: boolean): void;
  /** `widthShare` is the share of the path's width at this point, for a path that varies. */
  point(x: number, y: number, alpha: number, widthShare: number): void;
  endPath(): void;
}

/** Builds a `StrokePlan` from bristle paths, in growing typed arrays. */
export class PlanBuilder implements BristleSink {
  private points = new Float64Array(8192);
  private alphas = new Uint8Array(4096);
  private widths: Uint8Array | null = null;
  private length = 0;
  private paths: StrokePath[] = [];
  private path: StrokePath | null = null;
  private lastAlpha = 0;
  private lastShare = 0;
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  beginPath(color: string, width: number, count: number, varies: boolean): void {
    this.reserve(count);
    if (varies && !this.widths) this.widths = new Uint8Array(this.alphas.length);
    this.path = { color, width, start: this.length, count: 0, varies, box: { x: 0, y: 0, width: 0, height: 0 } };
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
  }

  point(x: number, y: number, alpha: number, widthShare: number): void {
    const path = this.path!;
    const index = this.length++;
    if (index >= this.alphas.length) this.reserve(1);
    this.points[2 * index] = x;
    this.points[2 * index + 1] = y;
    if (path.count > 0) {
      this.alphas[index - 1] = Math.max(0, Math.round(((this.lastAlpha + alpha) / 2) * ALPHA_STEPS));
      if (path.varies) this.widths![index - 1] = Math.max(1, Math.round(((this.lastShare + widthShare) / 2) * WIDTH_STEPS));
    }
    path.count++;
    this.lastAlpha = alpha;
    this.lastShare = widthShare;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  endPath(): void {
    const path = this.path!;
    // The last point starts no piece.
    if (path.count > 0) this.alphas[path.start + path.count - 1] = 0;
    if (path.count > 0) {
      const margin = path.width / 2;
      path.box = {
        x: this.minX - margin,
        y: this.minY - margin,
        width: this.maxX - this.minX + 2 * margin,
        height: this.maxY - this.minY + 2 * margin,
      };
    }
    this.paths.push(path);
    this.path = null;
  }

  finish(): StrokePlan {
    let box: Rect | null = null;
    for (const { box: b, count } of this.paths) {
      if (count === 0) continue;
      if (!box) {
        box = { ...b };
        continue;
      }
      const right = Math.max(box.x + box.width, b.x + b.width);
      const bottom = Math.max(box.y + box.height, b.y + b.height);
      box.x = Math.min(box.x, b.x);
      box.y = Math.min(box.y, b.y);
      box.width = right - box.x;
      box.height = bottom - box.y;
    }
    return {
      points: this.points.slice(0, 2 * this.length),
      alphas: this.alphas.slice(0, this.length),
      widths: this.widths ? this.widths.slice(0, this.length) : null,
      alphaSteps: ALPHA_STEPS,
      widthSteps: WIDTH_STEPS,
      paths: this.paths,
      box,
    };
  }

  private reserve(count: number): void {
    const needed = this.length + count;
    if (needed <= this.alphas.length) return;
    let size = this.alphas.length;
    while (size < needed) size *= 2;
    const points = new Float64Array(2 * size);
    points.set(this.points.subarray(0, 2 * this.length));
    const alphas = new Uint8Array(size);
    alphas.set(this.alphas.subarray(0, this.length));
    this.points = points;
    this.alphas = alphas;
    if (this.widths) {
      const widths = new Uint8Array(size);
      widths.set(this.widths.subarray(0, this.length));
      this.widths = widths;
    }
  }
}

/** True when two rectangles overlap or touch. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}
