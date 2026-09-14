const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  return node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];
}

test('source selectors clearly separate tasks/history and preserve selected task attribution', () => {
  const slots = []; let cursor = 0; let picked; let tree;
  const react = { useId: () => 'choices', useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => slots[i] = v]; } };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/EntryNameInput.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : require(name), module, module.exports);
  const task = { title: '阅读', source: 'task', taskId: 't1', aspirationId: 'g1', goalLabel: '学习' };
  const historical = { ...task, source: 'history' };
  const history = [task, historical, { title: '散步', source: 'history', goalLabel: '健康' }];
  function render() { cursor = 0; tree = module.exports.default({ history, value: '', label: '名称', onChange() {}, onSelect: item => picked = item }); }
  render(); flatten(tree).find(n => n.type === 'input').props.onFocus({ currentTarget: { select() {} } }); render();
  const options = () => flatten(tree).filter(n => n.props.role === 'option');
  assert.equal(options().length, 1);
  const historyTab = flatten(tree).find(n => n.type === 'button' && n.key === 'history');
  assert.ok(historyTab); historyTab.props.onClick(); render();
  assert.equal(options().length, 2);
  assert.equal(flatten(tree).find(n => n.type === 'input').props['aria-activedescendant'], undefined);
  options()[0].props.onClick(); assert.equal(picked, historical);
  assert.equal(picked.taskId, 't1'); assert.equal(picked.aspirationId, 'g1');
  render(); assert.equal(options().length, 0);
});
