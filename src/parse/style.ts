type Attributes = Readonly<Record<string, string>>;

/** The inherited paint properties at one element. Undefined means not set anywhere. */
export interface PaintContext {
  stroke: string | undefined;
  fill: string | undefined;
  color: string | undefined;
  hidden: boolean;
}

export const rootPaintContext: PaintContext = {
  stroke: undefined,
  fill: undefined,
  color: undefined,
  hidden: false,
};

/**
 * Reads one property. A declaration in the `style` attribute wins over a
 * presentation attribute, as in CSS. "inherit" counts as not set.
 */
export function readProperty(attributes: Attributes, name: string): string | undefined {
  const fromStyle = parseStyleAttribute(attributes.style)[name];
  const value = (fromStyle ?? attributes[name])?.trim();
  return value && value !== 'inherit' ? value : undefined;
}

export function isDisplayNone(attributes: Attributes): boolean {
  return readProperty(attributes, 'display') === 'none';
}

/** The paint properties of an element, given those of its parent. */
export function childPaintContext(parent: PaintContext, attributes: Attributes): PaintContext {
  const visibility = readProperty(attributes, 'visibility');
  return {
    stroke: readProperty(attributes, 'stroke') ?? parent.stroke,
    fill: readProperty(attributes, 'fill') ?? parent.fill,
    color: readProperty(attributes, 'color') ?? parent.color,
    hidden: visibility === undefined ? parent.hidden : visibility === 'hidden' || visibility === 'collapse',
  };
}

/**
 * The colour to paint an element's line with, or null to skip it.
 *
 * - An explicit stroke colour is used as it is.
 * - `stroke="none"` skips the element.
 * - With no stroke set, an element that has a fill is a filled shape and is
 *   skipped. Anything else is plain line art and is painted black.
 */
export function lineColor(context: PaintContext): string | null {
  if (context.hidden) return null;
  const { stroke, fill } = context;
  if (stroke === undefined) return fill !== undefined && fill !== 'none' ? null : 'black';
  if (stroke === 'none') return null;
  return resolveColor(stroke, context.color);
}

function resolveColor(value: string, color: string | undefined): string {
  if (value === 'currentColor') return color ?? 'black';
  // Gradients and patterns are not supported. Use the fallback colour after the url(...) if there is one.
  if (value.startsWith('url(')) {
    const fallback = value.slice(value.indexOf(')') + 1).trim();
    return fallback && fallback !== 'none' ? resolveColor(fallback, color) : 'black';
  }
  return value;
}

function parseStyleAttribute(style: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!style) return result;
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).replace(/!important/i, '').trim();
    if (name && value) result[name] = value;
  }
  return result;
}
