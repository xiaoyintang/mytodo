const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, react) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react;
    if (name.startsWith('@/components/todo/')) return load(name.slice(2) + '.ts', react);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : !node || typeof node !== 'object' ? [] : [node, ...flatten(node.props?.children)];
const original = { id: 'b', aspirationId: 'identity', resultId: 'state', text: '每日做正事4小时', type: 'onetime', typeSource: 'ai',
  reason: '一次做完', blocker: 'endpoint', checkedAs: 'outcome', impact: 80, feasibility: 60,
  steps: [{ id: 's', title: '打开文档' }], taskId: 'task', startAction: { title: '先坐下', kind: 'minimum' } };

// 直接执行 TodoApp 的现有处理函数，验证 UI 调用的实际写入和 AI 防覆盖，而不是另写一套逻辑。
function handlers() {
  const file = ts.createSourceFile('TodoApp.tsx', fs.readFileSync(path.join(root, 'components/TodoApp.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && ['setBehaviorType', 'applyJudgements'].includes(node.name?.text)) declarations.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(declarations.length, 2);
  let cards = [structuredClone(original)], snapshots = [];
  const code = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const actions = new Function('setBehaviorCards', 'snapshotLab', code + '\nreturn {setBehaviorType, applyJudgements};')(
    update => { cards = update(cards); }, () => snapshots.push(structuredClone(cards)),
  );
  return { ...actions, cards: () => cards, undo: () => { cards = snapshots.pop(); } };
}

test('manual correction preserves the parent, steps, scores and task; AI rejudge/late response cannot overwrite it', () => {
  const h = handlers();
  h.setBehaviorType('b', 'habit');
  const corrected = h.cards()[0];
  assert.deepEqual(corrected, { ...original, type: 'habit', typeSource: 'user', reason: undefined, blocker: undefined, checkedAs: undefined, hasDecision: undefined });
  h.applyJudgements([{ id: 'b', type: 'onetime', reason: '迟到的 AI 结果', text: '改写', steps: ['一', '二'] }]);
  assert.equal(h.cards()[0], corrected);
  assert.equal(JSON.parse(JSON.stringify(corrected)).typeSource, 'user');
  h.undo(); h.undo();
  assert.deepEqual(h.cards()[0], original);
});

test('misplaced type label opens accessible choices, allows cancel, and corrects without moving or creating a habit', () => {
  let cursor = 0; const slots = [];
  const react = { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
    return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; } };
  const Component = load('components/IdentityOverview.tsx', react).default;
  const h = handlers(); const calls = [];
  const props = { goals: [], states: [], tasks: [], habits: [], archivedGoals: [], archivedStates: [], color: '#2563eb', unsortedCount: 0, mapFor: null,
    onSetBehaviorType: (id, type) => { calls.push([id, type]); h.setBehaviorType(id, type); },
    onPlace: () => assert.fail('correction must not move the card'), onCreate: () => assert.fail('correction must not create a goal'),
  };
  const render = () => {
    cursor = 0;
    const card = h.cards()[0];
    return flatten(Component({ ...props, cards: [card], misplaced: card.type === 'onetime' ? [{ type: 'item', cardId: card.id, title: card.text }] : [] }));
  };
  let nodes = render();
  const label = () => nodes.find(n => n.props['aria-label'] === `修改「${original.text}」的行为类型`);
  label().props.onClick(); nodes = render();
  assert.equal(label().props['aria-expanded'], true);
  assert.ok(nodes.some(n => n.props.role === 'group'));
  nodes.find(n => n.type === 'button' && n.props.children === '取消').props.onClick(); nodes = render();
  assert.equal(label().props['aria-expanded'], false); assert.equal(calls.length, 0);
  label().props.onClick(); nodes = render();
  nodes.find(n => n.type === 'button' && n.props.children === '可重复行为').props.onClick(); nodes = render();
  assert.deepEqual(calls, [['b', 'habit']]);
  assert.ok(!nodes.some(n => n.props['aria-label'] === '待整理'));
  assert.equal(h.cards()[0].resultId, 'state');
});
