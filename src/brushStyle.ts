import type { BrushKind, BrushOptions } from './brush/brush';
import type { Hand } from './hand';
import type { Tuning } from './tuning';

/** How the brush looks. Shared by `paintLines`, `planLines` and `paintSvg`. */
export interface BrushStyle {
  /** 'flat' (default) or 'round'. */
  brush?: BrushKind;
  /** Brush width in CSS pixels. Default 12. */
  size?: number;
  /** The painter's hand. Default 'right'. */
  hand?: Hand;
  /** Fine control over the look, on top of `defaultTuning`. */
  tuning?: Partial<Tuning>;
}

const DEFAULT_SIZE = 12;

export function resolveBrush(style: BrushStyle): BrushOptions {
  return { brush: style.brush ?? 'flat', size: style.size ?? DEFAULT_SIZE, hand: style.hand ?? 'right' };
}
