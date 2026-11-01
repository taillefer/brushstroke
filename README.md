# brushstroke

Paint the lines of an SVG on a canvas as if they were drawn with a brush.

> Work in progress. The API below is the target for v1 and is not implemented yet.

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

Only lines are painted: `path`, `line`, `polyline`, `polygon`, `rect`, `circle` and `ellipse`. Shapes that have a fill and no stroke are skipped. Each line uses its stroke colour, or black.

## Development

```sh
npm install
npm run dev        # demo page
npm test
npm run typecheck
npm run build
```
