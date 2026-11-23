import type { PaintingPlan } from './plan';
import { intersects, type Rect, type StrokePlan } from './strokePlan';

/** A 2D context of an on-screen or offscreen canvas. */
export type PaintContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface DrawPlanOptions {
  /**
   * Multiplies the plan's coordinates and line widths, so a plan made at one
   * zoom level can be drawn at a nearby one. The brush, wobble and grain grow
   * or shrink with it, so for a large change of zoom (more than about ×1.5
   * either way) plan the lines again at the new scale instead. Default 1.
   */
  scale?: number;
  /** Moves the strokes, in canvas pixels, after scaling. Default 0. */
  offset?: { x?: number; y?: number };
  /**
   * Only draw paths that can show inside this rectangle, in canvas pixels
   * (after scale and offset), for example the visible part of the canvas.
   * Paths outside it are skipped; nothing is cut.
   */
  clip?: Rect;
}

/** Sizes the canvas for the painting and the screen's pixel ratio, clears it, and draws every bristle path. */
export function drawPainting(canvas: HTMLCanvasElement, painting: PaintingPlan, pixelRatio: number): void {
  canvas.width = Math.ceil(painting.width * pixelRatio);
  canvas.height = Math.ceil(painting.height * pixelRatio);
  canvas.style.width = `${painting.width}px`;
  canvas.style.height = `${painting.height}px`;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('brushstroke: the canvas has no 2D context');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, painting.width, painting.height);
  drawPlan(context, painting.strokes);
}

/**
 * Draws a plan from `planLines` in the context's current transform, on top of
 * what is already there. The canvas is not resized or cleared, and the
 * context's state is restored afterwards.
 */
export function drawPlan(context: PaintContext, plan: StrokePlan, options: DrawPlanOptions = {}): void {
  const scale = options.scale ?? 1;
  const x = options.offset?.x ?? 0;
  const y = options.offset?.y ?? 0;
  const { clip } = options;
  const visible = (box: Rect) =>
    !clip || intersects({ x: box.x * scale + x, y: box.y * scale + y, width: box.width * scale, height: box.height * scale }, clip);
  if (plan.box && !visible(plan.box)) return;

  const { points, alphas, widths, alphaSteps, widthSteps } = plan;
  context.save();
  context.translate(x, y);
  // Butt caps: round caps would leave darker dots where two pieces of one bristle meet.
  context.lineCap = 'butt';
  context.lineJoin = 'round';
  // Canvas state is only set when it changes: setting a colour means parsing it again.
  let color: string | undefined;
  let lineWidth = NaN;
  let globalAlpha = NaN;

  for (const path of plan.paths) {
    if (!visible(path.box)) continue;
    const width = path.width * scale;
    let step = 0;
    let widthStep = 0;
    let open = false;
    const end = path.start + path.count - 1;

    for (let i = path.start; i < end; i++) {
      const pieceStep = alphas[i]!;
      if (pieceStep === 0) {
        if (open) context.stroke();
        open = false;
        continue;
      }
      const pieceWidth = path.varies ? widths![i]! : widthSteps;
      if (!open || pieceStep !== step || pieceWidth !== widthStep) {
        if (open) context.stroke();
        step = pieceStep;
        widthStep = pieceWidth;
        if (path.color !== color) context.strokeStyle = color = path.color;
        const pieceLineWidth = path.varies ? (width * widthStep) / widthSteps : width;
        if (pieceLineWidth !== lineWidth) context.lineWidth = lineWidth = pieceLineWidth;
        const pieceAlpha = step / alphaSteps;
        if (pieceAlpha !== globalAlpha) context.globalAlpha = globalAlpha = pieceAlpha;
        context.beginPath();
        if (scale === 1) context.moveTo(points[2 * i]!, points[2 * i + 1]!);
        else context.moveTo(points[2 * i]! * scale, points[2 * i + 1]! * scale);
        open = true;
      }
      if (scale === 1) context.lineTo(points[2 * i + 2]!, points[2 * i + 3]!);
      else context.lineTo(points[2 * i + 2]! * scale, points[2 * i + 3]! * scale);
    }
    if (open) context.stroke();
  }
  context.restore();
}
