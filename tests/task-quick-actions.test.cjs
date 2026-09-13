const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness() {
  const values = []; let cursor = 0; let tree;
  const calls = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], value => values[i] = value]; },
    useRef(initial) { const i = cursor++; if (!(i in values)) values[i] = { current: initial }; return values[i]; },
    useEffect() {},
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/TaskQuickActions.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'document', code)(name => {
    if (name === 'react') return react;
    if (name === 'react-dom') return { createPortal: node => node };
    return require(name);
  }, module, module.exports, { innerWidth: 390, innerHeight: 844 }, { body: {} });
  function render() {
    cursor = 0;
    tree = module.exports.default({ title: '任务', onRename: () => calls.push('rename'), onDelete: () => calls.push('delete') });
  }
  function nodes(n = tree) {
    if (Array.isArray(n)) return n.flatMap(item => nodes(item));
    if (!n || typeof n !== 'object') return [];
    return [n, ...(n.props?.children === undefined ? [] : nodes(n.props.children))];
  }
  const menu = () => nodes().find(n => n.props.role === 'menu');
  render();
  return {
    calls, menu,
    open() {
      nodes().find(n => n.props['aria-haspopup'] === 'menu').props.onClick({ detail: 1, stopPropagation() {}, currentTarget: { getBoundingClientRect: () => ({ top: 200, bottom: 228, right: 375 }) } });
      render();
    },
    blur(relatedTarget) {
      menu().props.onBlur({ relatedTarget, currentTarget: { contains: node => node?.inside === true } }); render();
    },
    click(label) {
      const item = nodes().find(n => n.props.role === 'menuitem' && n.props.children.includes(label));
      assert.ok(item, 'menu item must still exist when touch click arrives');
      item.props.onClick(); render();
    },
    outside() { tree.props.children[1].props.onClick({ stopPropagation() {} }); render(); },
    escape() { menu().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); render(); },
  };
}

test('touch blur with no related target must not remove Rename/Delete before click', () => {
  for (const [label, expected] of [['改名', 'rename'], ['删除任务', 'delete']]) {
    const h = harness(); h.open(); h.blur(null);
    assert.ok(h.menu(), 'iOS-style blur should keep the menu mounted');
    h.click(label);
    assert.deepEqual(h.calls, [expected]);
    assert.equal(h.menu(), undefined);
  }
});

test('keyboard focus inside stays open, focus outside closes without executing actions', () => {
  const h = harness(); h.open(); h.blur({ inside: true }); assert.ok(h.menu());
  h.blur({ inside: false }); assert.equal(h.menu(), undefined); assert.deepEqual(h.calls, []);
});

test('outside tap and Escape still dismiss without selecting an action', () => {
  for (const exit of ['outside', 'escape']) {
    const h = harness(); h.open(); h[exit]();
    assert.equal(h.menu(), undefined); assert.deepEqual(h.calls, []);
  }
});
