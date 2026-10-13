const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(
  fs.readFileSync(require.resolve('../components/todo/weekOverview.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText)(require, mod, mod.exports);
const { buildWeekOverview } = mod.exports;
const dates = ['2026-10-12', '2026-10-13', '2026-10-14'];
const task = (id, extra = {}) => ({ id, title: id, date: dates[0], status: 'todo', ...extra });
const ids = tasks => tasks.map(t => t.id);

test('weekly focus outranks high priority, then current-day non-routine mainline; ordinary life stays accessible', () => {
  const tasks = [task('ordinary'), task('mainline', { aspirationId: 'g' }), task('high', { priority: 'high' }),
    task('focus', { title: '陪爸妈吃饭', sourceTemplateId: 'template', status: 'done' }),
    task('routine', { aspirationId: 'g', sourceHabitId: 'h' }), task('other-day', { date: dates[1], aspirationId: 'g' })];
  const before = structuredClone(tasks);
  const overview = buildWeekOverview(tasks, dates, { [dates[0]]: { mustDoTaskId: 'focus' } }, { [dates[0]]: ['g'] }, []);
  assert.deepEqual(ids(overview.days[0].important), ['focus', 'high', 'mainline']);
  assert.deepEqual(ids(overview.days[0].routine), ['routine']);
  assert.deepEqual(ids(overview.days[0].other), ['ordinary']);
  assert.equal(overview.days[1].important.length, 0);
  assert.equal(overview.days.flatMap(d => d.all).length, tasks.length);
  assert.deepEqual(tasks, before);
});

test('source-linked repetition is grouped across days but same-name manual tasks are never merged', () => {
  const tasks = [task('a', { sourceBehaviorId: 'b', aspirationId: 'g' }), task('b', { title: 'a', sourceBehaviorId: 'b', aspirationId: 'g', date: dates[1] }),
    task('manual1', { title: '阅读', aspirationId: 'g' }), task('manual2', { title: '阅读', aspirationId: 'g', date: dates[1] })];
  const overview = buildWeekOverview(tasks, dates, {}, Object.fromEntries(dates.map(d => [d, ['g']])), []);
  assert.deepEqual(ids(overview.important), ['manual1', 'manual2']);
  assert.equal(overview.routines.length, 1); assert.deepEqual(ids(overview.routines[0].tasks), ['a', 'b']);
});

test('habit/template/known recurring behavior folds even once; one-time behavior remains a mainline focus', () => {
  const tasks = [task('habit', { sourceHabitId: 'h' }), task('template', { sourceTemplateId: 't', sourceTemplateItemId: 'i' }),
    task('repeat', { sourceBehaviorId: 'b' }), task('one', { sourceBehaviorId: 'one' })].map(t => ({ ...t, aspirationId: 'g' }));
  const overview = buildWeekOverview(tasks, dates, {}, { [dates[0]]: ['g'] }, [{ id: 'b', type: 'habit' }, { id: 'one', type: 'onetime' }]);
  assert.deepEqual(ids(overview.important), ['one']); assert.equal(overview.routines.length, 3);
});

test('priority overrides folding; stale focus IDs, dates outside week, changed titles/ownership stay safe', () => {
  const tasks = [task('a', { sourceHabitId: 'h', priority: 'high' }), task('b', { title: 'a', sourceHabitId: 'h', date: dates[1] }),
    task('c', { title: 'changed', sourceHabitId: 'h' }), task('d', { title: 'a', sourceHabitId: 'h', aspirationId: 'other' }),
    task('outside', { date: '2026-10-19', priority: 'high' })];
  const overview = buildWeekOverview(tasks, dates, { [dates[0]]: { mustDoTaskId: 'b' } }, {}, []);
  assert.deepEqual(ids(overview.important), ['a']);
  assert.equal(overview.routines.length, 3);
  for (const day of overview.days) {
    const partition = [...day.important, ...day.routine, ...day.other];
    assert.equal(new Set(ids(partition)).size, day.all.length);
  }
  assert.equal(overview.days.flatMap(d => d.all).length, 4);
});

test('week boundaries cross months/years and empty days are retained', () => {
  const days = ['2026-12-31', '2027-01-01', '2027-01-02'];
  const overview = buildWeekOverview([task('newyear', { date: days[1], priority: 'high' })], days, {}, {}, []);
  assert.deepEqual(overview.days.map(d => d.all.length), [0, 1, 0]);
});
