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

  /** A corner that turns more than this, in degrees, splits the line into separate strokes. 180 never splits. */
  splitAngle: number;
  /** How far each stroke runs on past a corner where the line was split, in pixels. */
  splitOvershoot: number;

  /** Angle of a flat brush for a right hand, in degrees. A left hand mirrors it. */
  flatBrushAngle: number;
  /** Thickness of a flat brush's edge, as a share of its width. */
  flatBrushThickness: number;
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

  splitAngle: 70,
  splitOvershoot: 3,

  flatBrushAngle: 45,
  flatBrushThickness: 0.15,
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

  splitAngle: { min: 5, max: 180, step: 1 },
  splitOvershoot: { min: 0, max: 20, step: 1 },

  flatBrushAngle: { min: 0, max: 90, step: 1 },
  flatBrushThickness: { min: 0.02, max: 1, step: 0.01 },
};

/** `defaultTuning` with the caller's values on top. */
export function resolveTuning(overrides: Partial<Tuning> = {}): Tuning {
  return { ...defaultTuning, ...overrides };
}
