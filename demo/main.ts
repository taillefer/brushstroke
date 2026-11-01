import { paintSvg, type BrushKind, type Hand, type SvgSource } from '../src/index';

interface Example {
  name: string;
  /** How the SVG reaches paintSvg, shown under the name. */
  sourceKind: string;
  source: () => SvgSource;
}

const LINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80">
  <line x1="30" y1="40" x2="270" y2="40"/>
</svg>`;

const examples: Example[] = [
  { name: 'Straight line', sourceKind: 'SVG text', source: () => LINE_SVG },
  { name: 'Curve', sourceKind: 'URL', source: () => 'examples/curve.svg' },
  { name: 'Zigzag', sourceKind: 'URL', source: () => 'examples/zigzag.svg' },
  {
    name: 'Circle',
    sourceKind: '<svg> element',
    source: () => document.querySelector<SVGSVGElement>('#circle-source')!,
  },
  { name: 'Rectangle', sourceKind: 'URL', source: () => 'examples/rectangle.svg' },
  { name: 'Handwriting', sourceKind: 'URL', source: () => 'examples/word.svg' },
  { name: 'Logo outline', sourceKind: 'URL', source: () => 'examples/logo.svg' },
];

const variants: { brush: BrushKind; hand: Hand }[] = [
  { brush: 'flat', hand: 'right' },
  { brush: 'flat', hand: 'left' },
  { brush: 'round', hand: 'right' },
  { brush: 'round', hand: 'left' },
];

const WIDTH = 220;
const body = document.querySelector('#examples tbody')!;
const sizeInput = document.querySelector<HTMLInputElement>('#size')!;
const sizeOutput = document.querySelector<HTMLOutputElement>('#size-value')!;

const rows = examples.map((example) => {
  const row = document.createElement('tr');
  const name = document.createElement('td');
  name.className = 'name';
  const kind = document.createElement('small');
  kind.textContent = example.sourceKind;
  name.append(example.name, kind);
  row.append(name);
  const canvases = variants.map(() => {
    const cell = document.createElement('td');
    const canvas = document.createElement('canvas');
    cell.append(canvas);
    row.append(cell);
    return canvas;
  });
  body.append(row);
  return { example, canvases, name };
});

async function paintAll(): Promise<void> {
  const size = Number(sizeInput.value);
  sizeOutput.value = String(size);
  for (const { example, canvases, name } of rows) {
    try {
      await Promise.all(
        variants.map((variant, i) => paintSvg(example.source(), { ...variant, size, width: WIDTH, canvas: canvases[i]! })),
      );
    } catch (error) {
      const message = document.createElement('small');
      message.className = 'error';
      message.textContent = String(error);
      name.append(message);
    }
  }
}

sizeInput.addEventListener('input', () => void paintAll());
void paintAll();
