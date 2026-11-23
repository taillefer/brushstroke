// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSvg, parseSvgDrawing, parseSvgDrawingTree, parseSvgTree, type SvgNode } from '../src';

// The demo's example files. Tests run from the package root.
const examples = join(process.cwd(), 'demo/examples');
const fixtures = readdirSync(examples).filter((f) => f.endsWith('.svg'));

/** The element tree as the DOM sees it: the reading brushstroke used before it had its own XML reader. */
function fromDom(element: Element): SvgNode {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) attributes[attribute.name] = attribute.value;
  return { name: element.localName, attributes, children: Array.from(element.children, fromDom) };
}

const domTree = (text: string) => fromDom(new DOMParser().parseFromString(text, 'image/svg+xml').documentElement);

describe('the XML reader matches DOMParser', () => {
  it.each(fixtures)('%s', (file) => {
    const text = readFileSync(join(examples, file), 'utf8');
    expect(parseSvg(text)).toEqual(parseSvgTree(domTree(text)));
    expect(parseSvgDrawing(text)).toEqual(parseSvgDrawingTree(domTree(text)));
  });

  it('on namespaces, entities and whitespace in attributes', () => {
    const text = `<?xml version="1.0"?>
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">
        <g stroke="navy" transform="translate(1
          0)"><path id="a&amp;b" d="M0 0&#10;L5 5"/></g>
      </svg>`;
    expect(parseSvg(text)).toEqual(parseSvgTree(domTree(text)));
  });
});
