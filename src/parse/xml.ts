import type { SvgNode } from './svg';

/**
 * A small XML reader that builds an element tree, so SVG text can be parsed
 * without a DOM, in Node as well as in browsers.
 *
 * It keeps what the SVG parsers read and checks what makes a document
 * well-formed: matching tags, quoted attributes, no duplicate attributes, one
 * root element, and known entities in attribute values. Text, comments, CDATA
 * and processing instructions are skipped.
 *
 * Like the DOM, element names lose their namespace prefix (`svg:path` becomes
 * `path`) and attribute names keep it (`xlink:href`). Attribute values are
 * normalised as XML requires: line breaks and tabs become spaces, then
 * character and entity references are replaced.
 *
 * Entities declared in the DOCTYPE, such as Illustrator's
 * `<!ENTITY ns_svg "http://www.w3.org/2000/svg">`, are replaced once and never
 * expanded recursively, so a crafted file cannot blow up in size.
 *
 * Throws an Error on text that is not well-formed XML.
 */
export function readXml(text: string): SvgNode {
  return new XmlReader(text).document();
}

const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const NAME = /[^\s/>=<"'!?&;]+/y;
const WHITESPACE = /[ \t\r\n]*/y;

interface OpenElement {
  name: string;
  node: { name: string; attributes: Record<string, string>; children: SvgNode[] };
}

class XmlReader {
  private readonly text: string;
  private pos = 0;
  private readonly entities: Record<string, string> = { ...PREDEFINED };

  constructor(text: string) {
    // A byte order mark is not part of the document, and XML reads every line break as \n.
    this.text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  }

  document(): SvgNode {
    this.misc(true);
    if (!this.text.startsWith('<', this.pos)) this.fail('expected the root element');
    const root = this.element();
    this.misc(false);
    if (this.pos < this.text.length) this.fail('unexpected content after the root element');
    return root;
  }

  /** Skips whitespace, comments and processing instructions, and before the root also the DOCTYPE. */
  private misc(beforeRoot: boolean): void {
    for (;;) {
      this.skipWhitespace();
      if (this.text.startsWith('<?', this.pos)) this.skipPast('?>');
      else if (this.text.startsWith('<!--', this.pos)) this.skipPast('-->');
      else if (beforeRoot && this.text.startsWith('<!DOCTYPE', this.pos)) this.doctype();
      else return;
    }
  }

  /** Reads the root element and everything inside it, with an explicit stack so deep nesting cannot overflow. */
  private element(): SvgNode {
    const stack: OpenElement[] = [];
    let root: SvgNode | undefined;

    const open = (): void => {
      this.pos++; // '<'
      const name = this.name();
      const attributes = this.attributes();
      const node = { name: localName(name), attributes, children: [] as SvgNode[] };
      stack.at(-1)?.node.children.push(node);
      root ??= node;
      if (this.text.startsWith('/>', this.pos)) {
        this.pos += 2;
      } else if (this.text[this.pos] === '>') {
        this.pos++;
        stack.push({ name, node });
      } else {
        this.fail(`expected > in <${name}>`);
      }
    };

    open();
    while (stack.length > 0) {
      const next = this.text.indexOf('<', this.pos);
      if (next < 0) this.fail(`<${stack.at(-1)!.name}> is not closed`);
      this.pos = next; // Text between tags is not used.
      if (this.text.startsWith('</', this.pos)) {
        this.pos += 2;
        const name = this.name();
        const expected = stack.pop()!.name;
        if (name !== expected) this.fail(`</${name}> closes <${expected}>`);
        this.skipWhitespace();
        this.expect('>');
      } else if (this.text.startsWith('<!--', this.pos)) {
        this.skipPast('-->');
      } else if (this.text.startsWith('<![CDATA[', this.pos)) {
        this.skipPast(']]>');
      } else if (this.text.startsWith('<?', this.pos)) {
        this.skipPast('?>');
      } else {
        open();
      }
    }
    return root!;
  }

  private attributes(): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (;;) {
      const before = this.pos;
      this.skipWhitespace();
      const c = this.text[this.pos];
      if (c === '>' || c === '/' || c === undefined) return attributes;
      if (this.pos === before) this.fail('expected whitespace between attributes');
      const name = this.name();
      this.skipWhitespace();
      this.expect('=');
      this.skipWhitespace();
      if (Object.hasOwn(attributes, name)) this.fail(`duplicate attribute ${name}`);
      attributes[name] = this.decode(this.quoted().replace(/[\t\n]/g, ' '));
    }
  }

  /** Reads `<!DOCTYPE …>`, keeping simple internal entity declarations. */
  private doctype(): void {
    this.pos += '<!DOCTYPE'.length;
    for (;;) {
      const c = this.text[this.pos];
      if (c === undefined) this.fail('the DOCTYPE is not closed');
      if (c === '>') {
        this.pos++;
        return;
      }
      if (c === '"' || c === "'") this.quoted();
      else if (c === '[') this.internalSubset();
      else this.pos++;
    }
  }

  private internalSubset(): void {
    this.pos++; // '['
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.pos] === ']') {
        this.pos++;
        return;
      }
      if (this.pos >= this.text.length) this.fail('the DOCTYPE is not closed');
      if (this.text.startsWith('<!--', this.pos)) this.skipPast('-->');
      else if (this.text.startsWith('<?', this.pos)) this.skipPast('?>');
      else if (this.text.startsWith('<!ENTITY', this.pos)) this.entityDeclaration();
      else if (this.text.startsWith('<!', this.pos)) this.declaration();
      else this.pos++; // Parameter entity references such as %name; are ignored.
    }
  }

  private entityDeclaration(): void {
    this.pos += '<!ENTITY'.length;
    this.skipWhitespace();
    const parameter = this.text[this.pos] === '%';
    if (parameter) {
      this.pos++;
      this.skipWhitespace();
    }
    const name = this.name();
    this.skipWhitespace();
    const c = this.text[this.pos];
    // Only internal general entities are kept. External ones (SYSTEM, PUBLIC) are never loaded.
    if (!parameter && (c === '"' || c === "'")) {
      const value = this.quoted();
      // Character references are replaced now, and entity references are kept as text, so expansion is one level.
      if (!Object.hasOwn(this.entities, name)) this.entities[name] = decodeCharacters(value);
    }
    this.declaration();
  }

  /** Skips to the end of a markup declaration, stepping over quoted text. */
  private declaration(): void {
    for (;;) {
      const c = this.text[this.pos];
      if (c === undefined) this.fail('a declaration in the DOCTYPE is not closed');
      if (c === '>') {
        this.pos++;
        return;
      }
      if (c === '"' || c === "'") this.quoted();
      else this.pos++;
    }
  }

  private quoted(): string {
    const quote = this.text[this.pos];
    if (quote !== '"' && quote !== "'") this.fail('expected a quoted value');
    const end = this.text.indexOf(quote, this.pos + 1);
    if (end < 0) this.fail('a quoted value is not closed');
    const value = this.text.slice(this.pos + 1, end);
    if (value.includes('<')) this.fail('< in an attribute value');
    this.pos = end + 1;
    return value;
  }

  private decode(value: string): string {
    if (!value.includes('&')) return value;
    return value.replace(/&([^;\s&]*);?/g, (match, name: string) => {
      if (!match.endsWith(';')) this.fail('& must start a reference such as &amp;');
      if (name.startsWith('#')) return characterReference(name) ?? this.fail(`invalid character reference &${name};`);
      return Object.hasOwn(this.entities, name) ? this.entities[name]! : this.fail(`unknown entity &${name};`);
    });
  }

  private name(): string {
    NAME.lastIndex = this.pos;
    const match = NAME.exec(this.text);
    if (!match) this.fail('expected a name');
    this.pos = NAME.lastIndex;
    return match[0];
  }

  private skipWhitespace(): void {
    WHITESPACE.lastIndex = this.pos;
    WHITESPACE.exec(this.text);
    this.pos = WHITESPACE.lastIndex;
  }

  private skipPast(end: string): void {
    const at = this.text.indexOf(end, this.pos);
    if (at < 0) this.fail(`expected ${end}`);
    this.pos = at + end.length;
  }

  private expect(c: string): void {
    if (this.text[this.pos] !== c) this.fail(`expected ${c}`);
    this.pos++;
  }

  private fail(reason: string): never {
    throw new Error(`${reason} (at character ${this.pos})`);
  }
}

function localName(name: string): string {
  return name.slice(name.lastIndexOf(':') + 1);
}

function characterReference(name: string): string | undefined {
  const code = /^#x[0-9a-f]+$/i.test(name) ? parseInt(name.slice(2), 16) : /^#\d+$/.test(name) ? parseInt(name.slice(1), 10) : NaN;
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : undefined;
}

function decodeCharacters(value: string): string {
  return value.replace(/&(#[0-9a-zA-Z]+);/g, (match, name: string) => characterReference(name) ?? match);
}
