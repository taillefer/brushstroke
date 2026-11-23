/** A colour as `#rrggbb` plus its alpha from 0 to 1. */
export interface Rgba {
  hex: string;
  alpha: number;
}

// The CSS named colours, as rrggbb.
const NAMED: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff',
  beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd', blue: '0000ff',
  blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00',
  chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c',
  cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9',
  darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b', darkolivegreen: '556b2f',
  darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f',
  darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1', darkviolet: '9400d3',
  deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969', dodgerblue: '1e90ff',
  firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22', fuchsia: 'ff00ff', gainsboro: 'dcdcdc',
  ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080', green: '008000',
  greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c',
  indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa', lavenderblush: 'fff0f5',
  lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080', lightcyan: 'e0ffff',
  lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1',
  lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899',
  lightsteelblue: 'b0c4de', lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6',
  magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa', mediumblue: '0000cd', mediumorchid: 'ba55d3',
  mediumpurple: '9370db', mediumseagreen: '3cb371', mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc',
  mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5',
  navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23',
  orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98',
  paleturquoise: 'afeeee', palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f',
  pink: 'ffc0cb', plum: 'dda0dd', powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399',
  red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072',
  sandybrown: 'f4a460', seagreen: '2e8b57', seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0',
  skyblue: '87ceeb', slateblue: '6a5acd', slategray: '708090', slategrey: '708090', snow: 'fffafa',
  springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8',
  tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3', white: 'ffffff',
  whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32',
};

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const VALUE = `(?:${NUMBER})(?:%|deg|rad|grad|turn)?`;
// rgb(), rgba(), hsl() and hsla(), with commas or with spaces and a slash before the alpha.
const FUNCTION = new RegExp(
  `^(rgba?|hsla?)\\(\\s*(${VALUE})\\s*(?:,\\s*|\\s+)(${VALUE})\\s*(?:,\\s*|\\s+)(${VALUE})\\s*(?:[,/]\\s*(${VALUE})\\s*)?\\)$`,
  'i',
);

/**
 * Reads a CSS colour as `#rrggbb` and an alpha: a named colour, `transparent`,
 * `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()` or
 * `hsla()`, with numbers or percentages. Returns undefined for anything else,
 * such as `currentColor`, `none`, `url(…)`, `var(…)` or newer colour spaces.
 */
export function parseColor(text: string): Rgba | undefined {
  const value = text.trim().toLowerCase();
  if (value === 'transparent') return { hex: '#000000', alpha: 0 };
  const named = NAMED[value];
  if (named) return { hex: `#${named}`, alpha: 1 };
  if (value.startsWith('#')) return parseHex(value.slice(1));

  const match = FUNCTION.exec(value);
  if (!match) return undefined;
  const [, kind, a, b, c, alphaText] = match as unknown as [string, string, string, string, string, string | undefined];
  const alpha = alphaText === undefined ? 1 : fraction(alphaText);
  if (alpha === undefined) return undefined;

  if (kind.startsWith('rgb')) {
    const channels = [a, b, c].map(channel);
    if (channels.some((x) => x === undefined)) return undefined;
    return { hex: toHex(channels as number[]), alpha };
  }
  const hue = angle(a);
  const saturation = percentage(b);
  const lightness = percentage(c);
  if (hue === undefined || saturation === undefined || lightness === undefined) return undefined;
  return { hex: toHex(hslToRgb(hue, saturation, lightness)), alpha };
}

function parseHex(digits: string): Rgba | undefined {
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(digits)) return undefined;
  const long = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
  const alpha = long.length === 8 ? parseInt(long.slice(6), 16) / 255 : 1;
  return { hex: `#${long.slice(0, 6)}`, alpha };
}

/** An rgb() channel from 0 to 255: a number, or a percentage of 255. */
function channel(text: string): number | undefined {
  if (text.endsWith('%')) return clamp((Number(text.slice(0, -1)) / 100) * 255, 0, 255);
  return /[a-z]$/.test(text) ? undefined : clamp(Number(text), 0, 255);
}

/** An alpha or opacity from 0 to 1: a number, or a percentage. */
export function fraction(text: string): number | undefined {
  const value = text.trim();
  const n = value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value);
  return value === '' || Number.isNaN(n) ? undefined : clamp(n, 0, 1);
}

function percentage(text: string): number | undefined {
  // CSS Color 4 also allows plain numbers here, meaning percent.
  const n = Number(text.endsWith('%') ? text.slice(0, -1) : text);
  return Number.isNaN(n) ? undefined : clamp(n / 100, 0, 1);
}

/** A hue in degrees. */
function angle(text: string): number | undefined {
  const match = /^(.*?)(deg|rad|grad|turn)?$/.exec(text)!;
  const n = Number(match[1]);
  if (Number.isNaN(n) || text.endsWith('%')) return undefined;
  const factor = { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 }[match[2] ?? 'deg'] ?? 1;
  return n * factor;
}

function hslToRgb(hue: number, s: number, l: number): number[] {
  const h = (((hue % 360) + 360) % 360) / 30;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => {
    const k = (n + h) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  });
}

function toHex(channels: number[]): string {
  return '#' + channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
