# 0004. Fill strokes per area, on a grid fixed to the line coordinates

*2026-11-23*

## Context

ADR 0003 textured fills with noise in octaves. Round blotches read as paint dabbed on with a sponge, not brushed. A first try laid real brush strokes into the same tileable texture, over the whole map at once. That breaks how painting works: a stroke belongs to one area. It starts and ends where that colour is, and it never crosses into the next area.

## Decision

We will paint fill strokes per area. `hatchArea` lays rows of strokes on a grid fixed to the line coordinates, each with a seed from its row and place, and keeps only the parts inside the area, cut a little before the edge. `contourStrokes` adds strokes that follow the edge just inside it. `paintWashStrokes` paints both in shades of the area's colour, clipped to the area. The global stroke texture is removed.

## Consequences

Strokes never cross an edge, and an area keeps its strokes when a neighbouring area changes, except where the shared edge moved. Strokes cost far more than a texture, so a caller cannot paint them every frame. It must paint them into tiles per zoom step and keep the tiles, as `demo/wash.html` does; a new step takes a few hundred milliseconds to fill in. The blotches and grain of ADR 0003 stay a texture over the whole map.
