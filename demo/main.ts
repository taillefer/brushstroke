import { paintSvg, type BrushKind, type Hand, type SvgSource } from '../src/index';
import { exampleFiles, LINE_SVG } from './examples';

interface Example {
  name: string;
  /** How the SVG reaches paintSvg, shown under the name. */
  sourceKind: string;
  source: () => SvgSource;
}

const fromUrl = (file: { name: string; url: string }): Example =>
  ({ name: file.name, sourceKind: 'URL', source: () => file.url });

const examples: Example[] = [
  { name: 'Straight line', sourceKind: 'SVG text', source: () => LINE_SVG },
  ...exampleFiles.slice(0, 2).map(fromUrl),
  {
    name: 'Circle',
    sourceKind: '<svg> element',
    source: () => document.querySelector<SVGSVGElement>('#circle-source')!,
  },
  ...exampleFiles.slice(2).map(fromUrl),
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
