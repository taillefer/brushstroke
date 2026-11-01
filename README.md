# brushstroke

Paint the lines of an SVG on a canvas as if they were drawn with a brush.

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

## Parsing without painting

`parseSvg(text)` turns SVG text into lines without painting them. It needs a `DOMParser`, so it runs in browsers. Use it to parse once and keep the geometry, for example to store it in your own format.

```ts
import { parseSvg, type ParsedSvg } from 'brushstroke';

const parsed: ParsedSvg = parseSvg(svgText);
// { width: 120, height: 80, lines: [{ start, segments, closed, color }, …] }
```

The result is plain data that can be stored as JSON:

| Type | Fields |
|------|--------|
| `ParsedSvg` | `width` and `height` of the SVG in CSS pixels, and `lines` in document order. |
| `SvgLine` | One continuous line: `start` (a `Point`), `segments`, `closed`, `color`, and an optional `seed`. |
| `Segment` | `{ kind: 'line', to }` or `{ kind: 'cubic', c1, c2, to }`. Arcs and quadratic curves are converted to cubics. |
| `Point` | `{ x, y }`. |

A line's `seed` (a string or a number) keeps its variations stable when other lines are added or removed. `parseSvg` sets it from the element's `id`; later subpaths of the same element get `id/1`, `id/2` and so on.

Transforms and the viewBox are already applied, so coordinates are in the SVG's CSS pixels.

## Development

```sh
npm install
npm run dev        # demo page
npm test
npm run typecheck
npm run build
```
