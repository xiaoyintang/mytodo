const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness() {
  const values = []; let cursor = 0, tree; const calls = [];
  const react = {
    useEffect() {},
    useRef(initial) { const i = cursor++; if (!(i in values)) values[i] = { current: initial }; return values[i]; },
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
      return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; },
  };
  function load(file) {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', 'document', code)(name => {
      if (name === 'react') return react;
      if (name === 'react-dom') return { createPortal: node => node };
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      return require(name);
    }, mod, mod.exports, { body: {} });
    return mod.exports;
  }
  const Component = load('components/TaskCopyDialog.tsx').default;
  function render() { cursor = 0; tree = Component({ task: { id: 't', title: '写提纲', date: '2026-09-16' }, today: '2026-09-16', onApply: dates => calls.push(dates), onClose: () => calls.push('close') }); }
  function nodes(node = tree) { return Array.isArray(node) ? node.flatMap(n => nodes(n ?? null)) : !node || typeof node !== 'object' ? [] : [node, ...nodes(node.props?.children ?? null)]; }
  function click(label) { const node = nodes().find(n => n.type === 'button' && n.props.children === label); assert.ok(node); node.props.onClick(); render(); }
  render();
  return { calls, click, nodes,
    custom(value) { nodes().find(n => n.type === 'input').props.onChange({ target: { value } }); render(); },
    submit() { nodes().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); render(); },
  };
}

test('defaults to tomorrow; multi-selection submits once even with double Enter', () => {
  const h = harness(); h.click('9/18 周五'); h.submit(); h.submit();
  assert.deepEqual(h.calls, [['2026-09-17', '2026-09-18']]);
});
test('one click selects seven dates, custom dates work across months', () => {
  const h = harness(); h.click('这七天'); h.custom('2026-10-01'); h.click('加入'); h.submit();
  assert.equal(h.calls[0].length, 8); assert.equal(h.calls[0][7], '2026-10-01');
});
test('custom date is not lost when Enter is pressed without clicking Add', () => {
  const h = harness(); h.click('9/17 周四'); h.custom('2026-10-01'); h.submit();
  assert.deepEqual(h.calls, [['2026-10-01']]);
});
test('invalid/source dates are blocked; cancel never creates a copy', () => {
  const h = harness(); h.custom('2026-09-16'); h.submit(); assert.equal(h.calls.length, 0);
  assert.ok(h.nodes().some(n => n.props.role === 'alert'));
  h.click('取消'); assert.deepEqual(h.calls, ['close']);
});
