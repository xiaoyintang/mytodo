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
const { goalXp, levelOf, xpToNext, XP } = load('components/todo/goalXp.ts');

const empty = { tasks: [], habits: [], habitLogs: [], entries: [] };

test('xp comes only from existing data attributed to the goal', () => {
  const data = {
    tasks: [
      { id: 't1', title: '复盘', date: '2026-10-19', status: 'done', aspirationId: 'g',
        subtasks: [{ id: 's1', title: 'a', done: true }, { id: 's2', title: 'b', done: false }],
        startAction: { kind: 'minimum', title: '打开笔记', done: true } },
      { id: 't2', title: '杂事', date: '2026-10-19', status: 'done' },
      { id: 't3', title: '别的目标', date: '2026-10-19', status: 'done', aspirationId: 'other' },
    ],
    habits: [{ id: 'h', title: '俯卧撑', measure: 'count', aspirationId: 'g', createdAt: 1 }],
    habitLogs: [
      { id: 'l1', habitId: 'h', date: '2026-10-19', at: '08:00' },
      { id: 'l2', habitId: 'h', date: '2026-10-19', at: '09:00', taskId: 't1' },
    ],
    entries: [
      { id: 'e1', date: '2026-10-19', title: '复盘', minutes: 95, aspirationId: 'g' },
      { id: 'e2', date: '2026-10-19', title: '刷剧', minutes: 60 },
    ],
  };
  // task 10 + one step 3 + one start 3 + manual habit log 5 (task-linked log not double counted) + 95min → 9
  assert.equal(goalXp('g', data), XP.task + XP.step + XP.start + XP.habit + 9);
  assert.equal(goalXp('g', empty), 0);
});

test('levels get harder and never go negative', () => {
  assert.deepEqual(levelOf(0), { xp: 0, level: 1, into: 0, need: 60 });
  assert.equal(levelOf(59).level, 1);
  assert.deepEqual(levelOf(60), { xp: 60, level: 2, into: 0, need: 90 });
  assert.equal(levelOf(60 + 90).level, 3);
  assert.ok(xpToNext(10) > xpToNext(3));
});
