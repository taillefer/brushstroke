// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSource } from '../src/paintSvg';
import { parseSvg } from '../src/parse/svg';
import { planPainting } from '../src/plan';
import { resolveSeed } from '../src/random';
import { resolveTuning } from '../src/tuning';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M10 10 C40 80 60 80 90 10" stroke="teal"/>
  <circle cx="50" cy="50" r="20"/>
</svg>`;

/** Steps 1–5 of the pipeline, as paintSvg runs them. */
const plan = (text: string, seed?: number) =>
  planPainting(parseSvg(text), resolveSeed(text, seed), 200, { brush: 'flat', size: 12, hand: 'right' }, resolveTuning());

describe('planPainting', () => {
  it('gives identical bristle paths for the same SVG text', () => {
    expect(plan(SVG)).toEqual(plan(SVG));
  });

  it('gives different bristle paths when the SVG text changes', () => {
    expect(plan(SVG.replace('r="20"', 'r="21"')).paths[0]).not.toEqual(plan(SVG).paths[0]);
    // Even a change that leaves the geometry alone changes the randomness.
    expect(plan(SVG.replace('<circle', '<circle id="c"')).paths[0]).not.toEqual(plan(SVG).paths[0]);
  });

  it('uses an explicit seed instead of the hash', () => {
    expect(plan(SVG, 42)).toEqual(plan(SVG.replace('<circle', '<circle id="c"'), 42));
    expect(plan(SVG, 42)).not.toEqual(plan(SVG));
  });

  it('scales the SVG to the output width and keeps its proportions', () => {
    const result = plan(SVG);
    expect([result.width, result.height]).toEqual([200, 200]);
    const xs = result.paths.flatMap((p) => p.points.map((point) => point.x));
    expect(Math.max(...xs)).toBeGreaterThan(150);
  });
});

describe('readSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns SVG text as it is', async () => {
    expect(await readSource(SVG)).toBe(SVG);
  });

  it('fetches a URL, given as a string or a URL object', async () => {
    const fetch = vi.fn(async () => new Response(SVG, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await readSource('/logo.svg')).toBe(SVG);
    expect(await readSource(new URL('https://example.com/logo.svg'))).toBe(SVG);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws when the URL cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(readSource('/missing.svg')).rejects.toThrow(/could not load \/missing.svg \(404\)/);
  });

  it('serialises an <svg> element', async () => {
    const holder = document.createElement('div');
    holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10"/></svg>';
    const text = await readSource(holder.firstElementChild as SVGSVGElement);
    expect(parseSvg(text).lines).toHaveLength(1);
  });
});
