const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  return node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];
}

function harness(value) {
  let active, cursor, tree;
  const saved = [], timers = new Map(); let timerId = 0;
  const react = {
    useState(initial) {
      const slots = active.slots, i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in active.slots)) active.slots[i] = { current: initial };
      return active.slots[i];
    },
    useLayoutEffect(fn) { active.layouts.push(fn); },
    useEffect() {},
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/TimePicker.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(
    name => name === 'react' ? react : require(name), module, module.exports,
    fn => { timers.set(++timerId, fn); return timerId; }, id => timers.delete(id),
  );
  const root = { slots: [], layouts: [] };
  function render(component, props, state) {
    active = state; cursor = 0; state.layouts = [];
    const result = component(props);
    for (const n of flatten(result)) {
      if (typeof n.type === 'string' && n.props.ref && !n.props.ref.current) {
        n.props.ref.current = { scrollTop: 0, scrollTo({ top }) { this.scrollTop = top; } };
      }
    }
    state.layouts.forEach(fn => fn());
    return result;
  }
  function redraw() { tree = render(module.exports.default, { value, onChange: v => saved.push(v) }, root); }
  const input = () => flatten(tree).find(n => n.type === 'input');
  redraw(); input().props.onFocus(); redraw();
  const children = new Map();
  function wheel(label) {
    const node = flatten(tree).find(n => n.props.label === label && typeof n.type === 'function');
    if (!children.has(label)) children.set(label, { slots: [], layouts: [] });
    const rendered = render(node.type, node.props, children.get(label));
    return flatten(rendered).find(n => n.props.role === 'spinbutton');
  }
  return {
    saved, input, redraw, wheel,
    roll(label, delta, rerender = true) {
      const n = wheel(label); n.props.ref.current.scrollTop += delta * 36; n.props.onScroll();
      if (rerender) redraw();
    },
    settle() { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); },
    type(text) { input().props.onChange({ target: { value: text } }); redraw(); },
    save() { flatten(tree).find(n => n.type === 'button' && n.props.children === '保存时间').props.onClick(); redraw(); },
  };
}

test('minutes and hours adjust independently without committing until Save', () => {
  const h = harness('03:55');
  h.wheel('小时滚轮');
  h.roll('分钟滚轮', -50);
  assert.equal(h.input().props.value, '03:05');
  assert.equal(h.wheel('小时滚轮').props.ref.current.scrollTop, 3 * 36);
  assert.deepEqual(h.saved, []);
  h.roll('小时滚轮', 1);
  assert.equal(h.input().props.value, '04:05');
  h.save(); assert.deepEqual(h.saved, ['04:05']);
});

test('minute boundaries stop at 00 and 59 without changing the hour or wrapping midnight', () => {
  const h = harness('23:55');
  h.roll('分钟滚轮', 10);
  assert.equal(h.input().props.value, '23:59');
  h.settle();
  const n = h.wheel('分钟滚轮');
  n.props.onScroll(); h.redraw();
  assert.equal(h.input().props.value, '23:59');
  h.type('00:05');
  h.roll('分钟滚轮', -10);
  assert.equal(h.input().props.value, '00:00');
});

test('direct input synchronizes both wheels without false carry; hour edits preserve minutes', () => {
  const h = harness('03:55');
  h.wheel('分钟滚轮'); h.wheel('小时滚轮');
  h.type('12:07');
  assert.equal(h.wheel('分钟滚轮').props.ref.current.scrollTop, 7 * 36);
  assert.equal(h.wheel('小时滚轮').props.ref.current.scrollTop, 12 * 36);
  h.wheel('分钟滚轮').props.onScroll(); h.redraw();
  assert.equal(h.input().props.value, '12:07');
  h.roll('小时滚轮', 1);
  assert.equal(h.input().props.value, '13:07');
  h.roll('分钟滚轮', -8);
  assert.equal(h.input().props.value, '13:00');
});

test('repeated fast boundary scroll events never carry hours', () => {
  const h = harness('03:59');
  const wheel = h.wheel('分钟滚轮');
  for (let i = 0; i < 6; i++) {
    wheel.props.ref.current.scrollTop += 36;
    wheel.props.onScroll();
  }
  h.redraw();
  assert.equal(h.input().props.value, '03:59');
});
