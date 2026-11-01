// CSS pixels per unit, per the CSS spec.
const UNITS: Record<string, number> = {
  '': 1,
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 16,
};

/**
 * Parses an SVG length such as "12", "12px" or "3mm" into CSS pixels.
 * Returns undefined for missing values, percentages and font-relative units,
 * so the caller can use its fallback.
 */
export function parseLength(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(text);
  if (!match) return undefined;
  const factor = UNITS[(match[2] ?? '').toLowerCase()];
  return factor === undefined ? undefined : Number(match[1]) * factor;
}
