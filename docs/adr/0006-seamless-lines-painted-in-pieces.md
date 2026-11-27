# 0006. Seamless lines for pieces painted apart

*2026-11-27*

## Context

The map app (taillefer/map-app, #39) paints contour lines and coasts tile by tile in a worker. A tile only knows the part of a line that crosses it, plus a margin, so neighbouring tiles plan different pieces of the same line, with different starts and ends. ADR 0002 anchored the noise to a scale, but it is still sampled by distance from where the line starts, and a line is split at corners, turned to the hand's direction and tapered at both ends. So two pieces of one line paint differently, and a seam shows at every tile edge. The alternatives were: paint lines over larger blocks of tiles (fewer seams, but not none, and more to repaint per change); paint all visible lines at once whenever the map stops moving (no seams, but the lines change look each time); or give the library a way to paint a piece of a line the same as the whole.

## Decision

We will add an optional `seamless` to `planLines` and `paintLines`. With it, the pressure noise and the wobble are sampled where each point lies, a line is one stroke in the direction it is given, an end outside `bounds` is a cut without taper or pool, and bristles do not run dry along the line. Without it, nothing changes.

## Consequences

A tiled map can paint its lines with no seams, as long as each kind of line keeps one seed and one direction across pieces. Seamless lines lose what depends on a whole stroke: drying along the line, splits at sharp corners and the hand's direction. The caller has to let lines run past the tile so the cut ends fall outside it. A new noise source added later must sample by position when `seamless` is set, or the seams come back.
