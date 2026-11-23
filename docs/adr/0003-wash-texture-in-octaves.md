# 0003. Fills as a wash, textured in octaves of the line coordinates

*2026-11-23*

## Context

brushstroke painted only lines. The map app (taillefer/map-app, ADR 0011) also needs its filled areas to look painted: uneven paint, blotches, spots the brush missed, pooled paint along the edge and paper grain. Its view zooms smoothly, so texture laid out in canvas pixels slides over the map (ADR 0002 has the same problem for lines). The alternatives were to keep fills in the app, to fill areas with brush strokes (expensive for large areas, and every stroke repaints when an area is clipped), or to paint a wash whose texture is noise laid out in the caller's coordinates.

## Decision

We will add `paintWash` (fill, pooled edge and texture inside one area) and `paintWashTexture` (the texture alone, over the current clip, so a map can texture all its areas in one go). The texture is small tileable noise images drawn as canvas patterns, one per octave of 2^k line units. Each octave's opacity depends only on its size on the canvas: it fades in over one octave above `fromPx` and out over one octave below `toPx`, so a band of whole octaves keeps its strength at every scale. Blotches use a wide band; paper grain uses a band of two octaves, which is a cross-fade between zoom steps. The look lives in `WashTuning` in `src/tuning.ts`, chosen on `demo/wash.html`.

## Consequences

Nothing in a wash slides while the view pans or zooms, and finer blotches appear as it zooms in. The cost per call is a few pattern fills, whatever the area's size. The library now needs a canvas to make its tiles (`OffscreenCanvas` or the DOM); the pure parts (`noiseTile`, `tilePixels`, `visibleOctaves`, `octaveMatrix`) still run in Node and are tested there. Tileable noise repeats; only large tiles and overlapping octaves hide it. The edge is in canvas pixels and is not noise, so it does not slide either. Brush-stroke fills (hatching) remain a separate, later step.
