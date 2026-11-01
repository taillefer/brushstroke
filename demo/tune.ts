import { defaultTuning, paintSvg, tuningRanges, type BrushKind, type Hand, type Tuning } from '../src/index';
import { createRandom } from '../src/random';
import { exampleFiles, LINE_SVG } from './examples';

interface PanelConfig {
  brush: BrushKind;
  hand: Hand;
  size: number;
  /** Null means the default: a hash of the SVG text. */
  seed: number | null;
  tuning: Tuning;
}

interface Saved {
  choice: string;
  pasted: string;
  width: number;
  variation: number;
  panels: PanelConfig[];
}

const STORAGE_KEY = 'brushstroke-tuning';
const PASTE_CHOICE = 'paste';
const LINE_CHOICE = 'line';
const fields = Object.keys(defaultTuning) as (keyof Tuning)[];

const defaultPanel = (): PanelConfig => ({ brush: 'flat', hand: 'right', size: 12, seed: null, tuning: { ...defaultTuning } });

const state: Saved = load() ?? {
  choice: exampleFiles[0]!.url,
  pasted: '',
  width: 520,
  variation: 10,
  panels: [defaultPanel(), defaultPanel(), defaultPanel(), defaultPanel()],
};

// Variations use their own seeded generator, seeded from the clock so every click differs.
const variationRandom = createRandom(Date.now());

const choiceSelect = document.querySelector<HTMLSelectElement>('#svg-choice')!;
const pasteArea = document.querySelector<HTMLTextAreaElement>('#svg-text')!;
const widthInput = document.querySelector<HTMLInputElement>('#width')!;
const variationInput = document.querySelector<HTMLInputElement>('#variation')!;
const variationOutput = document.querySelector<HTMLOutputElement>('#variation-value')!;
const errorText = document.querySelector<HTMLParagraphElement>('#error')!;
const panelsRoot = document.querySelector<HTMLElement>('#panels')!;

let svgText = '';
const panels = state.panels.map((config, index) => createPanel(config, index));

setUpToolbar();
void loadSvg();

// ── SVG source ──────────────────────────────────────────────────────────────

function setUpToolbar(): void {
  const options: [string, string][] = [
    [LINE_CHOICE, 'Straight line'],
    ...exampleFiles.map((file): [string, string] => [file.url, file.name]),
    [PASTE_CHOICE, 'Paste your own…'],
  ];
  for (const [value, label] of options) choiceSelect.append(new Option(label, value));
  choiceSelect.value = state.choice;
  pasteArea.value = state.pasted;
  widthInput.value = String(state.width);
  variationInput.value = String(state.variation);
  variationOutput.value = String(state.variation);

  choiceSelect.addEventListener('change', () => {
    state.choice = choiceSelect.value;
    save();
    void loadSvg();
  });
  pasteArea.addEventListener('input', () => {
    state.pasted = pasteArea.value;
    save();
    svgText = pasteArea.value;
    paintAll();
  });
  widthInput.addEventListener('change', () => {
    state.width = Number(widthInput.value) || 520;
    save();
    paintAll();
  });
  variationInput.addEventListener('input', () => {
    state.variation = Number(variationInput.value);
    variationOutput.value = variationInput.value;
    save();
  });
}

async function loadSvg(): Promise<void> {
  pasteArea.hidden = state.choice !== PASTE_CHOICE;
  if (state.choice === PASTE_CHOICE) svgText = state.pasted;
  else if (state.choice === LINE_CHOICE) svgText = LINE_SVG;
  else svgText = await (await fetch(state.choice)).text();
  paintAll();
}

// ── Panels ──────────────────────────────────────────────────────────────────

interface Panel {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Updates every control to match the panel's config. */
  refresh: () => void;
  paint: () => void;
}

function createPanel(config: PanelConfig, index: number): Panel {
  const element = document.createElement('section');
  element.className = 'panel';
  const title = document.createElement('h2');
  title.textContent = `Version ${String.fromCharCode(65 + index)}`;
  const canvas = document.createElement('canvas');

  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  buttons.append(
    button('Make variations from this', () => makeVariations(index)),
    button('Copy config', (b) => void copyConfig(config, b)),
    button('Reset to defaults', () => {
      Object.assign(config, defaultPanel());
      changed();
      panel.refresh();
    }),
  );

  const basics = document.createElement('div');
  basics.className = 'basics';
  const brushSelect = select(['flat', 'round'], (value) => (config.brush = value as BrushKind));
  const handSelect = select(['right', 'left'], (value) => (config.hand = value as Hand));
  const sizeInput = numberInput(1, 80, 1, (value) => (config.size = value ?? 12));
  const seedInput = numberInput(0, 4294967295, 1, (value) => (config.seed = value));
  seedInput.placeholder = 'hash';
  basics.append(labelled('Brush', brushSelect), labelled('Hand', handSelect), labelled('Size', sizeInput), labelled('Seed', seedInput));

  const sliders = document.createElement('div');
  sliders.className = 'sliders';
  const sliderRefreshers = fields.map((field) => {
    const { min, max, step } = tuningRanges[field];
    const wrapper = document.createElement('label');
    wrapper.className = 'slider';
    const name = document.createElement('span');
    name.textContent = field;
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step) });
    const output = document.createElement('output');
    input.addEventListener('input', () => {
      config.tuning[field] = Number(input.value);
      output.value = input.value;
      changed();
    });
    wrapper.append(name, input, output);
    sliders.append(wrapper);
    return () => {
      input.value = String(config.tuning[field]);
      output.value = String(config.tuning[field]);
    };
  });

  element.append(title, canvas, buttons, basics, sliders);
  panelsRoot.append(element);

  let frame = 0;
  const panel: Panel = {
    element,
    canvas,
    refresh: () => {
      brushSelect.value = config.brush;
      handSelect.value = config.hand;
      sizeInput.value = String(config.size);
      seedInput.value = config.seed === null ? '' : String(config.seed);
      for (const refreshSlider of sliderRefreshers) refreshSlider();
    },
    // Repaints at most once per frame while a slider is being dragged.
    paint: () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void paintPanel(config, canvas));
    },
  };

  function changed(): void {
    save();
    panel.paint();
  }

  // Controls other than sliders report their change here.
  for (const control of [brushSelect, handSelect, sizeInput, seedInput]) control.addEventListener('change', changed);
  panel.refresh();
  return panel;
}

async function paintPanel(config: PanelConfig, canvas: HTMLCanvasElement): Promise<void> {
  if (!svgText.trim()) return;
  try {
    await paintSvg(svgText, {
      brush: config.brush,
      hand: config.hand,
      size: config.size,
      ...(config.seed === null ? {} : { seed: config.seed }),
      tuning: config.tuning,
      width: state.width,
      canvas,
    });
    errorText.hidden = true;
  } catch (error) {
    errorText.textContent = String(error);
    errorText.hidden = false;
  }
}

function paintAll(): void {
  for (const panel of panels) panel.paint();
}

/** Keeps panel `index` and gives the other three small random changes to its numbers. */
function makeVariations(index: number): void {
  const source = state.panels[index]!;
  const amount = state.variation / 100;
  state.panels.forEach((target, i) => {
    panels[i]!.element.classList.toggle('chosen', i === index);
    if (i === index) return;
    target.brush = source.brush;
    target.hand = source.hand;
    target.size = source.size;
    target.seed = source.seed;
    for (const field of fields) {
      const { min, max, step } = tuningRanges[field];
      const change = (variationRandom.next() * 2 - 1) * amount * (max - min);
      const value = Math.min(max, Math.max(min, source.tuning[field] + change));
      target.tuning[field] = roundToStep(value, step);
    }
    panels[i]!.refresh();
    panels[i]!.paint();
  });
  save();
}

/** Copies the panel's tuning as a declaration that replaces `defaultTuning` in src/tuning.ts. */
async function copyConfig(config: PanelConfig, copyButton: HTMLButtonElement): Promise<void> {
  const seed = config.seed === null ? 'hash of the SVG' : config.seed;
  const lines = fields.map((field) => `  ${field}: ${config.tuning[field]},`);
  const text = [
    `// Tuned with brush: '${config.brush}', hand: '${config.hand}', size: ${config.size}, seed: ${seed}`,
    'export const defaultTuning: Tuning = {',
    ...lines,
    '};',
    '',
  ].join('\n');
  await navigator.clipboard.writeText(text);
  copyButton.textContent = 'Copied';
  setTimeout(() => (copyButton.textContent = 'Copy config'), 1500);
}

// ── Saving ──────────────────────────────────────────────────────────────────

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable, for example in a private window. The page still works.
  }
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    // Fields added to Tuning after the save get their default value, and fields
    // that no longer exist are dropped, so a copied config still compiles.
    saved.panels = saved.panels.map((panel) => {
      const tuning = { ...defaultTuning };
      for (const field of fields) {
        const value = (panel.tuning as Partial<Tuning> | undefined)?.[field];
        if (typeof value === 'number') tuning[field] = value;
      }
      return { ...defaultPanel(), ...panel, tuning };
    });
    return saved;
  } catch {
    return null;
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  element.addEventListener('click', () => onClick(element));
  return element;
}

function select(values: string[], onChange: (value: string) => void): HTMLSelectElement {
  const element = document.createElement('select');
  for (const value of values) element.append(new Option(value, value));
  element.addEventListener('change', () => onChange(element.value));
  return element;
}

function numberInput(min: number, max: number, step: number, onChange: (value: number | null) => void): HTMLInputElement {
  const element = document.createElement('input');
  Object.assign(element, { type: 'number', min: String(min), max: String(max), step: String(step) });
  element.addEventListener('change', () => onChange(element.value === '' ? null : Number(element.value)));
  return element;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.append(text, control);
  return label;
}
