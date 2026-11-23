import type { PaintContext } from '../src/render';

/** Rounds to 1e-6 so the log is stable text. */
const round = (value: unknown): string =>
  typeof value === 'number' ? String(Math.round(value * 1e6) / 1e6) : String(value);

/**
 * A context that writes every method call and property set to a log, one
 * entry per line: `lineTo(1.5,2)` or `globalAlpha=0.5`.
 */
export function loggingContext(): { context: PaintContext; log: string[] } {
  const log: string[] = [];
  const target: Record<string | symbol, unknown> = {};
  const context = new Proxy(target, {
    get: (_, key) => (...args: unknown[]) => {
      log.push(`${String(key)}(${args.map(round).join(',')})`);
    },
    set: (_, key, value) => {
      log.push(`${String(key)}=${round(value)}`);
      return true;
    },
  });
  return { context: context as unknown as PaintContext, log };
}

/**
 * What a log puts on the canvas: one entry per `stroke()`, with the state that
 * applies to it and the path it strokes. Two logs with the same rendering
 * paint the same pixels, even if one sets a property to the value it already
 * has, or sets one that no stroke uses.
 */
export function rendering(log: readonly string[]): string[] {
  type State = { props: Record<string, string>; tx: number; ty: number };
  let state: State = { props: {}, tx: 0, ty: 0 };
  const stack: State[] = [];
  let path: string[] = [];
  const out: string[] = [];

  for (const entry of log) {
    const set = /^(\w+)=(.*)$/.exec(entry);
    if (set) {
      state = { ...state, props: { ...state.props, [set[1]!]: set[2]! } };
      continue;
    }
    const call = /^(\w+)\((.*)\)$/.exec(entry);
    if (!call) throw new Error(`unknown log entry ${entry}`);
    const [, name, rawArgs] = call;
    const args = rawArgs === '' ? [] : rawArgs!.split(',').map(Number);
    switch (name) {
      case 'save':
        stack.push(state);
        break;
      case 'restore':
        state = stack.pop()!;
        break;
      case 'translate':
        state = { ...state, tx: state.tx + args[0]!, ty: state.ty + args[1]! };
        break;
      case 'beginPath':
        path = [];
        break;
      case 'moveTo':
      case 'lineTo':
        path.push(`${name === 'moveTo' ? 'M' : 'L'}${round(args[0]! + state.tx)},${round(args[1]! + state.ty)}`);
        break;
      case 'stroke': {
        const props = Object.entries(state.props).sort().map(([k, v]) => `${k}=${v}`).join(' ');
        out.push(`${props} | ${path.join(' ')}`);
        break;
      }
      default:
        throw new Error(`unexpected call ${name}`);
    }
  }
  return out;
}
