const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness(run) {
  const originals = { window: global.window, document: global.document, Node: global.Node, now: Date.now };
  let now = 1000, cursor = 0, tree, dismissed = 0, nextTimer = 0;
  const slots = [], pending = [], timers = new Map(), listeners = new Map();
  class Node { constructor(inside) { this.inside = inside; } }
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((v, j) => v !== previous.deps[j])) {
        previous?.cleanup?.(); slots[i] = { deps };
        pending.push(() => slots[i].cleanup = fn());
      }
    },
  };
  Date.now = () => now; global.Node = Node;
  global.window = { setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id) };
  global.document = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); } };
  try {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/TransientNotice.tsx'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : require(name), module, module.exports);
    let props = { expiresAt: 9000, contextKey: 'day:2026-10-12', onDismiss: () => dismissed++, children: '已加入 12 项' };
    const render = (updates = {}) => {
      props = { ...props, ...updates }; cursor = 0; tree = module.exports.default(props);
      if (tree) tree.props.ref.current = { contains: node => node.inside };
      pending.splice(0).forEach(fn => fn());
      return tree;
    };
    run({ render, timers, listeners, Node, get dismissed() { return dismissed; },
      advance(ms) { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
      cleanup() { slots.forEach(slot => slot?.cleanup?.()); } });
  } finally { global.window = originals.window; global.document = originals.document; global.Node = originals.Node; Date.now = originals.now; }
}

test('notice expires after eight seconds; rerenders and changing callback do not extend its life', () => harness(h => {
  h.render(); h.advance(7000); h.render(); assert.equal(h.dismissed, 0);
  assert.equal(h.timers.size, 1); h.advance(1000); assert.equal(h.dismissed, 1);
  assert.equal(h.render(), null);
}));

test('clicking inside preserves undo; outside actions, Escape and route/date changes dismiss feedback', () => harness(h => {
  h.render();
  h.listeners.get('pointerdown')({ target: new h.Node(true) }); assert.equal(h.dismissed, 0);
  h.listeners.get('keydown')({ target: new h.Node(true), key: 'Enter' }); assert.equal(h.dismissed, 0);
  h.listeners.get('keydown')({ target: new h.Node(false), key: 'Tab' }); assert.equal(h.dismissed, 0);
  h.listeners.get('pointerdown')({ target: new h.Node(false) }); assert.equal(h.dismissed, 1);
  h.listeners.get('keydown')({ target: new h.Node(false), key: 'a' }); assert.equal(h.dismissed, 2);
  h.listeners.get('keydown')({ target: new h.Node(true), key: 'Escape' }); assert.equal(h.dismissed, 3);
  h.render({ contextKey: 'week:2026-10-12' }); assert.equal(h.dismissed, 4);
}));

test('manual close is accessible; fresh undo/redo feedback resets deadline and cleans old listeners', () => harness(h => {
  const tree = h.render();
  const close = tree.props.children.find(n => n.type === 'button');
  assert.equal(close.props['aria-label'], '关闭操作提示'); assert.ok(close.props.className.includes('h-11'));
  close.props.onClick(); assert.equal(h.dismissed, 1);
  h.advance(7000); h.render({ expiresAt: 16000 });
  assert.equal(h.timers.size, 1); h.advance(1000); assert.equal(h.dismissed, 1);
  h.advance(7000); assert.equal(h.dismissed, 2);
  h.cleanup(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
}));

test('an already-expired notice never flashes after a remount', () => harness(h => {
  assert.equal(h.render({ expiresAt: 999 }), null); assert.equal(h.dismissed, 1);
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
}));
