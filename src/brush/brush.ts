import { bumpAround } from '../geometry/bump';
import type { FlatLine } from '../geometry/flatten';
import type { Hand } from '../hand';
import { createNoise1D, type Random } from '../random';
import type { Tuning } from '../tuning';
import type { BristleSink } from '../strokePlan';
import type { Point } from '../types';

export type BrushKind = 'flat' | 'round';

export interface BrushOptions {
  brush: BrushKind;
  /** Brush width in pixels. */
  size: number;
  hand: Hand;
}

export interface BristlePoint extends Point {
  /** Opacity of the paint at this point. 0 means the bristle does not touch the paper. */
  alpha: number;
}

/** The track one bristle leaves along one line. */
export interface BristlePath {
  color: string;
  /** Line width in pixels. */
  width: number;
  points: BristlePoint[];
}

interface Bristle {
  /** Fixed offset from the brush centre, in pixels. */
  offset: Point;
  /** Distance from the brush centre as a share of the brush width, from 0 to about 0.5. */
  reach: number;
  /** Distance after which this bristle starts to run dry, in pixels. */
  dryDistance: number;
  gapNoise: (x: number) => number;
}

/**
 * The height of the paper at a point, from 0 (a valley) to 1 (a peak). The
 * same point must always give the same height, for every stroke.
 */
export type Paper = (x: number, y: number) => number;

/** Perfectly smooth paper: no grain at all. */
export const flatPaper: Paper = () => 1;

/**
 * How much of the paint reaches the paper at a spot, from 0 to 1. Heavy, wet
 * paint (`load` near 1) covers everything. As the load drops, the valleys of
 * the paper stay bare and only the peaks catch paint.
 */
export function grainCoverage(height: number, load: number, tuning: Pick<Tuning, 'grainAmount' | 'grainContrast'>): number {
  const waterline = tuning.grainAmount * (1 - load);
  return clamp01(1 - (waterline - height) * tuning.grainContrast);
}

/** The unit direction a flat brush's edge points in, on screen (y points down). A left hand mirrors it. */
export function flatBrushAxis(hand: Hand, tuning: Pick<Tuning, 'flatBrushAngle'>): Point {
  const angle = (tuning.flatBrushAngle * Math.PI) / 180;
  const x = Math.cos(angle);
  return { x: hand === 'right' ? x : -x, y: -Math.sin(angle) };
}

/**
 * Turns one line into one path per bristle.
 *
 * Pressure decides how many bristles touch the paper: the outer bristles lift
 * first, so a light touch paints a narrow mark. It also decides how dark the
 * paint is. A flat brush keeps its edge at a fixed angle, so its mark is wide
 * across the edge and thin along it. A round brush is the same in every
 * direction.
 */
export function brushLine(
  line: FlatLine,
  pressure: readonly number[],
  options: BrushOptions,
  tuning: Tuning,
  random: Random,
  paper: Paper = flatPaper,
): BristlePath[] {
  const paths: BristlePath[] = [];
  paintBristles(line, pressure, options, tuning, random, paper, {
    beginPath: (color, width) => paths.push({ color, width, points: [] }),
    point: (x, y, alpha) => paths[paths.length - 1]!.points.push({ x, y, alpha }),
    endPath: () => {},
  });
  return paths;
}

/** Like `brushLine`, but hands every path to `sink` point by point instead of building objects. */
export function paintBristles(
  line: FlatLine,
  pressure: readonly number[],
  options: BrushOptions,
  tuning: Tuning,
  random: Random,
  paper: Paper,
  sink: BristleSink,
): void {
  if (options.size < tuning.lodSingleStroke) {
    paintSingleStroke(line, pressure, options, tuning, random, paper, sink);
    return;
  }
  if (tuning.lodBristleSpacing > 0) {
    const count = Math.max(1, Math.min(Math.round(tuning.bristleCount), Math.floor(options.size / tuning.lodBristleSpacing)));
    if (count < tuning.bristleCount) tuning = { ...tuning, bristleCount: count };
  }
  const bristles = createBristles(options, tuning, random);
  const width = Math.max(0.5, (options.size / tuning.bristleCount) * tuning.bristleWidth);
  // The edge of the mark fades over the space between two bristles, so it is soft rather than stepped.
  const edgeSoftness = 0.5 / tuning.bristleCount;
  // Paint pools where the brush touches down and where it pauses at a corner.
  const poolCentres = [0, ...line.points.filter((p) => p.corner).map((p) => p.distance)];
  const pool = bumpAround(line, poolCentres, tuning.poolLength * options.size);

  // What depends only on the point is worked out once, for all bristles.
  const { points } = line;
  const count = points.length;
  const pressures = new Float64Array(count);
  const reaches = new Float64Array(count);
  const darknesses = new Float64Array(count);
  const pools = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const p = pressure[i] ?? 0;
    pressures[i] = p;
    reaches[i] = (tuning.minimumWidth + (1 - tuning.minimumWidth) * p) / 2;
    darknesses[i] = 1 + (p - 1) * tuning.pressureDarkness;
    pools[i] = 1 + tuning.poolAmount * pool[i]!;
  }
  const { bristleOpacity, grainAmount, grainContrast } = tuning;

  for (const bristle of bristles) {
    sink.beginPath(line.color, width, count, false);
    const { x: offsetX, y: offsetY } = bristle.offset;
    for (let i = 0; i < count; i++) {
      const point = points[i]!;
      const contact = clamp01((reaches[i]! - bristle.reach) / edgeSoftness + 0.5);
      const left = paintLeft(bristle, point.distance, tuning);
      const x = point.x + offsetX;
      const y = point.y + offsetY;
      // grainCoverage, inlined.
      const waterline = grainAmount * (1 - pressures[i]! * left);
      const grain = clamp01(1 - (waterline - paper(x, y)) * grainContrast);
      const alpha = Math.min(1, bristleOpacity * contact * darknesses[i]! * pools[i]! * left * grain);
      sink.point(x, y, alpha, 1);
    }
    sink.endPath();
  }
}

/**
 * Level of detail for a brush too small for its bristles to show: one stroke
 * whose width follows the pressure, as wide as the bristles' mark would be.
 * Its opacity stands in for the few bristles that overlap at each spot. The
 * pooling, drying and paper grain are those of a single bristle in the
 * middle of the brush.
 */
function paintSingleStroke(
  line: FlatLine,
  pressure: readonly number[],
  options: BrushOptions,
  tuning: Tuning,
  random: Random,
  paper: Paper,
  sink: BristleSink,
): void {
  const poolCentres = [0, ...line.points.filter((p) => p.corner).map((p) => p.distance)];
  const pool = bumpAround(line, poolCentres, tuning.poolLength * options.size);
  const bristle: Bristle = {
    offset: { x: 0, y: 0 },
    reach: 0,
    dryDistance: tuning.dryDistance,
    gapNoise: createNoise1D(Math.floor(random.fork(0).next() * 4294967296)),
  };
  const layers = Math.max(1, tuning.bristleWidth);

  sink.beginPath(line.color, options.size, line.points.length, true);
  line.points.forEach((point, i) => {
    const p = pressure[i] ?? 0;
    const share = tuning.minimumWidth + (1 - tuning.minimumWidth) * p;
    const darkness = 1 + (p - 1) * tuning.pressureDarkness;
    const pooled = 1 + tuning.poolAmount * pool[i]!;
    const left = paintLeft(bristle, point.distance, tuning);
    const grain = grainCoverage(paper(point.x, point.y), p * left, tuning);
    const layer = Math.min(1, tuning.bristleOpacity * darkness * pooled * left * grain);
    sink.point(point.x, point.y, 1 - (1 - layer) ** layers, share);
  });
  sink.endPath();
}

function createBristles(options: BrushOptions, tuning: Tuning, random: Random): Bristle[] {
  const { size } = options;
  const count = Math.max(1, Math.round(tuning.bristleCount));
  // Bristles are laid out for a right hand. A left hand gets the mirror image.
  const axis = flatBrushAxis('right', tuning);
  const across: Point = { x: -axis.y, y: axis.x };
  const mirror = options.hand === 'left' ? -1 : 1;
  // Golden angle: spreads the round brush's bristles evenly over its disc.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const turn = random.next() * 2 * Math.PI;

  return Array.from({ length: count }, (_, i): Bristle => {
    const own = random.fork(i);
    const jitter = (own.next() * 2 - 1) * tuning.bristleJitter;
    let offset: Point;
    let reach: number;

    if (options.brush === 'flat') {
      const along = (i + 0.5) / count - 0.5 + jitter;
      const depth = (own.next() - 0.5) * tuning.flatBrushThickness;
      offset = {
        x: (axis.x * along + across.x * depth) * size,
        y: (axis.y * along + across.y * depth) * size,
      };
      reach = Math.abs(along);
    } else {
      const radius = Math.max(0, 0.5 * Math.sqrt((i + 0.5) / count) + jitter);
      const angle = turn + i * goldenAngle;
      offset = { x: Math.cos(angle) * radius * size, y: Math.sin(angle) * radius * size };
      reach = radius;
    }

    return {
      offset: { x: offset.x * mirror, y: offset.y },
      reach,
      dryDistance: tuning.dryDistance * (1 + tuning.dryVariation * (own.next() * 2 - 1)),
      gapNoise: createNoise1D(Math.floor(own.next() * 4294967296)),
    };
  });
}

/**
 * How much paint the bristle still lays down, from 1 to 0. Once a bristle
 * passes its dry distance it fades out, and breaks into gaps that grow as it
 * runs out.
 */
function paintLeft(bristle: Bristle, distance: number, tuning: Tuning): number {
  if (distance <= bristle.dryDistance) return 1;
  const fadeLength = tuning.dryFade * bristle.dryDistance;
  const ink = fadeLength > 0 ? clamp01(1 - (distance - bristle.dryDistance) / fadeLength) : 0;
  const patch = (bristle.gapNoise(distance / tuning.dryGapLength) + 1) / 2;
  return patch < ink ? ink : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
