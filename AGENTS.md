# AGENTS.md

## What is this

`brushstroke` is a small browser library. It takes an SVG and paints its lines on a canvas as if drawn with a real brush. The look depends on the brush type (flat or round), the brush size, and the painter's hand (left or right). Pressure along each line is calculated automatically. A small seeded randomness makes it look handmade, and the seed defaults to a hash of the SVG text, so the same SVG always paints the same way.

Only lines are painted. Elements that have a fill and no stroke are skipped. There is no animation, and no PNG input.

## Stack

| Piece | Choice |
|-------|--------|
| Language | TypeScript, ES modules |
| Build | Vite library mode (`dist/brushstroke.js`) plus `tsc` for type declarations |
| Tests | Vitest, in Node. Parsing needs no DOM; only `test/xmlDomParity.test.ts` uses `// @vitest-environment happy-dom` to compare with `DOMParser` |
| Runtime dependencies | None. Keep it that way |

## How it works

The pipeline runs in this order. Every step before drawing is a plain function with no canvas, so it can be tested in Node.

0. Optionally, the caller shapes its lines first with the line shape functions: `smoothLine` and `straightLine` (`src/geometry/smoothLine.ts`) build segments from points, `dashLine` (`src/geometry/dash.ts`) cuts a line into dashes, and `offsetLine` and `doubleLine` (`src/geometry/offset.ts`) make parallel lines. They return ordinary `SvgLine`s with derived seeds (`<seed>/d<n>`, `<seed>/L`, `<seed>/R`), so each piece goes through the steps below as its own line. They are exact geometry with no randomness; the shared Bézier helpers (point, tangent, cut, arc length) are in `src/geometry/bezier.ts`.
1. Parse the SVG text into lines with their stroke colour (`src/parse/`).
2. Flatten each line into points about 1 px apart, and mark anchors and corners (`src/geometry/flatten.ts`). A line with its own `width` is planned with that as the brush size (`lineWidth` in `src/plan.ts`); one with `widthEnd` also gets a `width` on every point, interpolated by distance along the line as given, which the later steps carry along (split overshoots copy it).
3. Split each line into separate strokes at sharp corners (`src/geometry/split.ts`). From here on, each piece is its own stroke with its own forked randomness.
4. Orient each stroke for the painter's hand (`src/hand.ts`).
5. Add hand wobble: a small sideways drift (`src/wobble.ts`).
6. Give each point a pressure (`src/pressure.ts`). The tapers use the point width at each end when there is one.
7. Turn each stroke into bristle paths, with paint pooling, dryness and paper grain (`src/brush/`). With point widths, the bristles are laid out for the line's widest width, their offsets scale with each point's width, and their paths vary in width (`varies`).
8. Draw the bristle paths on a canvas (`src/render.ts`).

The public API has two levels (see `docs/adr/0001-paint-lines-as-well-as-svg.md`). `paintLines` (`src/paintLines.ts`) paints lines the caller already holds onto an existing context: steps 2–8. `paintSvg` (`src/paintSvg.ts`) loads and parses an SVG, then sizes and clears a canvas and runs the same steps.

`paintLines` is `planLines` followed by `drawPlan`, and both are public for callers that repaint often (a map that pans, tiles cached per zoom step):

- `planLines(lines, { seed, scale, bounds, ...brush })` in `src/plan.ts` runs steps 2–7 and returns a `StrokePlan` (`src/strokePlan.ts`): plain data, so it can be cached or built in a Worker. All points sit in one `Float64Array` (x, y), each piece's opacity step in one `Uint8Array`, and every path has its colour, width, start, count and bounding box; the plan has a box too. `bounds` skips whole lines that cannot paint inside it; lines are never cut, because cutting would change their tapering.
- `drawPlan(context, plan, { offset, scale, clip })` in `src/render.ts` does step 8. `scale` multiplies coordinates and line widths, so a plan can be reused at a nearby zoom; for big zoom changes, plan again. `clip` skips paths whose box is outside it. It only sets canvas state that changes.
- `planStrokes` in `src/plan.ts` is the shared planning loop. It hands bristle points to a `BristleSink` (`src/strokePlan.ts`), so the hot loop builds no objects per point. `paintSvg` uses it through `planPainting` and `drawPainting`.

Level of detail is opt-in through three `Tuning` fields that are off at 0: `lodBristleSpacing` (fewer bristles on a small brush), `lodSingleStroke` (below this brush width, one stroke of varying width) and `lodPointSpacing` (points spaced by a share of the brush width). With them off, the output is unchanged.

`test/callLog.test.ts` is the safety net for speed work: it checks the canvas calls `paintLines` makes against fixtures in `test/fixtures/calls/`, recorded before any optimisation. It compares what each `stroke()` paints with its full state, so skipping a redundant state change passes and anything that changes pixels fails. Do not regenerate the fixtures to make a speed-up pass.

Scaling is applied to the geometry before step 2, never to the canvas, so every look number stays in output pixels. The one exception is `anchorScale` (`docs/adr/0002-anchor-noise-to-a-scale.md`): when set, the noise along lines (pressure, wobble bends, dry gaps) and the paper grain are sampled at line coordinates × `anchorScale` instead of plan pixels, through a ratio `anchorScale / scale` that `planStrokes` hands to the noise functions and, as `BrushOptions.noiseRatio`, to the brush. With it unset the ratio is 1 and every expression is the one it was, so the call-log fixtures stay valid. A line's `width` and `widthEnd` follow the same rule as `size`: output pixels, not scaled. Lines without them must plan exactly as before (the call-log fixtures check this). An offset is applied only when drawing, so it moves finished strokes without changing them. The paper grain belongs to the whole painting, not to one stroke, so it stays in place across strokes.

Two rules hold across the code:

- All randomness comes from `src/random.ts`, seeded. Never use `Math.random`.
- Every number that shapes the look lives in the `Tuning` object in `src/tuning.ts`. Do not add look-related constants anywhere else. `demo/tune.html` is where `defaultTuning` gets chosen.

## Directory index

| Path | What's there |
|------|-------------|
| `src/index.ts` | Public exports |
| `src/` | Library code, one folder or file per pipeline step (see above) |
| `test/` | Vitest unit tests, `*.test.ts` |
| `demo/` | `index.html` (demo page) and `tune.html` (tuning page), served by `npm run dev` |

## Commands

| What | Command |
|------|---------|
| Dev server with the demo page | `npm run dev` |
| Unit tests | `npm test` |
| Type check | `npm run typecheck` |
| Build `dist/` | `npm run build` |

Work is tracked as GitHub issues on the "brushstroke v1" project board.
