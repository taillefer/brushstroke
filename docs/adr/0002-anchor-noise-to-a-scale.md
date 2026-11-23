# 0002. Anchor the brush's noise to a scale the caller chooses

*2026-11-23*

## Context

ADR 0001 made every look number hold in output pixels: scaling moves the geometry, never the brush. For one painting that is right. The map app (taillefer/map-app, ADR 0011) zooms smoothly and repaints its lines at every scale. Because the pressure noise, the wobble, the dry gaps and the paper grain are sampled by distance in output pixels, a dry patch that is 60 px from the start of a coast stays 60 px from it at every zoom, so it slides along the coast while the user pinches. The texture "boils".

The alternatives were: keep the rule and let the app only paint at a few fixed scales (the texture still jumps at every one, and the app cannot reuse a plan between them without scaling the brush too); express every length in `Tuning` in line units (the brush would grow with the zoom, which is what ADR 0001 rejected); or let the caller name the scale at which the noise is laid out.

## Decision

We will add an optional `anchorScale` to `planLines` and `paintLines`. The noise along a line and the paper grain are sampled at line coordinates × `anchorScale`; their sizes in `Tuning` hold at that scale. The brush size, the wobble's reach, tapers and pools stay in output pixels. Unset, it equals the plan's scale and nothing changes.

## Consequences

A map can hold `anchorScale` at its current zoom step, so the texture stays in place within a step and stays roughly the tuned size on screen. At a step change it still changes, and the caller cross-fades. The rule of ADR 0001 now has one stated exception. The ratio has to reach every noise source (pressure, wobble, dryness, grain); a new noise source must use it too, or it will slide again.
