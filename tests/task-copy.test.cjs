const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../components/todo/taskCopy.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText)(require, mod, mod.exports);
const { copyTaskToDates, validCopyDate } = mod.exports;
function source() { return {
  id: 'original', title: '面试准备', date: '2026-09-16', status: 'in_progress', progress: 45,
  aspirationId: 'goal', resultId: 'kr', sourceBehaviorId: 'behavior', sourceHabitId: 'habit',
  sourceTemplateId: 'template', sourceTemplateItemId: 'item', startTime: '10:00', endTime: '11:00',
  priority: 'high', tag: '学习', notes: [{ id: 'note', text: '历史随记' }],
  subtasks: [
    { id: 'a', title: '第一步', done: true, sourceBehaviorStepId: 'ba', startAction: { kind: 'minimum', title: '打开文档', done: true, targetStepId: 'a' } },
    { id: 'b', title: '第二步', done: false, startAction: { kind: 'minimum', title: '写一个词', done: false, targetStepId: 'b' } },
  ], startAction: { kind: 'minimum', title: '开始第二步', targetStepId: 'b', done: false },
}; }

test('copies structure, every minimum start, checked steps and current manual progress', () => {
  const original = source(), before = structuredClone(original);
  let serial = 0;
  const copies = copyTaskToDates(original, ['2026-09-17', '2026-09-18'], () => String(++serial));
  assert.equal(copies.length, 2);
  for (const c of copies) {
    for (const field of ['title', 'aspirationId', 'resultId', 'sourceBehaviorId', 'sourceHabitId', 'sourceTemplateId', 'sourceTemplateItemId', 'startTime', 'endTime', 'priority', 'tag', 'progress']) assert.equal(c[field], original[field]);
    assert.equal(c.status, 'todo'); assert.equal(c.notes, undefined);
    assert.deepEqual(c.subtasks.map(s => s.done), [true, false]);
    assert.equal(c.subtasks[0].startAction.done, true);
    assert.equal(c.subtasks[1].startAction.title, '写一个词');
    assert.equal(c.subtasks[0].sourceBehaviorStepId, 'ba');
    assert.equal(c.startAction.targetStepId, c.subtasks[1].id);
    for (const step of c.subtasks) assert.equal(step.startAction.targetStepId, step.id);
  }
  assert.equal(new Set(copies.flatMap(c => [c.id, ...c.subtasks.map(s => s.id)])).size, 6);
  copies[0].subtasks[0].startAction.title = '已修改';
  copies[0].subtasks[0].done = false;
  assert.equal(copies[1].subtasks[0].done, true);
  assert.equal(copies[1].subtasks[0].startAction.title, '打开文档');
  assert.deepEqual(original, before);
});

test('deduplicates selected dates, rejects invalid/source dates, supports crossing year', () => {
  const copies = copyTaskToDates(source(), ['2026-09-16', '2026-09-17', '2026-09-17', '2026-02-30', '2027-01-01']);
  assert.deepEqual(copies.map(c => c.date), ['2026-09-17', '2027-01-01']);
  assert.equal(validCopyDate('2024-02-29'), true);
  for (const date of ['2026-02-29', '2026-13-01', '', '2026-9-2']) assert.equal(validCopyDate(date), false);
});

test('legacy tasks and whole-task minimum starts remain compatible; completed tasks are reopened', () => {
  const [c] = copyTaskToDates({ id: 'old', title: '读书', date: '2026-09-16', status: 'done', tag: '已完成', startAction: { kind: 'minimum', title: '打开书', done: true } }, ['2026-09-17']);
  assert.equal(c.status, 'todo'); assert.equal(c.progress, 100); assert.equal(c.tag, undefined);
  assert.equal(c.subtasks, undefined); assert.equal(c.startAction.title, '打开书'); assert.equal(c.startAction.done, true);
  assert.equal(c.startAction.targetStepId, undefined);
});

test('duration target retained without creating or carrying time records', () => {
  const [c] = copyTaskToDates({ id: 'duration', title: '练习', date: '2026-09-16', status: 'done', targetMinutes: 60 }, ['2026-09-17']);
  assert.equal(c.targetMinutes, 60); assert.equal(c.progress, undefined); assert.equal(c.status, 'todo');
  assert.notEqual(c.id, 'duration'); assert.equal(c.minutes, undefined);
});
