import { describe, expect, it } from 'vitest';
import { defaultWashTuning } from '../src/tuning';
import { edgeSteps, noiseTile, octaveMatrix, octaveOffset, pigment, tilePixels, visibleOctaves } from '../src/wash';

const TILE = 128;

/** Where a line point lands in octave k's tile, in tile pixels, for a transform. */
function tileSpot(transform: { scale: number; x: number; y: number }, k: number, point: { x: number; y: number }) {
  const m = octaveMatrix(transform, k, octaveOffset(1, k), TILE);
  const canvas = { x: point.x * transform.scale + transform.x, y: point.y * transform.scale + transform.y };
  const wrap = (v: number) => ((v % TILE) + TILE) % TILE;
  return { u: wrap((canvas.x - m.e) / m.a), v: wrap((canvas.y - m.f) / m.a) };
}

describe('octaveMatrix', () => {
  it('keeps a line point on the same spot of the tile whatever the transform', () => {
    const point = { x: 123456.7, y: 98765.4 };
    const transforms = [
      { scale: 0.01, x: 0, y: 0 },
      { scale: 3.7, x: -455000, y: 12 },
      { scale: 1e-4, x: 300, y: -9 },
      { scale: 2000, x: -2.46e8, y: -1.97e8 },
    ];
    for (const k of [-3, 4, 12]) {
      const spots = transforms.map((t) => tileSpot(t, k, point));
      for (const spot of spots) {
        const du = Math.abs(spot.u - spots[0]!.u);
        const dv = Math.abs(spot.v - spots[0]!.v);
        expect(Math.min(du, TILE - du)).toBeLessThan(1e-3);
        expect(Math.min(dv, TILE - dv)).toBeLessThan(1e-3);
      }
    }
  });

  it('keeps the translation within one tile', () => {
    const m = octaveMatrix({ scale: 50, x: -4.9e8, y: 1.6e8 }, 2, { x: 0.5, y: 1.5 }, TILE);
    for (const v of [m.e, m.f]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4 * 50);
    }
  });

  it('scales the tile to 2^k line units', () => {
    expect(octaveMatrix({ scale: 0.5, x: 0, y: 0 }, 10, { x: 0, y: 0 }, TILE).a).toBeCloseTo((1024 * 0.5) / TILE);
  });
});

describe('visibleOctaves', () => {
  const { wash, grain } = defaultWashTuning;
  const total = (scale: number, layer: { fromPx: number; toPx: number }) => visibleOctaves(scale, layer).reduce((sum, o) => sum + o.weight, 0);

  it('keeps the total weight the same at every scale', () => {
    for (let e = -6; e <= 6; e += 0.137) {
      expect(total(10 ** e, wash)).toBeCloseTo(total(1, wash), 9);
      expect(total(10 ** e, grain)).toBeCloseTo(1, 9);
    }
  });

  it('shows octaves only while their tiles are within the band', () => {
    for (const scale of [0.003, 0.7, 41]) {
      for (const { k } of visibleOctaves(scale, wash)) {
        const px = 2 ** k * scale;
        expect(px).toBeGreaterThan(wash.fromPx);
        expect(px).toBeLessThan(wash.toPx);
      }
    }
  });

  it('cross-fades the grain from a coarser octave to a finer one as the view zooms in', () => {
    const before = new Map(visibleOctaves(3, grain).map((o) => [o.k, o.weight]));
    const after = new Map(visibleOctaves(3.5, grain).map((o) => [o.k, o.weight]));
    expect(before.size).toBe(2);
    const finer = Math.min(...before.keys());
    const coarser = Math.max(...before.keys());
    expect(after.get(finer)!).toBeGreaterThan(before.get(finer)!);
    expect(after.get(coarser)!).toBeLessThan(before.get(coarser)!);
  });

  it('gives nothing for a scale of 0 or an empty band', () => {
    expect(visibleOctaves(0, wash)).toEqual([]);
    expect(visibleOctaves(1, { fromPx: 100, toPx: 100 })).toEqual([]);
  });
});

describe('noiseTile', () => {
  const size = 64;
  const tile = noiseTile(7, size, 4);

  it('is the same for the same seed and different for another', () => {
    expect(noiseTile(7, size, 4)).toEqual(tile);
    expect(noiseTile(8, size, 4)).not.toEqual(tile);
  });

  it('stays within -1 and 1 and uses the range', () => {
    const values = Array.from(tile);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(1);
  });

  it('wraps without a seam', () => {
    let inside = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size - 1; x++) inside = Math.max(inside, Math.abs(tile[y * size + x + 1]! - tile[y * size + x]!));
    for (let y = 0; y < size; y++) expect(Math.abs(tile[y * size]! - tile[y * size + size - 1]!)).toBeLessThanOrEqual(inside + 1e-6);
    for (let x = 0; x < size; x++) expect(Math.abs(tile[x]! - tile[(size - 1) * size + x]!)).toBeLessThanOrEqual(inside + 1e-6);
  });
});

describe('tilePixels', () => {
  const layer = { ink: [10, 20, 30, 0.5] as [number, number, number, number], paper: [250, 240, 230, 0.4] as [number, number, number, number], missed: -0.6, missedRim: 0.12 };

  it('darkens above 0 and lightens below, more the further from 0', () => {
    const px = tilePixels(Float32Array.from([0.2, 1, -0.2, -0.4, 0]), layer);
    expect(Array.from(px.slice(0, 3))).toEqual([10, 20, 30]);
    expect(px[3]!).toBeLessThan(px[7]!);
    expect(Array.from(px.slice(8, 11))).toEqual([250, 240, 230]);
    expect(px[11]!).toBeLessThan(px[15]!);
    expect(px[19]).toBe(0);
  });

  it('shows the paper strongly where the brush missed', () => {
    const px = tilePixels(Float32Array.from([-0.45, -0.9]), layer);
    expect(px[7]!).toBeGreaterThan(px[3]!);
    expect(px[7]!).toBeGreaterThanOrEqual(Math.round(255 * 0.4 * 0.9));
  });

  it('has no missed spots when missed is 1', () => {
    const px = tilePixels(Float32Array.from([-0.95]), { ...layer, missed: 1 });
    expect(px[3]).toBe(Math.round(255 * 0.4 * 0.95));
  });
});

describe('octaveOffset', () => {
  it('gives each seed and octave its own place in the noise, the same every time', () => {
    expect(octaveOffset(3, 5)).toEqual(octaveOffset(3, 5));
    expect(octaveOffset(3, 5)).not.toEqual(octaveOffset(3, 6));
    expect(octaveOffset(3, 5)).not.toEqual(octaveOffset(4, 5));
    const o = octaveOffset(3, 5);
    expect(o.x).toBeGreaterThanOrEqual(0);
    expect(o.x).toBeLessThan(32);
  });
});

describe('edgeSteps', () => {
  /** Stacked opacity at a distance from the edge. */
  const opacityAt = (steps: { reach: number; alpha: number }[], distance: number) =>
    1 - steps.filter((s) => s.reach > distance).reduce((rest, s) => rest * (1 - s.alpha), 1);
  const edge = { width: 12, alpha: 0.2, falloff: 2.5, steps: 10 };

  it('stacks up to the falloff curve in the middle of every step', () => {
    const steps = edgeSteps(edge);
    for (let i = 0; i < edge.steps; i++) {
      const d = ((i + 0.5) / edge.steps) * edge.width;
      expect(opacityAt(steps, d)).toBeCloseTo(edge.alpha * (1 - d / edge.width) ** edge.falloff, 9);
    }
  });

  it('is darkest at the edge, fades inward and is gone past the width', () => {
    const steps = edgeSteps(edge);
    const profile = [0, 2, 4, 6, 8, 10, 11.9].map((d) => opacityAt(steps, d));
    for (let i = 1; i < profile.length; i++) expect(profile[i]!).toBeLessThan(profile[i - 1]!);
    expect(opacityAt(steps, 12)).toBe(0);
    expect(Math.max(...steps.map((s) => s.reach))).toBe(12);
  });

  it('fades evenly with a falloff of 1', () => {
    const steps = edgeSteps({ ...edge, falloff: 1, steps: 4 });
    expect(opacityAt(steps, 1.5)).toBeCloseTo(0.2 * (1 - 1.5 / 12), 9);
    expect(opacityAt(steps, 7.5)).toBeCloseTo(0.2 * (1 - 7.5 / 12), 9);
  });

  it('paints nothing with no width or no opacity', () => {
    expect(edgeSteps({ ...edge, width: 0 })).toEqual([]);
    expect(edgeSteps({ ...edge, alpha: 0 })).toEqual([]);
  });
});


describe('pigment', () => {
  const sat = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
  };

  it('mutes, lightens and pulls colours towards one undertone', () => {
    const settings = defaultWashTuning.pigment;
    for (const color of ['#2f7fd1', '#5cbf4a', '#ff0000']) {
      const p = pigment(color, settings);
      expect(p).toMatch(/^#[0-9a-f]{6}$/);
      expect(sat(p)).toBeLessThan(sat(color));
    }
    // Two very different colours end up closer together.
    const gap = (a: string, b: string) => [1, 3, 5].reduce((sum, i) => sum + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0);
    expect(gap(pigment('#2f7fd1', settings), pigment('#5cbf4a', settings))).toBeLessThan(gap('#2f7fd1', '#5cbf4a'));
  });

  it('leaves a colour as it is with every setting at 0', () => {
    expect(pigment('#2f7fd1', { mute: 0, lighten: 0, undertone: [0, 0, 0], undertoneAmount: 0 })).toBe('#2f7fd1');
  });
});
