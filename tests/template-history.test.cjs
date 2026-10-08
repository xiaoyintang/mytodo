const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.')
    ? load(path.join(path.dirname(file), name + '.ts')) : require(name), mod, mod.exports);
  return mod.exports;
}
const { instantiateTemplateTasks } = load('components/todo/taskTemplate.ts');
const { undoTemplateBatch, restoreTemplateBatch } = load('components/todo/templateHistory.ts');
const { matchTaskByTitle } = load('components/todo/time.ts');
const date = '2026-10-08';
const template = { id: 'tpl', name: '日常', items: [
  { id: 'a', title: '阅读', aspirationId: 'g', resultId: 'kr', subtasks: [{ id: 'step', title: '打开书', done: false }], startAction: { kind: 'minimum', title: '翻开一页', done: false } },
  { id: 'b', title: '运动', startTime: '18:00', endTime: '19:00' },
] };

// Execute the production apply/undo handlers, with real template instantiation.
const source = ts.createSourceFile('TodoApp.tsx', fs.readFileSync(path.join(__dirname, '../components/TodoApp.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['applyTaskTemplate', 'toggleTemplateBatch'];
const declarations = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) declarations.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(declarations.length, names.length);
const code = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const handlers = new Function('ctx', `with (ctx) { ${code}; return {${names.join(',')}}; }`);
function harness(tasks = []) {
  const state = { tasks, templateBatches: [], entries: [], habitLogs: [], dayPlans: {}, timer: { running: null } };
  const ctx = { ...state, taskTemplates: [template], todayIso: date,
    hydrated: true, templatesHydrated: true, batchesHydrated: true, entriesHydrated: true, logsHydrated: true, plansHydrated: true,
    instantiateTemplateTasks, undoTemplateBatch, restoreTemplateBatch, matchTaskByTitle,
    setTasks: next => state.tasks = typeof next === 'function' ? next(state.tasks) : next,
    setTemplateBatches: next => state.templateBatches = typeof next === 'function' ? next(state.templateBatches) : next,
  };
  return { state, ctx, call(name, ...args) { return handlers({ ...ctx, ...state })[name](...args); } };
}

test('apply receipt includes only newly created tasks; undo/restore leaves existing tasks and template untouched', () => {
  const existing = { id: 'existing', title: '运动', date, startTime: '18:00', endTime: '19:00', status: 'todo' };
  const h = harness([existing]);
  const beforeTemplate = structuredClone(template);
  assert.deepEqual(h.call('applyTaskTemplate', 'tpl', ['a', 'b'], date), { created: 1, skipped: 1 });
  const batch = h.state.templateBatches[0];
  assert.equal(batch.tasks.length, 1);
  const original = structuredClone(h.state.tasks);
  // Refresh serialization must preserve undo comparisons, including absent optional fields.
  h.state.tasks = JSON.parse(JSON.stringify(h.state.tasks));
  h.state.templateBatches = JSON.parse(JSON.stringify(h.state.templateBatches));
  h.call('toggleTemplateBatch', batch.id);
  assert.deepEqual(h.state.tasks, [existing]);
  h.call('toggleTemplateBatch', batch.id);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.tasks)), JSON.parse(JSON.stringify(original)));
  assert.deepEqual(template, beforeTemplate);
});

test('separate applications and dates undo independently; duplicate-only apply does not overwrite receipt', () => {
  const h = harness();
  h.call('applyTaskTemplate', 'tpl', ['a'], date);
  const first = h.state.templateBatches[0];
  h.call('applyTaskTemplate', 'tpl', ['b'], date);
  h.call('applyTaskTemplate', 'tpl', ['a', 'b'], '2026-10-09');
  const other = h.state.tasks.filter(task => !first.tasks.some(t => t.id === task.id));
  assert.deepEqual(h.call('applyTaskTemplate', 'tpl', ['a'], date), { created: 0, skipped: 1 });
  assert.equal(h.state.templateBatches.length, 3);
  h.call('toggleTemplateBatch', first.id);
  assert.deepEqual(h.state.tasks, other);
});

test('undo protects edits, progress, checked steps, task records, live timer, habit logs and daily focus', () => {
  const changes = [
    (h, task) => task.title = '改过名称',
    (h, task) => task.date = '2026-10-09',
    (h, task) => task.status = 'done',
    (h, task) => task.progress = 10,
    (h, task) => task.subtasks[0].done = true,
    (h, task) => task.startAction.done = true,
    (h, task) => h.state.entries = [{ taskId: task.id }],
    (h, task) => h.state.entries = [{ title: task.title, date }],
    (h, task) => h.state.timer.running = { title: '专注', attribution: { taskId: task.id } },
    (h, task) => h.state.habitLogs = [{ taskId: task.id }],
    (h, task) => h.state.dayPlans = { [date]: { mustDoTaskId: task.id } },
  ];
  for (const change of changes) {
    const h = harness(); h.call('applyTaskTemplate', 'tpl', ['a', 'b'], date);
    // Real React updates create new objects rather than mutating receipt snapshots.
    h.state.tasks = structuredClone(h.state.tasks);
    change(h, h.state.tasks[0]);
    const expected = structuredClone(h.state.tasks[0]);
    h.call('toggleTemplateBatch', h.state.templateBatches[0].id);
    assert.deepEqual(h.state.tasks, [expected]);
    assert.match(h.state.templateBatches[0].notice, /保留 1 项/);
  }
});

test('redo never duplicates a re-applied template or resurrects an independently deleted task', () => {
  const h = harness(); h.call('applyTaskTemplate', 'tpl', ['a', 'b'], date);
  const first = h.state.templateBatches[0];
  h.state.tasks = h.state.tasks.filter(t => t.title !== '运动');
  h.call('toggleTemplateBatch', first.id);
  h.call('applyTaskTemplate', 'tpl', ['a'], date);
  const reapplied = structuredClone(h.state.tasks);
  h.call('toggleTemplateBatch', first.id);
  assert.deepEqual(h.state.tasks, reapplied);
});

test('batch notice exposes accessible undo and restore, and protects empty receipts', () => {
  const Component = load('components/TemplateBatchNotice.tsx').default;
  function flatten(n) { return Array.isArray(n) ? n.flatMap(flatten) : n && typeof n === 'object' ? [n, ...flatten(n.props?.children)] : []; }
  const tasks = instantiateTemplateTasks(template, ['a'], date, []).tasks;
  const calls = [];
  for (const removed of [undefined, tasks, []]) {
    const tree = Component({ batches: [{ id: 'batch', name: '日常', date, tasks, removed }], onToggle: id => calls.push(id) });
    const button = flatten(tree).find(n => n.type === 'button');
    assert.equal(button.props.disabled, removed?.length === 0);
    assert.match(button.props['aria-label'], removed ? /恢复模板/ : /撤回模板/);
    assert.ok(button.props.className.includes('min-h-11'));
    if (!button.props.disabled) button.props.onClick();
  }
  assert.deepEqual(calls, ['batch', 'batch']);
});

test('receipt history is bounded and template application waits for local hydration', () => {
  const h = harness();
  h.ctx.batchesHydrated = false;
  assert.deepEqual(h.call('applyTaskTemplate', 'tpl', ['a'], date), { created: 0, skipped: 0 });
  assert.equal(h.state.tasks.length, 0);
  h.ctx.batchesHydrated = true;
  for (let day = 1; day <= 25; day++) h.call('applyTaskTemplate', 'tpl', ['a'], `2026-10-${String(day).padStart(2, '0')}`);
  assert.equal(h.state.templateBatches.length, 20);
  assert.equal(h.state.tasks.length, 25);
});
