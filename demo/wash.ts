import {
  defaultWashTuning,
  paintLines,
  paintEdgeGradient,
  paintWash,
  paintWashStrokes,
  pigment,
  paintWashTexture,
  smoothLine,
  visibleOctaves,
  type LineTransform,
  type Point,
  type SvgLine,
  type WashColor,
  type WashTuning,
} from '../src/index';

// ── The map ─────────────────────────────────────────────────────────────────
// A small world in map units, painted the way a map app would: each area's
// fill and edge on its own, then its brush strokes (from cached tiles), then
// the texture once over the whole map. Areas do not overlap: like terrain in
// the map app, each one is cut out of the area around it.

const WORLD = { width: 1000, height: 700 };
const COLORS = { sea: '#2f7fd1', field: '#5cbf4a', forest: '#2e8b3d', mountain: '#9a8f84', coast: '#3a3226' };

/** A blob-shaped ring: a circle bent by a few fixed waves. */
function blob(cx: number, cy: number, radius: number, waves: [number, number, number][], points = 160): Point[] {
  return Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const r = radius * (1 + waves.reduce((sum, [n, amp, phase]) => sum + amp * Math.sin(n * a + phase), 0));
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

const island = blob(480, 360, 240, [[2, 0.12, 0.4], [3, 0.1, 1.9], [5, 0.05, 0.3], [9, 0.025, 2.2], [17, 0.012, 1]]);
const lake = blob(545, 265, 34, [[2, 0.2, 1], [3, 0.08, 0.2]], 60);
const forest = blob(390, 300, 95, [[2, 0.2, 0.7], [3, 0.12, 2.5], [7, 0.04, 0.1]]);
const mountain = blob(590, 450, 80, [[2, 0.15, 2], [4, 0.1, 0.5], [6, 0.05, 1.2]]);
/** `shore` are the rings the depth gradient follows: real shores and borders, not the map's own edge. */
const frame: Point[] = [{ x: 0, y: 0 }, { x: WORLD.width, y: 0 }, { x: WORLD.width, y: WORLD.height }, { x: 0, y: WORLD.height }];
const areaList: { rings: Point[][]; color: string; seed: string; water: boolean; shore: Point[][] }[] = [
  { rings: [frame, island], color: COLORS.sea, seed: 'sea', water: true, shore: [island] },
  { rings: [island, forest, mountain, lake], color: COLORS.field, seed: 'field', water: false, shore: [island, lake] },
  { rings: [forest], color: COLORS.forest, seed: 'forest', water: false, shore: [forest] },
  { rings: [mountain], color: COLORS.mountain, seed: 'mountain', water: false, shore: [mountain] },
  { rings: [lake], color: COLORS.sea, seed: 'lake', water: true, shore: [lake] },
];
/** `edges` are an area's real edges: every ring but the map's frame, which gets no pooled paint or edge strokes. */
const areas = areaList.map((area) => ({ ...area, edges: area.rings.filter((ring) => ring !== frame) }));

/** The colour an area is painted in: its own, or as a pigment. */
const areaColor = (area: { color: string }) => (state.show.palette ? pigment(area.color, state.tuning.pigment) : area.color);
const rgbHex = (c: readonly number[]) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The stroke settings with the step-2 parts that are switched off set to nothing. */
function strokeTuning(): WashTuning {
  const { tuning, show } = state;
  return { ...tuning, strokes: { ...tuning.strokes, flow: show.flow ? tuning.strokes.flow : 0, load: show.load ? tuning.strokes.load : 0 } };
}
/** Each area's box, to skip it on tiles it does not reach. */
const areaBoxes = areas.map(({ rings }) => {
  const xs = rings[0]!.map((p) => p.x);
  const ys = rings[0]!.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
});
const coastLines: SvgLine[] = [island, lake].map((ring, i) => ({
  start: ring[0]!,
  segments: smoothLine(ring, { closed: true }),
  closed: true,
  color: COLORS.coast,
  seed: `coast-${i}`,
}));
const coastLength = [island, lake].reduce((sum, ring) => sum + ring.reduce((s, p, i) => s + Math.hypot(p.x - ring[(i + 1) % ring.length]!.x, p.y - ring[(i + 1) % ring.length]!.y), 0), 0);
/** Above this many canvas pixels of coast, the lines are left out so panning stays smooth. */
const MAX_LINE_PX = 15000;

// ── State ───────────────────────────────────────────────────────────────────

interface Show {
  palette: boolean;
  glaze: boolean;
  depth: boolean;
  flow: boolean;
  load: boolean;
  fill: boolean;
  edge: boolean;
  wash: boolean;
  strokes: boolean;
  grain: boolean;
  lines: boolean;
  anchorLines: boolean;
  anchorScreen: boolean;
}

interface Saved {
  tuning: WashTuning;
  show: Show;
}

const STORAGE_KEY = 'brushstroke-wash';
const copyTuning = (t: WashTuning): WashTuning => JSON.parse(JSON.stringify(t)) as WashTuning;
const defaultShow: Show = { palette: true, glaze: true, depth: true, flow: true, load: true, fill: true, edge: true, wash: false, strokes: true, grain: false, lines: true, anchorLines: true, anchorScreen: false };
const state: Saved = load() ?? { tuning: copyTuning(defaultWashTuning), show: { ...defaultShow } };

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const context = canvas.getContext('2d')!;
const zoomInput = document.querySelector<HTMLInputElement>('#zoom')!;
const zoomOutput = document.querySelector<HTMLOutputElement>('#zoom-value')!;
const octavesText = document.querySelector<HTMLParagraphElement>('#octaves')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;

/** The map point at the canvas centre, and canvas pixels per map unit. */
const camera = { x: WORLD.width / 2, y: WORLD.height / 2, scale: 1 };
let viewport = { width: 0, height: 0 };

// ── Drawing ─────────────────────────────────────────────────────────────────

let pending = false;
function requestPaint(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    paint();
  });
}

function transform(): Required<LineTransform> {
  return { scale: camera.scale, x: viewport.width / 2 - camera.x * camera.scale, y: viewport.height / 2 - camera.y * camera.scale };
}

function paint(): void {
  const started = performance.now();
  const view = transform();
  const { tuning, show } = state;
  context.save();
  context.fillStyle = '#e9e2d2';
  context.fillRect(0, 0, viewport.width, viewport.height);
  if (show.glaze) {
    // The paper the map is painted on; the glazed fills let it show through.
    context.fillStyle = rgbHex(tuning.paper);
    context.fillRect(view.x, view.y, WORLD.width * view.scale, WORLD.height * view.scale);
  }

  for (const area of areas) {
    paintWash(context, area.rings, areaColor(area), { transform: view, tuning, glaze: show.glaze, edges: area.edges, layers: { fill: show.fill, edge: show.edge, wash: false, grain: false } });
  }
  if (show.depth) {
    for (const area of areas) {
      paintEdgeGradient(context, area.rings, area.shore, area.water ? rgbHex(tuning.paper) : rgbHex(tuning.edgeColor), area.water ? tuning.shallow : tuning.landRim, { transform: view });
    }
  }

  context.save();
  context.beginPath();
  context.rect(view.x, view.y, WORLD.width * view.scale, WORLD.height * view.scale);
  context.clip();
  const strokesNote = show.strokes ? drawStrokeTiles(view, started) : '';

  // The texture once, over the whole map.
  paintWashTexture(context, {
    // Anchored to the screen, the texture stays put while the map moves under it: the effect to avoid.
    transform: show.anchorScreen ? { scale: 1, x: 0, y: 0 } : view,
    seed: 7,
    tuning,
    layers: { wash: show.wash, grain: show.grain },
  });
  context.restore();

  let linesNote = '';
  if (show.lines) {
    if (coastLength * view.scale > MAX_LINE_PX) {
      linesNote = ' · coast lines off at this zoom (too long to paint every frame)';
    } else {
      paintLines(context, coastLines, {
        brush: 'round',
        size: 3.5,
        seed: 1,
        // Fewer bristles and points: the coast is repainted on every frame.
        tuning: { lodBristleSpacing: 0.5, lodPointSpacing: 0.25 },
        transform: view,
        bounds: { x: 0, y: 0, width: viewport.width, height: viewport.height },
        ...(show.anchorLines ? { anchorScale: 2 ** Math.floor(Math.log2(view.scale)) } : {}),
      });
    }
  }
  context.restore();

  const describe = (name: string, layer: { fromPx: number; toPx: number }) =>
    `${name}: ${visibleOctaves(show.anchorScreen ? 1 : view.scale, layer)
      .map((o) => `2^${o.k} (${Math.round(o.weight * 100)}%)`)
      .join(', ')}`;
  octavesText.textContent = `scale ${view.scale.toFixed(3)} px/unit · ${describe('blotches', tuning.wash)} · ${describe('grain', tuning.grain)}${strokesNote} · ${(performance.now() - started).toFixed(1)} ms${linesNote}`;
}

// ── Stroke tiles ────────────────────────────────────────────────────────────
// Brush strokes are too slow to paint every frame. They are painted into
// tiles at zoom steps of 2^level canvas pixels per map unit, kept, and drawn
// scaled while the zoom is between steps. Near the next step, its tiles fade
// in. A tile is TILE_PX pixels at its step's scale.

const TILE_PX = 512;
/** Share of a zoom step over which the next step's tiles fade in. */
const STEP_FADE = 0.35;
/** Tiles kept; the oldest go first. */
const MAX_TILES = 48;
/** Time per frame spent painting new tiles, in ms. Tiles not painted yet come in the next frames. */
const TILE_BUDGET_MS = 12;

const tiles = new Map<string, HTMLCanvasElement>();
let tilesFor = '';

function strokeTile(level: number, i: number, j: number): HTMLCanvasElement {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  const tile = document.createElement('canvas');
  tile.width = tile.height = Math.round(TILE_PX * ratio);
  const g = tile.getContext('2d')!;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  const scale = 2 ** level;
  const world = { x0: (i * TILE_PX) / scale, y0: (j * TILE_PX) / scale, x1: ((i + 1) * TILE_PX) / scale, y1: ((j + 1) * TILE_PX) / scale };
  areas.forEach((area, n) => {
    const box = areaBoxes[n]!;
    if (box.x1 < world.x0 || box.x0 > world.x1 || box.y1 < world.y0 || box.y0 > world.y1) return;
    paintWashStrokes(g, area.rings, areaColor(area), { transform: { scale, x: -i * TILE_PX, y: -j * TILE_PX }, seed: area.seed, tuning: strokeTuning(), edges: area.edges });
  });
  return tile;
}

/** Draws the stroke tiles of the zoom steps that show, painting missing ones within the time budget. */
function drawStrokeTiles(view: Required<LineTransform>, started: number): string {
  const key = JSON.stringify([strokeTuning().strokes, state.show.palette && state.tuning.pigment]);
  if (key !== tilesFor) {
    tiles.clear();
    tilesFor = key;
  }
  const zoom = Math.log2(view.scale);
  const level = Math.floor(zoom);
  const t = zoom - level;
  const next = Math.min(1, Math.max(0, (t - (1 - STEP_FADE)) / STEP_FADE));
  const fadeIn = next * next * (3 - 2 * next);
  let missing = 0;
  const base = context.globalAlpha;
  for (const [stepLevel, weight] of [[level, 1 - fadeIn], [level + 1, fadeIn]] as const) {
    if (weight <= 0) continue;
    const scale = 2 ** stepLevel;
    const size = (TILE_PX / scale) * view.scale;
    const i0 = Math.floor(-view.x / size);
    const j0 = Math.floor(-view.y / size);
    const i1 = Math.floor((viewport.width - view.x) / size);
    const j1 = Math.floor((viewport.height - view.y) / size);
    context.globalAlpha = base * state.tuning.strokes.opacity * weight;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const id = `${stepLevel}:${i}:${j}`;
        let tile = tiles.get(id);
        if (!tile) {
          if (performance.now() - started > TILE_BUDGET_MS) {
            missing++;
            continue;
          }
          tile = strokeTile(stepLevel, i, j);
          if (tiles.size >= MAX_TILES) tiles.delete(tiles.keys().next().value!);
          tiles.set(id, tile);
        }
        // A little overlap hides hairline seams between scaled tiles.
        context.drawImage(tile, view.x + i * size, view.y + j * size, size + 0.5, size + 0.5);
      }
    }
  }
  context.globalAlpha = base;
  if (missing > 0) requestPaint();
  return ` · strokes: step 2^${level}${fadeIn > 0 ? ` → 2^${level + 1} (${Math.round(fadeIn * 100)}%)` : ''}${missing ? ` · painting ${missing} tiles…` : ''}`;
}

function resize(): void {
  const ratio = window.devicePixelRatio || 1;
  viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
  canvas.width = Math.round(viewport.width * ratio);
  canvas.height = Math.round(viewport.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  requestPaint();
}

// ── Camera ──────────────────────────────────────────────────────────────────

const fitScale = () => Math.min(viewport.width / WORLD.width, viewport.height / WORLD.height) * 0.95;

function setZoom(scale: number, at?: Point): void {
  const clamped = Math.min(fitScale() * 2 ** 8, Math.max(fitScale() * 2 ** -2, scale));
  if (at) {
    // Keep the map point under `at` in place.
    const world = { x: camera.x + (at.x - viewport.width / 2) / camera.scale, y: camera.y + (at.y - viewport.height / 2) / camera.scale };
    camera.x = world.x - (at.x - viewport.width / 2) / clamped;
    camera.y = world.y - (at.y - viewport.height / 2) / clamped;
  }
  camera.scale = clamped;
  const steps = Math.log2(clamped / fitScale());
  zoomInput.value = String(steps);
  zoomOutput.value = `×${(2 ** steps).toFixed(2)}`;
  requestPaint();
}

function fit(): void {
  camera.x = WORLD.width / 2;
  camera.y = WORLD.height / 2;
  setZoom(fitScale());
}

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    stopAnimation();
    const rect = canvas.getBoundingClientRect();
    setZoom(camera.scale * Math.exp(-event.deltaY * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  },
  { passive: false },
);

let drag: Point | undefined;
canvas.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  camera.x -= (event.clientX - drag.x) / camera.scale;
  camera.y -= (event.clientY - drag.y) / camera.scale;
  drag = { x: event.clientX, y: event.clientY };
  requestPaint();
});
canvas.addEventListener('pointerup', () => (drag = undefined));
canvas.addEventListener('pointercancel', () => (drag = undefined));

zoomInput.addEventListener('input', () => {
  stopAnimation();
  setZoom(fitScale() * 2 ** Number(zoomInput.value), { x: viewport.width / 2, y: viewport.height / 2 });
});
document.querySelector('#fit')!.addEventListener('click', () => {
  stopAnimation();
  fit();
});

// Zooms in and out by four steps around the current zoom, slowly, to show whether anything slides.
let animation: { base: number; start: number; frame: number } | undefined;
const animateButton = document.querySelector<HTMLButtonElement>('#animate')!;
function stopAnimation(): void {
  if (!animation) return;
  cancelAnimationFrame(animation.frame);
  animation = undefined;
  animateButton.textContent = 'Animate zoom';
}
animateButton.addEventListener('click', () => {
  if (animation) return stopAnimation();
  animateButton.textContent = 'Stop';
  animation = { base: camera.scale, start: performance.now(), frame: 0 };
  const step = (now: number) => {
    if (!animation) return;
    const t = (now - animation.start) / 1000;
    setZoom(animation.base * 2 ** (2 * Math.sin((t / 10) * Math.PI * 2)), { x: viewport.width / 2, y: viewport.height / 2 });
    animation.frame = requestAnimationFrame(step);
  };
  animation.frame = requestAnimationFrame(step);
});

// ── Settings ────────────────────────────────────────────────────────────────

const checkboxes: [string, keyof Show][] = [
  ['#show-palette', 'palette'],
  ['#show-glaze', 'glaze'],
  ['#show-depth', 'depth'],
  ['#show-flow', 'flow'],
  ['#show-load', 'load'],
  ['#show-fill', 'fill'],
  ['#show-edge', 'edge'],
  ['#show-wash', 'wash'],
  ['#show-strokes', 'strokes'],
  ['#show-grain', 'grain'],
  ['#show-lines', 'lines'],
  ['#anchor-lines', 'anchorLines'],
  ['#anchor-screen', 'anchorScreen'],
];
for (const [selector, key] of checkboxes) {
  const box = document.querySelector<HTMLInputElement>(selector)!;
  box.checked = state.show[key];
  box.addEventListener('change', () => {
    state.show[key] = box.checked;
    save();
    requestPaint();
  });
}

interface Slider {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (value: number) => void;
}

const settingsRoot = document.querySelector<HTMLElement>('#settings')!;

function slider(spec: Slider): HTMLElement {
  const row = document.createElement('label');
  row.className = 'slider';
  const name = document.createElement('span');
  name.textContent = spec.label;
  if (spec.hint) name.title = spec.hint;
  const input = document.createElement('input');
  input.type = 'range';
  Object.assign(input, { min: String(spec.min), max: String(spec.max), step: String(spec.step) });
  const value = document.createElement('output');
  const show = () => {
    input.value = String(spec.get());
    value.value = String(Math.round(spec.get() * 1000) / 1000);
  };
  input.addEventListener('input', () => {
    spec.set(Number(input.value));
    value.value = String(Math.round(Number(input.value) * 1000) / 1000);
    changed();
  });
  show();
  row.append(name, input, value);
  return row;
}

const toHex = (c: WashColor | [number, number, number]) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const fromHex = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

function colorRow(label: string, get: () => WashColor | [number, number, number], set: (rgb: [number, number, number]) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'color-row';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = toHex(get());
  input.addEventListener('input', () => {
    set(fromHex(input.value));
    changed();
  });
  row.append(input, document.createTextNode(label));
  return row;
}

function fieldset(title: string, hint: string, children: HTMLElement[]): HTMLElement {
  const set = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  const text = document.createElement('p');
  text.className = 'hint';
  text.textContent = hint;
  set.append(legend, text, ...children);
  return set;
}

function layerControls(key: 'wash' | 'grain', title: string, hint: string, maxCells: number): HTMLElement {
  const layer = () => state.tuning[key];
  const octaves = () => Math.round(Math.log2(layer().toPx / layer().fromPx));
  return fieldset(title, hint, [
    slider({ label: 'Blobs across a tile', min: 2, max: maxCells, step: 1, get: () => layer().cells, set: (v) => (layer().cells = v) }),
    slider({ label: 'Smallest size on screen (px)', hint: 'An octave fades in as its tile grows past this', min: 32, max: 4096, step: 16, get: () => layer().fromPx, set: (v) => { const n = octaves(); layer().fromPx = v; layer().toPx = v * 2 ** n; } }),
    slider({ label: 'Octaves shown at once', hint: 'Whole octaves keep the strength even while zooming', min: 1, max: 8, step: 1, get: octaves, set: (v) => (layer().toPx = layer().fromPx * 2 ** v) }),
    slider({ label: 'Different tiles', min: 1, max: 4, step: 1, get: () => layer().tiles, set: (v) => (layer().tiles = v) }),
    slider({ label: 'Dark: opacity', min: 0, max: 0.6, step: 0.005, get: () => layer().ink[3], set: (v) => (layer().ink[3] = v) }),
    colorRow('Dark: colour', () => layer().ink, (rgb) => (layer().ink = [...rgb, layer().ink[3]])),
    slider({ label: 'Light (paper): opacity', min: 0, max: 0.6, step: 0.005, get: () => layer().paper[3], set: (v) => (layer().paper[3] = v) }),
    colorRow('Light (paper): colour', () => layer().paper, (rgb) => (layer().paper = [...rgb, layer().paper[3]])),
    slider({ label: 'Missed spots: below (1 = none)', min: -1, max: 1, step: 0.01, get: () => layer().missed, set: (v) => (layer().missed = v) }),
    slider({ label: 'Missed spots: soft rim', min: 0.01, max: 0.8, step: 0.01, get: () => layer().missedRim, set: (v) => (layer().missedRim = v) }),
    slider({ label: 'Seed', min: 0, max: 999, step: 1, get: () => layer().seed % 1000, set: (v) => (layer().seed = v) }),
  ]);
}

function strokeControls(): HTMLElement {
  const s = () => state.tuning.strokes;
  const check = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const row = document.createElement('label');
    row.className = 'color-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = get();
    box.addEventListener('change', () => {
      set(box.checked);
      changed();
    });
    row.append(box, document.createTextNode(label));
    return row;
  };
  return fieldset('Brush strokes', 'Strokes inside each area: they start and end inside it and never cross an edge. Sizes are screen pixels at a zoom step; tiles are repainted when you change them.', [
    slider({ label: 'Opacity', min: 0, max: 1, step: 0.01, get: () => s().opacity, set: (v) => (s().opacity = v) }),
    slider({ label: 'Row spacing (px)', min: 4, max: 120, step: 1, get: () => s().spacing, set: (v) => (s().spacing = v) }),
    slider({ label: 'Brush width (px)', min: 2, max: 120, step: 1, get: () => s().width, set: (v) => (s().width = v) }),
    slider({ label: 'Stroke length (px)', min: 10, max: 600, step: 5, get: () => s().length, set: (v) => (s().length = v) }),
    slider({ label: 'Overlap in a row (share)', min: 0, max: 0.8, step: 0.01, get: () => s().overlap, set: (v) => (s().overlap = v) }),
    slider({ label: 'Angle (degrees)', min: -90, max: 90, step: 1, get: () => s().angle, set: (v) => (s().angle = v) }),
    slider({ label: 'Angle jitter (degrees)', min: 0, max: 45, step: 1, get: () => s().angleJitter, set: (v) => (s().angleJitter = v) }),
    slider({ label: 'Bend (share of length)', min: 0, max: 0.4, step: 0.01, get: () => s().bend, set: (v) => (s().bend = v) }),
    slider({ label: 'Stop before the edge (px)', min: 0, max: 60, step: 1, get: () => s().inset, set: (v) => (s().inset = v) }),
    check('Strokes along the edge', () => s().contour, (v) => (s().contour = v)),
    slider({ label: 'Edge strokes: inside the edge (px)', min: 0, max: 60, step: 1, get: () => s().contourInset, set: (v) => (s().contourInset = v) }),
    slider({ label: 'Edge strokes: length (px)', min: 10, max: 600, step: 5, get: () => s().contourLength, set: (v) => (s().contourLength = v) }),
    slider({ label: 'Dries after (share of length)', min: 0.1, max: 3, step: 0.05, get: () => s().dryness, set: (v) => (s().dryness = v) }),
    slider({ label: 'Follow edges: strength', min: 0, max: 1, step: 0.01, get: () => s().flow, set: (v) => (s().flow = v) }),
    slider({ label: 'Follow edges: within (px)', min: 5, max: 300, step: 5, get: () => s().flowDistance, set: (v) => (s().flowDistance = v) }),
    slider({ label: 'Paint load: colour change', min: 0, max: 1, step: 0.01, get: () => s().load, set: (v) => (s().load = v) }),
    slider({ label: 'Paint load: strokes per dip', min: 2, max: 10, step: 1, get: () => s().loadCycle, set: (v) => (s().loadCycle = v) }),
    slider({ label: 'Colour variation', min: 0, max: 0.6, step: 0.01, get: () => s().shade, set: (v) => (s().shade = v) }),
    slider({ label: 'Lighter strokes (share)', min: 0, max: 1, step: 0.01, get: () => s().light, set: (v) => (s().light = v) }),
    colorRow('Darker towards', () => s().ink, (rgb) => (s().ink = rgb)),
    colorRow('Lighter towards', () => s().paper, (rgb) => (s().paper = rgb)),
    check('Flat brush (off: round)', () => s().brush === 'flat', (v) => (s().brush = v ? 'flat' : 'round')),
    slider({ label: 'Seed', min: 0, max: 999, step: 1, get: () => s().seed % 1000, set: (v) => (s().seed = v) }),
  ]);
}

function gradientControls(title: string, hint: string, key: 'shallow' | 'landRim'): HTMLElement {
  const g = () => state.tuning[key];
  return fieldset(title, hint, [
    slider({ label: 'Width (map units)', min: 0, max: 150, step: 1, get: () => g().width, set: (v) => (g().width = v) }),
    slider({ label: 'Strength at the edge', min: 0, max: 1, step: 0.01, get: () => g().amount, set: (v) => (g().amount = v) }),
    slider({ label: 'Falloff', min: 0.3, max: 6, step: 0.1, get: () => g().falloff, set: (v) => (g().falloff = v) }),
  ]);
}

function buildSettings(): void {
  const { tuning } = state;
  settingsRoot.replaceChildren(
    fieldset('Pigment and paper (step 1)', 'Screen colours become paint from one box: less saturated, lighter, sharing an undertone, laid as a glaze over warm paper.', [
      slider({ label: 'Mute saturation', min: 0, max: 1, step: 0.01, get: () => tuning.pigment.mute, set: (v) => (tuning.pigment.mute = v) }),
      slider({ label: 'Lighten (water in the paint)', min: 0, max: 0.6, step: 0.01, get: () => tuning.pigment.lighten, set: (v) => (tuning.pigment.lighten = v) }),
      slider({ label: 'Towards the undertone', min: 0, max: 0.6, step: 0.01, get: () => tuning.pigment.undertoneAmount, set: (v) => (tuning.pigment.undertoneAmount = v) }),
      colorRow('Undertone', () => tuning.pigment.undertone, (rgb) => (tuning.pigment.undertone = rgb)),
      colorRow('Paper', () => tuning.paper, (rgb) => (tuning.paper = rgb)),
      slider({ label: 'Glaze opacity', min: 0.3, max: 1, step: 0.01, get: () => tuning.glaze, set: (v) => (tuning.glaze = v) }),
    ]),
    gradientControls('Shallow water (step 2)', 'Water is lighter near its shore. In map units, so it zooms with the map.', 'shallow'),
    gradientControls('Land rim (step 2)', 'Land is a little darker near its edge and lighter inside.', 'landRim'),
    layerControls('wash', 'Blotches', 'What is on the map: uneven paint in many sizes, anchored to the map. Finer ones fade in as you zoom in.', 64),
    strokeControls(),
    layerControls('grain', 'Grain', 'What it is painted on: about the same size on screen at every zoom, cross-faded between zoom steps.', 512),
    fieldset('Edge', 'Paint pooled along the inside of each area: darkest at the edge, fading inward. In screen pixels.', [
      slider({ label: 'Width (px)', min: 0, max: 60, step: 0.5, get: () => tuning.edge.width, set: (v) => (tuning.edge.width = v) }),
      slider({ label: 'Opacity at the edge', min: 0, max: 0.6, step: 0.005, get: () => tuning.edge.alpha, set: (v) => (tuning.edge.alpha = v) }),
      slider({ label: 'Falloff (1 = even, higher = thin dark rim)', min: 0.3, max: 6, step: 0.1, get: () => tuning.edge.falloff, set: (v) => (tuning.edge.falloff = v) }),
      slider({ label: 'Steps (smoothness)', min: 2, max: 24, step: 1, get: () => tuning.edge.steps, set: (v) => (tuning.edge.steps = v) }),
      colorRow('Colour', () => tuning.edgeColor, (rgb) => (tuning.edgeColor = rgb)),
    ]),
    fieldset('Tiles', 'Larger tiles repeat less but take longer to make.', [
      slider({ label: 'Tile size (px)', min: 128, max: 1024, step: 128, get: () => tuning.tileSize, set: (v) => (tuning.tileSize = v) }),
    ]),
  );
}

let saveTimer = 0;
function changed(): void {
  output.value = JSON.stringify(state.tuning, null, 2);
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 300);
  requestPaint();
}

document.querySelector('#copy')!.addEventListener('click', async () => {
  output.value = JSON.stringify(state.tuning, null, 2);
  output.select();
  try {
    await navigator.clipboard.writeText(output.value);
  } catch {
    // The text is selected in the box, ready to copy by hand.
  }
});
document.querySelector('#reset')!.addEventListener('click', () => {
  state.tuning = copyTuning(defaultWashTuning);
  buildSettings();
  changed();
});

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be off; the page works without it.
  }
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    // Fill in fields added since the settings were saved.
    const tuning = copyTuning(defaultWashTuning);
    const merged = {
      ...tuning,
      ...saved.tuning,
      wash: { ...tuning.wash, ...saved.tuning?.wash },
      grain: { ...tuning.grain, ...saved.tuning?.grain },
      // Strokes saved before they were painted per area used other units; those are dropped.
      strokes: { ...tuning.strokes, ...(saved.tuning?.strokes && 'spacing' in saved.tuning.strokes ? saved.tuning.strokes : {}) },
      edge: { ...tuning.edge, ...saved.tuning?.edge },
      pigment: { ...tuning.pigment, ...saved.tuning?.pigment },
      shallow: { ...tuning.shallow, ...saved.tuning?.shallow },
      landRim: { ...tuning.landRim, ...saved.tuning?.landRim },
    };
    // Settings saved before the edge became a gradient had two bands instead.
    delete (merged as { edges?: unknown }).edges;
    return {
      tuning: merged,
      // Settings saved before step 1 had blotches and grain on; they start off now, as step 1 drops them.
      show: { ...defaultShow, ...saved.show, ...(saved.show && !('palette' in saved.show) ? { wash: false, grain: false } : {}) },
    };
  } catch {
    return null;
  }
}

// ── Start ───────────────────────────────────────────────────────────────────

buildSettings();
output.value = JSON.stringify(state.tuning, null, 2);
new ResizeObserver(resize).observe(canvas);
resize();
fit();
