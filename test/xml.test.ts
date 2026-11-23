/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSvg, parseSvgDrawing, parseSvgText } from '../src';
import { readXml } from '../src/parse/xml';

// The demo's example files. Tests run from the package root.
const examples = join(process.cwd(), 'demo/examples');
const fixtures = readdirSync(examples).filter((f) => f.endsWith('.svg'));

describe('readXml', () => {
  it('runs without a DOM', () => {
    expect(typeof (globalThis as { DOMParser?: unknown }).DOMParser).toBe('undefined');
  });

  it('reads elements, attributes and nesting, and skips text, comments, CDATA and processing instructions', () => {
    const root = readXml(`﻿<?xml version="1.0" encoding="UTF-8"?>
      <!-- before -->
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width='10'>
        <title>Map &amp; legend</title>
        <![CDATA[ <not> an element ]]>
        <?inkscape something?>
        <g id="a"><svg:path d="M0 0"/></g>
      </svg>
      <!-- after -->`);
    expect(root.name).toBe('svg');
    expect(root.attributes).toEqual({ xmlns: 'http://www.w3.org/2000/svg', 'xmlns:xlink': 'http://www.w3.org/1999/xlink', width: '10' });
    expect(root.children.map((c) => c.name)).toEqual(['title', 'g']);
    expect(root.children[1]!.children[0]).toEqual({ name: 'path', attributes: { d: 'M0 0' }, children: [] });
  });

  it('normalises attribute values and replaces references', () => {
    const root = readXml('<svg a="x\ty\r\nz" b="&lt;&#65;&#x42;&quot;&apos;&gt;" c="line&#10;break"/>');
    expect(root.attributes).toEqual({ a: 'x y z', b: '<AB"\'>', c: 'line\nbreak' });
  });

  it('uses entities declared in the DOCTYPE, one level deep', () => {
    const root = readXml(`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
      <!ENTITY ns_svg "http://www.w3.org/2000/svg">
      <!ENTITY a "&ns_svg;&ns_svg;">
      <!ENTITY % param "ignored">
      <!ELEMENT foo (#PCDATA)>
    ]>
    <svg xmlns="&ns_svg;" data-a="&a;"/>`);
    expect(root.attributes.xmlns).toBe('http://www.w3.org/2000/svg');
    expect(root.attributes['data-a']).toBe('&ns_svg;&ns_svg;');
  });

  it('reads deep nesting without running out of stack', () => {
    const depth = 50_000;
    const root = readXml('<svg>' + '<g>'.repeat(depth) + '</g>'.repeat(depth) + '</svg>');
    let node = root;
    let count = 0;
    while (node.children[0]) {
      node = node.children[0];
      count++;
    }
    expect(count).toBe(depth);
  });

  it.each([
    ['an unclosed element', '<svg><line></svg>'],
    ['a mismatched end tag', '<svg><g></h></svg>'],
    ['an unquoted attribute', '<svg a=1/>'],
    ['a duplicate attribute', '<svg a="1" a="2"/>'],
    ['an unknown entity', '<svg a="&nbsp;"/>'],
    ['a bare ampersand', '<svg a="a & b"/>'],
    ['two root elements', '<svg/><svg/>'],
    ['no root element', '<!-- empty -->'],
    ['plain text', 'not svg'],
    ['< in an attribute', '<svg a="<"/>'],
    ['missing space between attributes', '<svg a="1"b="2"/>'],
  ])('throws on %s', (_, text) => {
    expect(() => readXml(text)).toThrow();
  });
});

describe('parsing in Node', () => {
  it('parses every example SVG with parseSvg and parseSvgDrawing', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const file of fixtures) {
      const text = readFileSync(join(examples, file), 'utf8');
      expect(parseSvg(text).lines.length, file).toBeGreaterThan(0);
      expect(() => parseSvgDrawing(text), file).not.toThrow();
    }
  });

  it('rejects a document whose root is not <svg>', () => {
    expect(() => parseSvgText('<html/>')).toThrow(/not a valid SVG/);
  });
});
