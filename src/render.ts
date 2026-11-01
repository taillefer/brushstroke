import type { BristlePath } from './brush/brush';
import type { PaintingPlan } from './plan';

/** A 2D context of an on-screen or offscreen canvas. */
export type PaintContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Opacity changes along a bristle are drawn in this many steps. Neighbouring
// pieces with the same step share one canvas path, which keeps drawing fast.
const ALPHA_STEPS = 32;

/** Sizes the canvas for the plan and the screen's pixel ratio, clears it, and draws every bristle path. */
export function drawPlan(canvas: HTMLCanvasElement, plan: PaintingPlan, pixelRatio: number): void {
  canvas.width = Math.ceil(plan.width * pixelRatio);
  canvas.height = Math.ceil(plan.height * pixelRatio);
  canvas.style.width = `${plan.width}px`;
  canvas.style.height = `${plan.height}px`;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('brushstroke: the canvas has no 2D context');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, plan.width, plan.height);
  drawPaths(context, plan.paths);
}

/**
 * Draws bristle paths in the context's current transform, on top of what is
 * already there. The context's state is restored afterwards.
 */
export function drawPaths(context: PaintContext, paths: BristlePath[]): void {
  context.save();
  // Butt caps: round caps would leave darker dots where two pieces of one bristle meet.
  context.lineCap = 'butt';
  context.lineJoin = 'round';

  for (const path of paths) {
    context.strokeStyle = path.color;
    context.lineWidth = path.width;
    let step = 0;
    let open = false;

    const flush = () => {
      if (open) context.stroke();
      open = false;
    };

    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1]!;
      const b = path.points[i]!;
      const pieceStep = Math.round(((a.alpha + b.alpha) / 2) * ALPHA_STEPS);
      if (pieceStep === 0) {
        flush();
        continue;
      }
      if (!open || pieceStep !== step) {
        flush();
        step = pieceStep;
        context.globalAlpha = step / ALPHA_STEPS;
        context.beginPath();
        context.moveTo(a.x, a.y);
        open = true;
      }
      context.lineTo(b.x, b.y);
    }
    flush();
  }
  context.restore();
}
