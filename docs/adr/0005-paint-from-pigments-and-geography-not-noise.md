# 0005. Paint from pigments and geography, not from noise

*2026-11-23*

## Context

Test users said the blotches and grain of ADR 0003 did not look made by a person. Side by side, the blotches read as a camouflage filter: they crossed coasts and ignored what lay under them. The grain greyed every colour like a noisy photo. In a real painting each unevenness has a cause the eye knows: paint runs out after a few strokes, water is lighter near the shore, strokes follow a coast, and colours from one paint box share an undertone.

## Decision

We will make fills look painted from causes, not from noise. `pigment` mutes colours, lightens them and pulls them towards a shared undertone. `paintWash` with `glaze` lays a fill as a transparent glaze over paper. `paintEdgeGradient` makes water lighter along its shore and land darker along its rim, in line units. `hatchArea` turns strokes near an edge to run along it, and paints each row in loads of paint. Callers name the rings that are real edges, so a map's frame gets no pooled paint or edge strokes. The blotch and grain texture stays in the library but is no longer the default way to texture a fill.

## Consequences

Every variation now follows the map: it stops at edges and stays in place. A map app must tell brushstroke which rings are shores and which ring is its frame. Values that describe geography, such as the shallow band's width, are in map units and need choosing per map scale. The global texture of ADR 0003 is kept for callers that want it, so `paintWashTexture` is not removed.
