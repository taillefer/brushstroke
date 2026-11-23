// Every number that shapes the look of a painting. Code elsewhere reads these
// values and must not add look-related constants of its own. The tuning page
// (demo/tune.html) is where new defaults get chosen.

export interface Tuning {
  /** Number of bristles across the brush. */
  bristleCount: number;
  /** How far a bristle may sit from its even spot, as a share of the brush width. */
  bristleJitter: number;
  /** Opacity of one bristle at full pressure. */
  bristleOpacity: number;
  /** Line width of one bristle, as a multiple of the brush width divided by the bristle count. */
  bristleWidth: number;
  /** Width of the painted mark at zero pressure, as a share of the full width. */
  minimumWidth: number;
  /** How much pressure darkens the paint, from 0 (not at all) to 1 (fully). */
  pressureDarkness: number;

  /** Pressure along the middle of a line, before anchors, corners, direction and noise. */
  basePressure: number;
  /** Pressure at the very first point. */
  touchDownPressure: number;
  /** Pressure at the very last point. */
  liftOffPressure: number;
  /** Length of the touch-down, in brush widths. */
  startTaperLength: number;
  /** Length of the lift-off, in brush widths. */
  endTaperLength: number;

  /** Extra pressure at an anchor point of the SVG. */
  anchorPressure: number;
  /** Extra pressure at a corner. */
  cornerPressure: number;
  /** A point is a corner when the line turns by more than this, in degrees. */
  cornerAngle: number;
  /** How far the extra pressure around anchors and corners spreads, in brush widths. */
  slowdownLength: number;

  /** Pressure difference between pulling the brush down and pushing it up. */
  directionPressure: number;

  /** Size of the random pressure changes. */
  noiseAmount: number;
  /** Distance between random pressure bumps, in pixels. */
  noiseWavelength: number;

  /** Extra opacity where paint pools, at touch-down and at corners, as a share. */
  poolAmount: number;
  /** How far a pool of paint reaches, in brush widths. */
  poolLength: number;

  /** Typical distance a bristle paints before it runs dry, in pixels. */
  dryDistance: number;
  /** How much the dry distance varies between bristles, from 0 (all equal) to 1. */
  dryVariation: number;
  /** How long a bristle takes to run out once it starts to dry, as a share of its dry distance. */
  dryFade: number;
  /** Typical length of the gaps a drying bristle leaves, in pixels. */
  dryGapLength: number;

  /** Largest sideways drift of the hand from the SVG path, in pixels. */
  wobbleAmount: number;
  /** Distance between the bends of the drift, in pixels. */
  wobbleWavelength: number;

  /** How much the paper grain shows through light and dry paint, from 0 (not at all) to 1. */
  grainAmount: number;
  /** Size of the paper's bumps, in pixels. */
  grainSize: number;
  /** How sharp the grain's speckles are. Higher values give harder edges. */
  grainContrast: number;

  /** A corner of a closed shape that turns more than this, in degrees, splits it into separate strokes. 180 never splits. */
  splitAngleClosed: number;
  /** The same limit for open lines, such as a zigzag or handwriting. 180 never splits. */
  splitAngleOpen: number;
  /** How far each stroke runs on past a corner where the line was split, in pixels. */
  splitOvershoot: number;

  /** Angle of a flat brush for a right hand, in degrees. A left hand mirrors it. */
  flatBrushAngle: number;
  /** Thickness of a flat brush's edge, as a share of its width. */
  flatBrushThickness: number;

  // Level of detail. Each one is off at 0, which paints with full detail. Turn
  // them on to paint many lines or small brushes faster, for example on a map
  // that is zoomed out, at the cost of some texture.

  /** Smallest distance between bristles across the brush, in pixels. A small brush gets fewer bristles. 0 is off. */
  lodBristleSpacing: number;
  /** A brush narrower than this, in pixels, paints one stroke of varying width instead of bristles. 0 is off. */
  lodSingleStroke: number;
  /** Distance between the points of a line, as a share of the brush width, never below 1 pixel. 0 keeps 1 pixel. */
  lodPointSpacing: number;
}

export const defaultTuning: Tuning = {
  bristleCount: 24,
  bristleJitter: 0.04,
  bristleOpacity: 0.6,
  bristleWidth: 1.6,
  minimumWidth: 0.2,
  pressureDarkness: 0.5,

  basePressure: 0.75,
  touchDownPressure: 0.3,
  liftOffPressure: 0.1,
  startTaperLength: 1,
  endTaperLength: 1.5,

  anchorPressure: 0.1,
  cornerPressure: 0.25,
  cornerAngle: 35,
  slowdownLength: 0.8,

  directionPressure: 0.15,

  noiseAmount: 0.08,
  noiseWavelength: 60,

  poolAmount: 0.4,
  poolLength: 0.6,

  dryDistance: 600,
  dryVariation: 0.5,
  dryFade: 0.5,
  dryGapLength: 8,

  wobbleAmount: 1.5,
  wobbleWavelength: 120,

  grainAmount: 0.5,
  grainSize: 2,
  grainContrast: 6,

  splitAngleClosed: 70,
  splitAngleOpen: 150,
  splitOvershoot: 3,

  flatBrushAngle: 45,
  flatBrushThickness: 0.15,

  lodBristleSpacing: 0,
  lodSingleStroke: 0,
  lodPointSpacing: 0,
};

export interface TuningFieldRange {
  min: number;
  max: number;
  step: number;
}

/** Slider ranges for the tuning page. Every field of `Tuning` has one. */
export const tuningRanges: Record<keyof Tuning, TuningFieldRange> = {
  bristleCount: { min: 4, max: 64, step: 1 },
  bristleJitter: { min: 0, max: 0.5, step: 0.01 },
  bristleOpacity: { min: 0.05, max: 1, step: 0.01 },
  bristleWidth: { min: 0.2, max: 4, step: 0.1 },
  minimumWidth: { min: 0, max: 1, step: 0.01 },
  pressureDarkness: { min: 0, max: 1, step: 0.01 },

  basePressure: { min: 0, max: 1, step: 0.01 },
  touchDownPressure: { min: 0, max: 1, step: 0.01 },
  liftOffPressure: { min: 0, max: 1, step: 0.01 },
  startTaperLength: { min: 0, max: 5, step: 0.1 },
  endTaperLength: { min: 0, max: 5, step: 0.1 },

  anchorPressure: { min: 0, max: 0.5, step: 0.01 },
  cornerPressure: { min: 0, max: 0.5, step: 0.01 },
  cornerAngle: { min: 5, max: 120, step: 1 },
  slowdownLength: { min: 0, max: 3, step: 0.1 },

  directionPressure: { min: 0, max: 0.5, step: 0.01 },

  noiseAmount: { min: 0, max: 0.5, step: 0.01 },
  noiseWavelength: { min: 5, max: 300, step: 1 },

  poolAmount: { min: 0, max: 1.5, step: 0.01 },
  poolLength: { min: 0, max: 3, step: 0.1 },

  dryDistance: { min: 50, max: 3000, step: 10 },
  dryVariation: { min: 0, max: 1, step: 0.01 },
  dryFade: { min: 0, max: 2, step: 0.01 },
  dryGapLength: { min: 1, max: 50, step: 1 },

  wobbleAmount: { min: 0, max: 10, step: 0.1 },
  wobbleWavelength: { min: 10, max: 600, step: 5 },

  grainAmount: { min: 0, max: 1, step: 0.01 },
  grainSize: { min: 0.5, max: 12, step: 0.1 },
  grainContrast: { min: 1, max: 20, step: 0.5 },

  splitAngleClosed: { min: 5, max: 180, step: 1 },
  splitAngleOpen: { min: 5, max: 180, step: 1 },
  splitOvershoot: { min: 0, max: 20, step: 1 },

  flatBrushAngle: { min: 0, max: 90, step: 1 },
  flatBrushThickness: { min: 0.02, max: 1, step: 0.01 },

  lodBristleSpacing: { min: 0, max: 4, step: 0.1 },
  lodSingleStroke: { min: 0, max: 12, step: 0.5 },
  lodPointSpacing: { min: 0, max: 1, step: 0.01 },
};

/** `defaultTuning` with the caller's values on top. */
export function resolveTuning(overrides: Partial<Tuning> = {}): Tuning {
  return { ...defaultTuning, ...overrides };
}

// ── Wash ─────────────────────────────────────────────────────────────────────
// The look of `paintWash`: a filled area painted as a watercolour wash. Chosen
// on demo/wash.html, like `defaultTuning` on demo/tune.html.

/** An RGB colour and its strongest opacity, from 0 to 1. */
export type WashColor = [r: number, g: number, b: number, alpha: number];

/**
 * A band of noise octaves. Each octave is a tile of noise that covers 2^k
 * units of the line coordinates, so it stays in place when the view zooms.
 */
export interface WashLayer {
  /** Noise blobs across a tile. More blobs repeat less often but cost more to make. */
  cells: number;
  /** Seed of the layer's tiles. */
  seed: number;
  /** How many different tiles the octaves take turns with. */
  tiles: number;
  /** An octave fades in, over one octave, as its tile grows past this size on the canvas, in pixels... */
  fromPx: number;
  /** ...and fades out, over one octave, as it grows to this size. A whole number of octaves above `fromPx` keeps the strength even. */
  toPx: number;
  /** Where the noise is above 0, this colour darkens the paint. */
  ink: WashColor;
  /** Where the noise is below 0, this colour lightens it: bare paper. */
  paper: WashColor;
  /** Noise below this shows the paper strongly: a spot the brush missed. 1 turns them off. */
  missed: number;
  /** How far above `missed` a missed spot starts to show, in noise units: its soft rim. */
  missedRim: number;
}

/**
 * Paint pooled along the inside of an area's edge: darkest at the edge and
 * fading inward, as wet paint dries towards its rim.
 */
export interface WashEdge {
  /** How far inward the darkening reaches, in canvas pixels. */
  width: number;
  /** Its opacity right at the edge. */
  alpha: number;
  /**
   * The shape of the fade: opacity × (1 − distance / width) ^ falloff. 1 fades
   * evenly; higher values keep a thin dark rim with a soft tail.
   */
  falloff: number;
  /** Strokes the gradient is built from. More are smoother and cost more per area. */
  steps: number;
}

export interface WashTuning {
  /** Blotches and missed spots: what is on the map. Many octaves, from small to large. */
  wash: WashLayer;
  /** Paper grain: what it is painted on. About two octaves, so it stays the same size on the canvas. */
  grain: WashLayer;
  /** Pooled paint along the inside of the edge. */
  edge: WashEdge;
  /** Colour of the pooled paint, as RGB. */
  edgeColor: [r: number, g: number, b: number];
  /** Side of a noise tile in pixels. */
  tileSize: number;
}

export const defaultWashTuning: WashTuning = {
  wash: {
    cells: 24,
    seed: 0x5eed1,
    tiles: 3,
    fromPx: 384,
    toPx: 12288,
    ink: [70, 48, 24, 0.13],
    paper: [255, 248, 228, 0.1],
    missed: -0.7,
    missedRim: 0.3,
  },
  grain: {
    cells: 256,
    seed: 0x6a41,
    tiles: 2,
    fromPx: 512,
    toPx: 2048,
    ink: [60, 40, 20, 0.12],
    paper: [255, 250, 235, 0.1],
    missed: 1,
    missedRim: 0.3,
  },
  edge: { width: 12, alpha: 0.2, falloff: 2.5, steps: 10 },
  edgeColor: [40, 28, 16],
  tileSize: 512,
};
