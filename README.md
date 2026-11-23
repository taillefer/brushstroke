# brushstroke

Paint the lines of an SVG on a canvas as if they were drawn with a brush.

## Install

brushstroke is not on npm. Install it from the public GitHub repository at a version tag:

```sh
npm install github:taillefer/brushstroke#v0.3.0
```

npm builds `dist/` during the install (the `prepare` script). The functions marked *since 0.3.0* below need `#v0.3.0` or later; with `#v0.2.0` only the others are there.

## Painting an SVG

```ts
import { paintSvg } from 'brushstroke';

const canvas = await paintSvg('/logo.svg', {
  brush: 'flat', // 'flat' (default) or 'round'
  size: 14,      // brush width in CSS pixels, default 12
  hand: 'right', // 'right' (default) or 'left'
});
document.body.append(canvas);
```

`paintSvg(source, options)` takes an SVG string, an `<svg>` element, or a URL. It returns a canvas.

| Option | Default | What it does |
|--------|---------|--------------|
| `brush` | `'flat'` | A flat brush makes thick and thin parts depending on direction, like calligraphy. A round brush is as wide in every direction. |
| `size` | `12` | Brush width in CSS pixels. |
| `hand` | `'right'` | The painter's hand. It decides which way each line is painted and the angle of a flat brush. |
| `seed` | hash of the SVG text | The seed for the small random variations. The same SVG and seed always paint the same way. |
| `tuning` | `defaultTuning` | Fine control over the look, such as bristle count and tapers. |
| `canvas` | a new canvas | Paint on this canvas instead of creating one. |
| `width` | from the SVG | Output width in CSS pixels. |

### Keeping lines stable when the SVG changes

Each line's small variations come from the seed and the line's position in the SVG. Adding an element moves every element after it, so those repaint differently. To keep an element's look, give it an `id`: its lines then take their variations from the seed and the id, wherever they are in the file.

That only helps with a fixed `seed`. The default seed is a hash of the SVG text, so any edit to the file changes it, and every line repaints.

Only lines are painted: `path`, `line`, `polyline`, `polygon`, `rect`, `circle` and `ellipse`. Shapes that have a fill and no stroke are skipped. Each line uses its stroke colour, or black.

## Painting lines you already have

`paintLines(context, lines, options)` paints lines onto an existing 2D context, for example a map tile or a chart. The lines use the same format as `parseSvg` returns (see below), so they can come from an SVG or from your own data.

```ts
import { paintLines, type SvgLine } from 'brushstroke';

const coast: SvgLine = {
  start: { x: 0, y: 40 },
  segments: [{ kind: 'cubic', c1: { x: 30, y: 10 }, c2: { x: 60, y: 70 }, to: { x: 100, y: 40 } }],
  closed: false,
  color: '#2a6f97',
  seed: 'coast-17', // keeps this line's look when other lines change
};

paintLines(context, [coast], {
  brush: 'round',
  size: 8,
  seed: 42,
  transform: { scale: 2, x: -256, y: 0 }, // canvas = line × scale + (x, y)
});
```

It takes `brush`, `size`, `hand` and `tuning` like `paintSvg`. It also takes:

| Option | Default | What it does |
|--------|---------|--------------|
| `seed` | `0` | The seed for the variations. There is no SVG text to hash. |
| `transform` | `{ scale: 1, x: 0, y: 0 }` | Maps line coordinates to canvas pixels. |

Behaviour to rely on:

- The canvas is not resized or cleared, and the context's settings are restored afterwards. The context's own transform, such as the screen's pixel ratio, applies on top.
- `scale` moves the strokes, not the brush. The brush size, the wobble and the paper grain stay in canvas pixels.
- Scaling the context itself, with `context.scale()` or `setTransform()`, scales everything, the brush included. To zoom a map and keep the brush the same size on screen, put the zoom in `options.transform.scale` and leave the context's transform for the pixel ratio.
- `x` and `y` only move the finished strokes. Painting the same lines with the same scale and seed at two offsets gives the same strokes, so neighbouring tiles join up.
- The context can be a `CanvasRenderingContext2D` or an `OffscreenCanvasRenderingContext2D`.

### Width per line and along a line

*Since 0.3.0.* A line can set its own brush width with `width`, and a width at its end with `widthEnd`, so roads of different widths go in one call and a river can widen towards the sea:

```ts
const river: SvgLine = { ...riverGeometry, color: '#2a6f97', seed: 'river-3', width: 3, widthEnd: 14 };
const road: SvgLine = { ...roadGeometry, color: '#7a5c3a', seed: 'road-1', width: 5 };
paintLines(context, [river, road], { size: 8, transform: { scale: 2 } }); // other lines use size 8
```

- `width` takes the place of `size` for that line, and follows the same rule: it is in canvas pixels and is **not** multiplied by `transform.scale` (or by `planLines`' `scale`). A line with `width: 6` paints exactly like the same line without it in a call with `size: 6`. To make a width follow the zoom, multiply it by the zoom yourself.
- With `widthEnd`, the width changes linearly with the distance along the line, from `width` (or `size` when `width` is not set) at the first point as given to `widthEnd` at the last, whichever way the hand then paints it. The touch-down and lift-off tapers still apply on top, each as long as the brush is wide at its end.
- A line of width 0 paints nothing. A negative width, `NaN` or `Infinity` throws a `RangeError`.
- The bristles spread with the width. With `lodBristleSpacing` or `lodSingleStroke` on, a narrow line gets fewer bristles or a single stroke, measured by its own width (its widest, for a line that changes width).

## Parsing without painting

`parseSvg(text)` turns SVG text into lines without painting them. Use it to parse once and keep the geometry, for example to store it in your own format. It needs no DOM, so it also runs in Node and in web workers (*since 0.3.0*; before that it needed a `DOMParser`).

```ts
import { parseSvg, type ParsedSvg } from 'brushstroke';

const parsed: ParsedSvg = parseSvg(svgText);
// { width: 120, height: 80, lines: [{ start, segments, closed, color }, …] }
```

The result is plain data that can be stored as JSON:

| Type | Fields |
|------|--------|
| `ParsedSvg` | `width` and `height` of the SVG in CSS pixels, and `lines` in document order. |
| `SvgLine` | One continuous line: `start` (a `Point`), `segments`, `closed`, `color`, and an optional `seed`. *Since 0.3.0* also an optional `width` and `widthEnd` (see above); `parseSvg` does not set them. |
| `Segment` | `{ kind: 'line', to }` or `{ kind: 'cubic', c1, c2, to }`. Arcs and quadratic curves are converted to cubics. |
| `Point` | `{ x, y }`. |

A line's `seed` (a string or a number) keeps its variations stable when other lines are added or removed. `parseSvg` sets it from the element's `id`; later subpaths of the same element get `id/1`, `id/2` and so on.

Transforms and the viewBox are already applied, so coordinates are in the SVG's CSS pixels.

### Reading SVG text without a DOM

*Since 0.3.0.* brushstroke reads SVG text with its own small XML reader, in every environment. It checks that the text is well-formed XML (matching tags, quoted and unique attributes, known entities) and throws `brushstroke: the text is not a valid SVG document: …` otherwise. Entities declared in the DOCTYPE, as Illustrator writes them, are replaced one level deep; external entities are never loaded. `<style>` sheets and CSS classes are not read, only attributes and `style="…"`.

The two steps are also exported, for callers that already hold an element tree, for example from their own XML parser:

```ts
import { parseSvgText, parseSvgTree, parseSvgDrawingTree, type SvgNode } from 'brushstroke';

const root: SvgNode = parseSvgText(svgText); // { name: 'svg', attributes: { … }, children: [ … ] }
const lines = parseSvgTree(root);            // the same as parseSvg(svgText)
const drawing = parseSvgDrawingTree(root);   // the same as parseSvgDrawing(svgText)
```

An `SvgNode` is `{ name, attributes, children }`. `name` is the element name without a namespace prefix, and `attributes` maps attribute names, prefix included (`xlink:href`), to their values.

## Fills and strokes

`parseSvgDrawing(text)` reads an SVG the way a browser paints it, for callers that draw the shapes themselves. It keeps filled shapes, which `parseSvg` skips. A shape with no paint set is filled black and has no stroke, as in browsers.

```ts
import { parseSvgDrawing } from 'brushstroke';

const drawing = parseSvgDrawing(svgText);
// { width, height, shapes: [{ type: 'fill', subpaths, color, rule, opacity },
//                          { type: 'stroke', subpaths, color, width, opacity, linecap, linejoin }, …] }
```

| Type | Fields |
|------|--------|
| `ParsedSvgDrawing` | `width` and `height` of the SVG in CSS pixels, and `shapes` in paint order. |
| `SvgFill` | `type: 'fill'`, `subpaths` that fill together, `color`, `rule` (`nonzero` or `evenodd`), and `opacity`. |
| `SvgStroke` | `type: 'stroke'`, `subpaths`, `color`, `width` in CSS pixels after transforms, `opacity`, `linecap` (`butt`, `round` or `square`) and `linejoin` (`miter`, `round` or `bevel`). |

An element with both a fill and a stroke gives the fill first.

*Since 0.3.0:*

- `color` is always `#rrggbb`. Named colours, `#rgb`, `#rgba`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()` and `hsla()` are read, with numbers or percentages. (In 0.2.0 it was the text as written, such as `red`.)
- `opacity` is from 0 to 1: the `opacity` of the element and all its groups multiplied together, times `fill-opacity` or `stroke-opacity`, times the colour's own alpha. Shapes with an opacity of 0, such as `fill="transparent"`, are kept. Group opacity is applied to each shape on its own, so shapes that overlap inside a half-transparent group look slightly different than in a browser.
- `linecap` and `linejoin` come from `stroke-linecap` and `stroke-linejoin`, inherited, with the SVG defaults `butt` and `miter`. SVG 2's `miter-clip` and `arcs` are read as `miter`. `stroke-miterlimit` and dashes are not read.
- `currentColor` takes the `color` property where the shape uses it, inherited from its groups, or black when none is set. A colour with alpha in `color` brings that alpha along.
- A colour that cannot be read, such as `var(--c)`, `lab()` or `oklch()`, is ignored as a browser ignores an invalid value: the shape takes its group's paint, or the default (black fill, no stroke). A gradient or pattern, `url(#id)`, uses its fallback colour if it has one, or black.

### Strokes as paintable lines

*Since 0.3.0.* `strokesToLines(drawing, options)` turns the strokes of a drawing into lines for `paintLines`, one per subpath, so an imported SVG can be painted with the brush. Fills are left out.

```ts
import { paintLines, parseSvgDrawing, strokesToLines } from 'brushstroke';

const lines = strokesToLines(parseSvgDrawing(svgText), { seedPrefix: 'castle-', scale: 0.5 });
// [{ start, segments, closed, color: '#2b2b2b', seed: 'castle-0', width: 1.5, opacity: 1 }, …]
paintLines(context, lines, { brush: 'round', size: 6 });
```

| Option | Default | What it does |
|--------|---------|--------------|
| `seedPrefix` | `''` | Put before each line's seed. Seeds are `<prefix><n>` for the first subpath of the n-th stroke and `<prefix><n>/<i>` for later subpaths. Only strokes are counted, so adding a fill does not change how the strokes paint. |
| `scale` | `1` | Multiplies the points and the width. |

Each line also has `width` (the stroke width after `scale`) and `opacity`. `width` is `SvgLine.width`, so `paintLines` paints each line with a brush as wide as its stroke instead of `size`. Like `size`, it is read in canvas pixels and not multiplied by `transform.scale`, so to paint at the SVG's stroke widths put the zoom in this function's `scale` and leave the transform's at 1. To paint with `size` instead, drop the field: `lines.map(({ width, ...line }) => line)`. `paintLines` ignores `opacity`.

### Colours

*Since 0.3.0.* `parseColor(text)` reads a CSS colour the same way: `parseColor('rgba(0, 128, 255, 40%)')` gives `{ hex: '#0080ff', alpha: 0.4 }`. It returns `undefined` for `currentColor`, `none`, `url(…)` and colours it cannot read.

## Geometry helpers

*Since 0.3.0.* Plain functions on points, with no canvas, for callers that turn drawings into their own geometry. A `Point` is `{ x, y }`, and every tolerance is in the units of the points.

### flattenSubpath

`flattenSubpath(subpath, tolerance)` turns a subpath into points. No point of the curve is farther than `tolerance` from the result, so gentle curves get few points and tight ones many. A closed subpath gives a ring, without repeating the first point.

```ts
import { flattenSubpath, parseSvgDrawing } from 'brushstroke';

const { shapes } = parseSvgDrawing(svgText);
const rings = shapes[0]!.subpaths.map((s) => flattenSubpath(s, 0.25));
```

### simplify

`simplify(points, tolerance, closed = false)` drops points with Ramer–Douglas–Peucker, keeping every dropped point within `tolerance` of the result. An open line keeps its first and last points. With `closed`, the points are a ring (a repeated first point at the end is dropped), the first point is always kept, and a ring that collapses to fewer than 3 points gives `[]`. The input is not changed.

```ts
const coast = simplify(flattenSubpath(subpath, 0.1), 0.5);
const island = simplify(ring, 0.5, true);
```

### strokeOutline

`strokeOutline(points, width, options)` gives the area a stroke along the points covers, as one polygon (a list of points, the first not repeated), so a stroke can be turned into a filled shape with a single union instead of one per segment.

```ts
import { simplify, strokeOutline } from 'brushstroke';
import { union } from 'polyclip-ts';

const outline = strokeOutline(simplify(points, width / 20), width, { cap: 'round', join: 'round' });
const rings = union([outline.map((p) => [p.x, p.y])]);
// or draw it: fill a path through the points with the 'nonzero' rule
```

| Option | Default | What it does |
|--------|---------|--------------|
| `join` | `'round'` | `'round'`, `'miter'` or `'bevel'`. |
| `cap` | `'round'` | `'round'`, `'butt'` or `'square'`. A single point gives a circle, a square or nothing, as in SVG. |
| `miterLimit` | `4` | Miters longer than this many widths are bevelled. |
| `closed` | `false` | The last point joins the first, with no caps. |
| `tolerance` | `width / 100` | How far round caps and joins may be from a true circle. |

The polygon is right when filled with the **nonzero** rule, which is what `ctx.fill(path, 'nonzero')` and polyclip-ts use, not with even-odd. It is built as the sum of one rectangle per segment and one wedge per join, all wound the same way, so it can cross itself:

- on the inside of a tight bend, or where points are dense compared with the width, the outline steps back through the corner point. Where the segments are long enough, the two edges are cut where they meet instead, so smooth lines usually give a polygon that does not cross itself;
- where the line crosses or comes back near itself;
- a closed line covers its first segment twice.

One union resolves all of these into clean rings. Simplifying the points first, by about a twentieth of the width, keeps the polygon small and the union fast. Making the outline of 300 points takes about 1 ms; on a smooth wiggly line the union then gives one ring, while very tight zigzags, where many round joins overlap, make the union itself slow.

## Line shapes

*Since 0.3.0.* Functions that build or change lines before they are painted. They are plain geometry with no randomness, so the same input always gives the same lines, and each result is painted with the brush like any other line.

### smoothLine and straightLine

`smoothLine(points, { closed, tension })` gives segments for a smooth curve through every point, and `straightLine(points, closed)` gives straight segments, for lines a user can switch between smooth and straight. Use the result as the `segments` of a line that starts at `points[0]`.

```ts
import { smoothLine, straightLine, type SvgLine } from 'brushstroke';

const segments = road.smooth ? smoothLine(road.points) : straightLine(road.points);
const line: SvgLine = { start: road.points[0]!, segments, closed: false, color: '#7a5c3a', seed: road.id };
const lake: SvgLine = { start: shore[0]!, segments: smoothLine(shore, { closed: true }), closed: true, color: '#2a6f97' };
```

- The curve is a **centripetal** Catmull-Rom spline as cubic Bézier segments. Unlike the uniform kind, it makes no loops or cusps where points are unevenly spaced. Tangents are continuous at every point, and the ends of an open line do not bend.
- `closed` adds a segment from the last point back to the first, smooth at the join. A last point that repeats the first is ignored.
- `tension` from 0 (default, Catmull-Rom) to 1 (straight segments) shortens the tangents, so the curve bends more at the points and less between them.
- Points that repeat the one before are skipped. Fewer than 2 distinct points give `[]`.
- `straightLine` with `closed` adds a last segment back to the first point, unless the last point already repeats it.

### dashLine

`dashLine(line, pattern, { offset })` cuts a line into dashes, each its own line, so each dash is painted as a brush stroke with its own touch-down and lift-off.

```ts
import { dashLine, paintLines } from 'brushstroke';

const border = dashLine(borderLine, [12, 6]);         // 12 on, 6 off
const trail = dashLine(trailLine, [0.1, 8]);          // dots
const shifted = dashLine(borderLine, [12, 6], { offset: 4 });
paintLines(context, [...border, ...trail], { size: 4 });
```

- `pattern` alternates dash and gap lengths in the units of the line, like SVG `stroke-dasharray`; an odd pattern is repeated once. `offset` is like `stroke-dashoffset`. An empty pattern, or one of only zeros, returns `[line]`. A negative length throws a `RangeError`.
- Dots are dashes much shorter than the brush is wide, such as `[0.1, gap]`: the brush touches down and lifts at once, leaving a dab. Dashes of length 0 are left out.
- Segments are cut exactly: a cubic is cut into the cubic that runs over the same part of the curve, found numerically to well below a thousandth of a unit. Anchors inside a dash are kept, so a dash can turn a corner.
- On a closed line, a dash that runs over the start point is one dash. The dashes are open lines in order along the line.
- Each dash keeps the line's fields with its own `seed`, `<seed>/d<n>` for the n-th dash from 0, so it keeps its look as long as its place in the pattern does, for example when the line grows at its end. A line without a seed gives dashes without one.
- `width` is kept. With `widthEnd`, each dash gets the widths the line has where it starts and ends (and the line must have `width` too).

### offsetLine and doubleLine

`offsetLine(line, distance, { tolerance, miterLimit })` gives a line parallel to `line`, and `doubleLine(line, gap, options)` gives two, `gap` apart, for double-line roads.

```ts
import { doubleLine, offsetLine } from 'brushstroke';

const [left, right] = doubleLine(highway, 6);  // seeds 'highway-2/L' and 'highway-2/R'
const bank = offsetLine(river, -4);            // 4 units to the left of the direction of travel
```

- A positive `distance` is on the right of the direction of travel on screen, where y points down: a line drawn left to right moves down. `doubleLine` gives the left line first.
- Straight segments, and the corners between them, are exact: the outer side of a corner gets a mitre, or a bevel when the mitre would reach farther than `miterLimit` (default 4) distances from the corner, and the inner side is trimmed where the two offset segments cross.
- A cubic has no exact cubic offset. Each becomes cubics with exact ends and end tangents, split until no checked point is farther than `tolerance` (default a hundredth of the distance) from the true parallel curve.
- Where a curve bends tighter than the distance on the inner side, the true parallel curve has a cusp, and the result makes a small loop there. At a sharp corner next to a curve, the inner side is joined with a short straight segment that can backtrack a little.
- The result keeps the line's fields, `width` and `widthEnd` included. `offsetLine` keeps the `seed`; `doubleLine` gives `<seed>/L` and `<seed>/R`, or none when the line has none.

The functions combine: `doubleLine(line, 6).flatMap((side) => dashLine(side, [10, 5]))` gives a dashed double line.

## Development

```sh
npm install
npm run dev        # demo page
npm test
npm run typecheck
npm run build
```
