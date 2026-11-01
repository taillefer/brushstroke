# AGENTS.md

## What is this

`brushstroke` is a small browser library. It takes an SVG and paints its lines on a canvas as if drawn with a real brush. The look depends on the brush type (flat or round), the brush size, and the painter's hand (left or right). Pressure along each line is calculated automatically. A small seeded randomness makes it look handmade, and the seed defaults to a hash of the SVG text, so the same SVG always paints the same way.

Only lines are painted. Elements that have a fill and no stroke are skipped. There is no animation, and no PNG input.

## Stack

| Piece | Choice |
|-------|--------|
| Language | TypeScript, ES modules |
| Build | Vite library mode (`dist/brushstroke.js`) plus `tsc` for type declarations |
| Tests | Vitest, in Node. Tests that need `DOMParser` use `// @vitest-environment happy-dom` |
| Runtime dependencies | None. Keep it that way |

## How it works

The pipeline runs in this order. Every step before drawing is a plain function with no canvas, so it can be tested in Node.

1. Parse the SVG text into lines with their stroke colour (`src/parse/`).
2. Flatten each line into points about 1 px apart, and mark anchors and corners (`src/geometry/flatten.ts`).
3. Split each line into separate strokes at sharp corners (`src/geometry/split.ts`). From here on, each piece is its own stroke with its own forked randomness.
4. Orient each stroke for the painter's hand (`src/hand.ts`).
5. Add hand wobble: a small sideways drift (`src/wobble.ts`).
6. Give each point a pressure (`src/pressure.ts`).
7. Turn each stroke into bristle paths, with paint pooling, dryness and paper grain (`src/brush/`).
8. Draw the bristle paths on a canvas (`src/render.ts`).

`src/plan.ts` runs steps 1–7 and `src/paintSvg.ts` adds loading and drawing. The paper grain belongs to the whole painting, not to one stroke, so it stays in place across strokes.

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
