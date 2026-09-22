const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function flatten(n) { return Array.isArray(n) ? n.flatMap(flatten) : n && typeof n === 'object' ? [n, ...flatten(n.props?.children)] : []; }
function harness(overrides = {}) {
  const slots = []; let cursor = 0, tree; const calls = [];
  const react = { useId: () => 'tasks', useEffect() {}, useRef: () => ({ current: null }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => slots[i] = v]; } };
  function load(file) {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name), mod, mod.exports);
    return mod.exports;
  }
  const Picker = load('components/EntryTaskPicker.tsx').default;
  const props = { initiallyOpen: true, label: '选择任务', value: 'a',
    tasks: [{ id: 'a', title: '同名任务', aspirationId: 'g', startTime: '09:00', status: 'done' }, { id: 'b', title: '同名任务', status: 'todo' }],
    aspirations: [{ id: 'g', title: '学习' }], onChange: id => calls.push(id), onClose: () => calls.push('closed'), ...overrides };
  const render = () => { cursor = 0; tree = Picker(props); };
  const nodes = () => flatten(tree);
  const input = () => nodes().find(n => n.type === 'input');
  render();
  return { calls, nodes, input, render,
    search(value) { input().props.onChange({ target: { value } }); render(); },
    key(key, nativeEvent = {}) { input().props.onKeyDown({ key, nativeEvent, preventDefault() {}, stopPropagation() {} }); render(); },
  };
}

test('search by title or goal, selected state, duplicate titles keep independent IDs', () => {
  const h = harness();
  const options = () => h.nodes().filter(n => n.props.role === 'option');
  assert.equal(options().length, 3); assert.equal(options()[1].props['aria-selected'], true);
  h.search('学习'); assert.equal(options().length, 2);
  h.search('同名'); assert.equal(options().length, 3);
  options()[2].props.onClick(); h.render(); assert.deepEqual(h.calls, ['b', 'closed']);
  assert.equal(options().length, 0);
});

test('keyboard selection, IME safety, clearing association and no-result state', () => {
  const h = harness();
  h.key('ArrowDown'); h.key('ArrowDown');
  h.key('Enter', { isComposing: true }); assert.deepEqual(h.calls, []);
  h.key('Enter'); assert.deepEqual(h.calls, ['a', 'closed']);
  const empty = harness(); empty.search('不存在');
  assert.equal(empty.nodes().filter(n => n.props.role === 'option').length, 1);
  assert.ok(empty.nodes().some(n => n.props.children === '没有匹配的任务，试试其他关键词'));
  empty.key('ArrowDown'); empty.key('Enter'); assert.deepEqual(empty.calls, [undefined, 'closed']);
});

test('preview trigger opens styled picker and closing never changes association', () => {
  const h = harness({ initiallyOpen: false });
  assert.equal(h.input(), undefined);
  h.nodes().find(n => n.props['aria-label'] === '选择任务').props.onClick(); h.render();
  assert.ok(h.input());
  h.nodes().find(n => n.props['aria-label'] === '关闭任务选择').props.onClick(); h.render();
  assert.equal(h.input(), undefined); assert.deepEqual(h.calls, ['closed']);
});
