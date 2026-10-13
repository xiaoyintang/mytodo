const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Exercise the real component's handlers in mobile event order: pointerdown,
// blur(relatedTarget=null), then click. No artificial delayed click/selection.
function harness(run) {
  const original = { document: global.document, Node: global.Node };
  const slots = [], effects = [], listeners = new Set();
  let cursor = 0, tree, commits = 0, cancelled = 0, selected;
  class Node { constructor(inside) { this.inside = inside; } }
  const root = { contains: node => !!node?.inside };
  const react = {
    useId: () => 'choices',
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((v, j) => v !== previous.deps[j])) {
        previous?.cleanup?.(); slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  global.Node = Node;
  global.document = {
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  try {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/EntryNameInput.tsx'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : require(name), mod, mod.exports);
    const task = { title: '今天计划的阅读', taskId: 'task-1', aspirationId: 'goal-1', taskLabel: '阅读', goalLabel: '学习', source: 'task' };
    const history = { title: '已经做过的写作', taskId: 'task-2', aspirationId: 'goal-2', taskLabel: '写作', goalLabel: '表达', source: 'history' };
    const props = { value: '正事', label: '事项名称', onChange() {}, history: [task, history],
      onCommit: () => commits++, onCancel: () => cancelled++, onSelect: choice => { selected = choice; } };
    function render() {
      cursor = 0; tree = mod.exports.default(props); tree.props.ref.current = root;
      effects.splice(0).forEach(fn => fn()); return tree;
    }
    function nodes(node) {
      if (!node || typeof node !== 'object') return [];
      if (Array.isArray(node)) return node.flatMap(nodes);
      return [node, ...nodes(node.props?.children)];
    }
    const input = () => nodes(tree).find(n => n.type === 'input');
    run({ render, nodes: () => nodes(tree), task, history, input,
      setHistory(items) { props.history = items; render(); },
      focus() { input().props.onFocus({ currentTarget: { select() {} } }); render(); },
      blur(target = null) { tree.props.onBlur({ relatedTarget: target, currentTarget: root }); render(); },
      pointer(inside) { for (const fn of [...listeners]) fn({ target: new Node(inside) }); render(); },
      key(key) { input().props.onKeyDown({ key, nativeEvent: {}, preventDefault() {}, stopPropagation() {} }); render(); },
      get commits() { return commits; }, get cancelled() { return cancelled; }, get selected() { return selected; },
    });
  } finally {
    slots.forEach(slot => slot?.cleanup?.());
    global.document = original.document; global.Node = original.Node;
  }
}

test('source selectors clearly separate tasks/history and preserve selected task attribution', () => harness(h => {
  h.render();
  const historical = { ...h.task, source: 'history' };
  h.setHistory([h.task, historical, { title: '散步', source: 'history', goalLabel: '健康' }]);
  h.focus();
  const options = () => h.nodes().filter(n => n.props?.role === 'option');
  assert.equal(options().length, 1);
  h.nodes().find(n => n.type === 'button' && n.key === 'history').props.onClick(); h.render();
  assert.equal(options().length, 2);
  assert.equal(h.input().props['aria-activedescendant'], undefined);
  options()[0].props.onClick(); h.render();
  assert.deepEqual(h.selected, historical);
  assert.equal(h.selected.taskId, h.task.taskId); assert.equal(h.selected.aspirationId, h.task.aspirationId);
  assert.equal(options().length, 0);
}));

test('mobile blur does not discard a planned task tap or its attribution', () => harness(h => {
  h.render(); h.focus(); h.pointer(true); h.blur();
  assert.equal(h.commits, 0);
  const option = h.nodes().find(n => n.props?.role === 'option');
  assert.ok(option); option.props.onClick(); h.render();
  assert.deepEqual(h.selected, h.task);
  h.pointer(false); assert.equal(h.commits, 0, 'do not overwrite selection with the stale draft');
}));

test('mobile can switch to today history and select after null-target blur', () => harness(h => {
  h.render(); h.focus(); h.pointer(true); h.blur();
  const historyTab = h.nodes().find(n => n.type === 'button' && n.props.children?.[0] === '今日做过');
  assert.ok(historyTab); historyTab.props.onClick(); h.render();
  h.pointer(true); h.blur();
  h.nodes().find(n => n.props?.role === 'option').props.onClick(); h.render();
  assert.deepEqual(h.selected, h.history); assert.equal(h.commits, 0);
}));

test('touch scrolling inside does not select or commit; outside tap saves only once', () => harness(h => {
  h.render(); h.focus(); h.pointer(true); h.blur();
  assert.equal(h.selected, undefined); assert.equal(h.commits, 0);
  h.pointer(false); h.blur({ inside: false });
  assert.equal(h.commits, 1); assert.equal(h.input().props['aria-expanded'], false);
}));

test('keyboard focus, Enter and Escape keep their commit/cancel behavior', () => harness(h => {
  h.render(); h.focus(); h.blur({ inside: true }); assert.equal(h.commits, 0);
  h.blur({ inside: false }); assert.equal(h.commits, 1);
  h.focus(); h.key('Enter'); h.pointer(false); assert.equal(h.commits, 2);
  h.focus(); h.key('Escape'); h.pointer(false); assert.equal(h.cancelled, 1); assert.equal(h.commits, 2);
}));
