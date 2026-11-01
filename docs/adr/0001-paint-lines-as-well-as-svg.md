# 0001. Paint lines as well as SVG files

*2026-11-01*

## Context

brushstroke was planned with one public function: `paintSvg` takes an SVG and returns a new canvas. The map app (taillefer/map-app, ADR 0007) needs to paint coastlines, rivers and roads it already holds as geometry, onto map tiles it has created itself, at several zoom levels. With only `paintSvg`, it would have to write its geometry out as SVG text, parse it back, and copy each painted canvas onto its tiles. The alternatives were to keep the one function and let callers build SVG text, to add options to `paintSvg` for an existing context and a transform, or to add a second, lower-level function.

## Decision

We will offer two levels: `paintLines(context, lines, options)` paints lines onto an existing 2D context, and `paintSvg` stays as the wrapper that loads, parses and creates the canvas. We rejected building SVG text because it adds a round trip that loses nothing but costs time on every repaint. We rejected more `paintSvg` options because a function that takes either a source or lines, and either creates a canvas or draws on one, is harder to explain than two functions.

## Consequences

brushstroke becomes a brush renderer for any geometry, with SVG as one way in, so charts, diagrams and games can use it too. The line format (`SvgLine` and its `Segment`s) is now public, so changing it is a breaking change. Two rules follow and must hold for both functions: scaling applies to the geometry, so brush size, wobble and grain stay in output pixels, and an offset only moves finished strokes, so tiles painted separately join up.
