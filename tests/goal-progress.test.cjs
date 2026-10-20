const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}
const { goalItems, goalProgress, reorderGoalItems, goalRetro } = load('components/todo/goalProgress.ts');

const goal = { id: 'r1', aspirationId: 'g', title: '准备面试', createdAt: Date.parse('2026-10-10T09:00:00') };
const card = (id, text, extra = {}) => ({ id, aspirationId: 'g', resultId: 'r1', text, type: 'onetime', createdAt: 1, ...extra });
const task = (id, title, extra = {}) => ({ id, title, date: '2026-10-20', status: 'todo', aspirationId: 'g', ...extra });

test('checklist = planned one-off items + tasks pointed at the goal; habits and repeatables excluded', () => {
  const behaviors = [
    card('b1', '整理增长问题答复', { createdAt: 1, taskId: 't1' }),
    card('b2', '模拟面试一次', { createdAt: 2 }),
    card('b3', '每天刷 2 题', { type: 'habit' }),
    card('b4', '旧的', { archived: true }),
  ];
  const tasks = [
    task('t1', '整理增长问题答复', { sourceBehaviorId: 'b1', status: 'done', completedAt: 100 }),
    task('t2', '复盘项目细节', { resultId: 'r1', date: '2026-10-19', status: 'done' }),
    task('t3', '复盘项目细节', { resultId: 'r1', date: '2026-10-20' }),
    task('t4', '刷题', { resultId: 'r1', sourceBehaviorId: 'b3' }),
    task('t5', '俯卧撑', { resultId: 'r1', sourceHabitId: 'h' }),
  ];
  const items = goalItems(goal, behaviors, tasks);
  assert.deepEqual(items.map(i => i.title), ['整理增长问题答复', '模拟面试一次', '复盘项目细节']);
  assert.equal(items[2].tasks.length, 2, 'same-title tasks are one item done in several sessions');
  assert.equal(items[2].done, false, 'item is done only when every session is done');
  const progress = goalProgress(items);
  assert.equal(progress.done, 1); assert.equal(progress.total, 3);
  assert.equal(progress.next.title, '模拟面试一次');
});

test('manual order wins and reorder returns the full key list', () => {
  const behaviors = [card('b1', 'A', { createdAt: 1 }), card('b2', 'B', { createdAt: 2 }), card('b3', 'C', { createdAt: 3 })];
  const items = goalItems(goal, behaviors, []);
  const order = reorderGoalItems(items, 'b3', 'b1', 'before');
  assert.deepEqual(order, ['b3', 'b1', 'b2']);
  assert.deepEqual(goalItems({ ...goal, itemOrder: order }, behaviors, []).map(i => i.title), ['C', 'A', 'B']);
});

test('retro uses completion times, time invested and marks legacy rows approximate', () => {
  const behaviors = [card('b1', 'A', { createdAt: goal.createdAt + 1000, taskId: 't1' })];
  const tasks = [
    task('t1', 'A', { sourceBehaviorId: 'b1', status: 'done', completedAt: Date.parse('2026-10-15T20:00:00') }),
    task('t2', 'B', { resultId: 'r1', status: 'done', date: '2026-10-12' }),
  ];
  const entries = [{ id: 'e', date: '2026-10-15', title: 'A', minutes: 90, taskId: 't1' }, { id: 'x', date: '2026-10-15', title: '刷剧', minutes: 60 }];
  const items = goalItems(goal, behaviors, tasks);
  const retro = goalRetro(goal, items, entries, behaviors);
  assert.equal(retro.minutes, 90);
  assert.deepEqual(retro.timeline.map(r => [r.title, r.approximate]), [['B', true], ['A', false]]);
  assert.equal(retro.days, 6, '10/10 → 10/15 inclusive');
});
