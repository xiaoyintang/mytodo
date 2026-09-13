const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(file, react) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name === 'react' && react ? react : require(name), module, module.exports);
  return module.exports;
}
const { dailyFocusTask, setDailyFocus, clearDailyFocus, moveDailyFocus } = load('components/todo/dailyFocus.ts');
const date = '2026-09-13', tomorrow = '2026-09-14';
const tasks = [{ id: 'a', title: '答复提纲', date, status: 'todo', startTime: '15:00' },
  { id: 'b', title: '写周报', date, status: 'todo' }, { id: 'c', title: '明天的事', date: tomorrow, status: 'todo' }];

test('one optional focus per date; replacement/cancel do not modify mainlines, tasks or other dates', () => {
  const initial = { [date]: { date, primaryAspirationIds: ['g1'] } };
  assert.equal(dailyFocusTask(date, initial, tasks), undefined);
  const tomorrowPlan = setDailyFocus(initial, tomorrow, 'c', tasks);
  const selected = setDailyFocus(tomorrowPlan, date, 'a', tasks);
  assert.equal(dailyFocusTask(date, selected, tasks), tasks[0]);
  const replaced = setDailyFocus(selected, date, 'b', tasks);
  assert.equal(replaced[date].mustDoTaskId, 'b');
  assert.equal(replaced[tomorrow], selected[tomorrow]);
  assert.deepEqual(replaced[date].primaryAspirationIds, ['g1']);
  assert.equal(tasks[0].startTime, '15:00'); assert.equal(tasks.length, 3);
  const cancelled = setDailyFocus(replaced, date, null, tasks);
  assert.equal(dailyFocusTask(date, cancelled, tasks), undefined);
  assert.equal(cancelled[tomorrow].mustDoTaskId, 'c');
});

test('old data and deleted/moved references are safe; completed focus stays visible across persistence', () => {
  const plans = setDailyFocus({}, date, 'a', tasks);
  assert.equal(setDailyFocus(plans, date, 'c', tasks), plans);
  assert.equal(setDailyFocus(plans, date, 'missing', tasks), plans);
  assert.equal(dailyFocusTask(date, plans, tasks.slice(1)), undefined);
  assert.equal(dailyFocusTask(tomorrow, { [tomorrow]: plans[date] }, tasks), undefined);
  const persisted = JSON.parse(JSON.stringify({ plans, tasks: tasks.map(t => t.id === 'a' ? { ...t, status: 'done' } : t) }));
  assert.equal(dailyFocusTask(date, persisted.plans, persisted.tasks).status, 'done');
  assert.equal(clearDailyFocus(plans, 'other'), plans);
  assert.equal(clearDailyFocus(plans, 'a')[date].mustDoTaskId, undefined);
});

test('rescheduling clears old focus without claiming destination; undo restores unless user made a newer choice', () => {
  const plans = setDailyFocus(setDailyFocus({}, date, 'a', tasks), tomorrow, 'c', tasks);
  const moved = moveDailyFocus(plans, tasks[0], tomorrow);
  assert.equal(moved[date].mustDoTaskId, undefined);
  assert.equal(moved[tomorrow].mustDoTaskId, 'c');
  const restored = moveDailyFocus(moved, { ...tasks[0], date: tomorrow }, date, true);
  assert.equal(restored[date].mustDoTaskId, 'a');
  const newer = setDailyFocus(moved, date, 'b', tasks);
  assert.equal(moveDailyFocus(newer, { ...tasks[0], date: tomorrow }, date, true)[date].mustDoTaskId, 'b');
  assert.equal(moveDailyFocus(plans, tasks[0], date), plans);
});

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== 'object') return [];
  return [node, ...flatten(node.props?.children)];
}
test('picker searches only that day’s unfinished alternatives, selects once and can cancel designation', () => {
  const state = []; let cursor = 0; let selected; let tree;
  const react = { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => state[i] = v]; } };
  const Component = load('components/DailyFocusSection.tsx', react).default;
  function render(task) { cursor = 0; tree = Component({ task, tasks: tasks.filter(t => t.date === date), aspirations: [], isToday: false, onSelect: id => selected = id }); }
  render();
  flatten(tree).find(n => n.type === 'button' && n.props.children === '选一件').props.onClick(); render();
  const search = flatten(tree).find(n => n.type === 'input'); search.props.onChange({ target: { value: '周报' } }); render();
  const choices = flatten(tree).filter(n => n.type === 'button' && n.key);
  assert.equal(choices.length, 1); assert.equal(choices[0].key, 'b');
  choices[0].props.onClick(); assert.equal(selected, 'b');
  render(tasks[1]); assert.equal(flatten(tree).some(n => n.type === 'input'), false);
  flatten(tree).find(n => n.props['aria-label'] === '取消关键任务').props.onClick(); assert.equal(selected, null);
  render({ ...tasks[1], status: 'done' });
  assert.ok(JSON.stringify(tree).includes('已完成'));
});
