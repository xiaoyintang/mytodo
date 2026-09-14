// Run: node --test tests/entry-history.test.cjs (no browser or extra dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => mocks[name] ?? (name.startsWith('.')
    ? loadTs(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name + '.ts')), mocks)
    : require(name));
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

const { buildEntryHistory, buildTimerChoices, reassignTaskEntries, historyEntryFields } = loadTs('components/todo/entryHistory.ts');
test('only today is shown; duplicates preserve distinct task and goal attribution', () => {
  const entries = [
    { id: '1', title: '阅读', date: '2026-09-08', aspirationId: 'a', minutes: 30 },
    { id: '2', title: '阅读', date: '2026-09-09', aspirationId: 'b', startTime: '10:00', minutes: 20 },
    { id: '3', title: ' 阅读 ', date: '2026-09-09', aspirationId: 'a', startTime: '11:00', minutes: 10 },
    { id: '4', title: '阅读', date: '2026-09-09', startTime: '12:00', minutes: 5 },
    { id: '5', title: '写作', date: '2026-09-07', aspirationId: 'deleted', minutes: 5 },
    { id: '6', title: '阅读', date: '2026-09-09', aspirationId: 'a', taskId: 'task-a', startTime: '14:00', minutes: 5 },
    { id: '7', title: '阅读', date: '2026-09-09', aspirationId: 'a', taskId: 'task-b', startTime: '13:00', minutes: 5 },
    { id: '8', title: '阅读', date: '2026-09-09', aspirationId: 'a', taskId: 'task-a', startTime: '15:00', minutes: 5 },
    { id: '9', title: '明天的事项', date: '2026-09-10', minutes: 5 },
  ];
  const before = JSON.stringify(entries);
  const choices = buildEntryHistory(entries, [{ id: 'a', title: '学习' }, { id: 'b', title: '放松', archived: true }], [{ id: 'task-a', title: '读专业书', aspirationId: 'a' }, { id: 'task-b', title: '读论文', aspirationId: 'a' }], '2026-09-09');
  assert.deepEqual(choices.map(c => c.goalLabel), ['学习', '学习', '未归属目标', '学习', '放松（已归档）']);
  assert.deepEqual(choices.map(c => c.taskId), ['task-a', 'task-b', undefined, undefined, undefined]);
  assert.equal(choices[0].taskLabel, '读专业书');
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(historyEntryFields(choices[0]), { aspirationId: 'a', taskId: 'task-a', taskLinkMode: 'manual' });
  assert.deepEqual(historyEntryFields(choices[2]), { aspirationId: undefined, taskId: undefined, taskLinkMode: 'none' });
  assert.deepEqual(buildEntryHistory(entries, [], [], '2026-09-11'), []);
  assert.deepEqual(buildEntryHistory([], [], [], '2026-09-09'), []);
});

test('timer offers today’s planned tasks without records and preserves distinct IDs for identical titles', () => {
  const today = '2026-09-14';
  const tasks = [
    { id: 'a', title: '阅读', aspirationId: 'new', date: today, status: 'todo' },
    { id: 'b', title: '阅读', date: today, status: 'done' },
    { id: 'c', title: '明天的事', date: '2026-09-15', status: 'todo' },
  ];
  const entries = [
    { id: 'e1', title: '阅读', date: today, taskId: 'a', aspirationId: 'old', minutes: 12 },
    { id: 'e2', title: '读第一章', date: today, taskId: 'a', aspirationId: 'old', minutes: 5 },
    { id: 'e3', title: '阅读', date: today, minutes: 3 },
    { id: 'e4', title: '昨天的记录', date: '2026-09-13', minutes: 3 },
  ];
  assert.equal(buildTimerChoices([], [], tasks, today).length, 2);
  const choices = buildTimerChoices(entries, [{ id: 'new', title: '新主线' }], tasks, today);
  assert.equal(choices.length, 5);
  assert.ok(choices.some(c => c.source === 'history' && c.taskId === 'a' && c.title === '阅读'));
  assert.deepEqual(choices.slice(0, 2).map(c => [c.taskId, c.source]), [['a', 'task'], ['b', 'task']]);
  assert.equal(choices[0].goalLabel, '新主线');
  assert.equal(choices.find(c => c.title === '读第一章').aspirationId, 'new');
  assert.deepEqual(historyEntryFields(choices[1]), { taskId: 'b', aspirationId: undefined, taskLinkMode: 'manual' });
});

test('changing a task goal updates all explicitly linked records, including removal, not same-title independent records', () => {
  const entries = [
    { id: 'e1', taskId: 'a', taskLinkMode: 'manual', aspirationId: 'old', date: '2026-09-01', title: '阅读', minutes: 12 },
    { id: 'e2', taskId: 'a', taskLinkMode: 'auto', aspirationId: 'old', date: '2026-09-14', title: '另一名称', minutes: 5 },
    { id: 'e3', aspirationId: 'old', title: '阅读', minutes: 3 },
    { id: 'e4', taskId: 'b', aspirationId: 'old', title: '阅读', minutes: 3 },
    { id: 'e5', taskId: 'a', taskLinkMode: 'none', aspirationId: 'old', title: '阅读', minutes: 3 },
  ];
  const before = JSON.stringify(entries);
  const changed = reassignTaskEntries(entries, { id: 'a', aspirationId: 'new' });
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(changed.map(e => e.aspirationId), ['new', 'new', 'old', 'old', 'old']);
  assert.deepEqual(changed[0], { ...entries[0], aspirationId: 'new' });
  assert.equal(changed[2], entries[2]);
  assert.equal(reassignTaskEntries(changed, { id: 'a', aspirationId: 'new' }), changed);
  const cleared = reassignTaskEntries(changed, { id: 'a' });
  assert.equal(cleared[0].aspirationId, undefined);
  assert.equal(cleared[0].taskId, 'a'); assert.equal(cleared[0].minutes, 12);
  assert.equal(JSON.parse(JSON.stringify(cleared))[0].aspirationId, undefined);
});

test('timer persists goal AND linked task without restarting; association survives reload and counts toward task', () => {
  let saved = null;
  global.window = { localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; } } };
  function mount(records) {
    const effects = [];
    const react = {
      useRef: value => ({ current: value }),
      useCallback: fn => fn,
      useState: value => [typeof value === 'function' ? value() : value, () => {}],
      useEffect: fn => effects.push(fn),
    };
    const { useTimer } = loadTs('components/todo/useTimer.ts', { react });
    const timer = useTimer(entry => records.push(entry));
    effects.forEach(fn => fn());
    return timer;
  }
  const records = [];
  let timer = mount(records);
  timer.start('正事');
  const startedAt = JSON.parse(saved).running.startedAt;
  timer.rename('阅读', startedAt, { aspirationId: 'a' });
  assert.equal(JSON.parse(saved).running.startedAt, startedAt);
  timer.rename('阅读', startedAt, { aspirationId: 'b', taskId: 'task-b' });
  assert.equal(JSON.parse(saved).running.attribution.aspirationId, 'b');
  const previous = saved;
  timer.rename('旧设备的草稿', startedAt - 1, { aspirationId: 'wrong' });
  assert.equal(saved, previous);
  // 同一任务换主线时仍是这一段计时，不重置起点、不丢失计入任务。
  timer.rename('阅读', startedAt, { aspirationId: 'new-goal', taskId: 'task-b' });
  assert.equal(JSON.parse(saved).running.startedAt, startedAt);
  assert.equal(JSON.parse(saved).running.attribution.taskId, 'task-b');
  timer = mount(records);
  timer.stop();
  assert.equal(records.length, 1);
  assert.equal(records[0].title, '阅读');
  assert.equal(records[0].aspirationId, 'new-goal');
  assert.equal(records[0].taskId, 'task-b');
  assert.equal(records[0].taskLinkMode, 'manual');
  const { taskLoggedMinutes } = loadTs('components/todo/time.ts');
  assert.equal(taskLoggedMinutes({ id: 'task-b', title: '名称不同的任务' }, records), records[0].minutes);
  timer.start('阅读');
  timer.rename('阅读', JSON.parse(saved).running.startedAt, {});
  timer = mount(records);
  timer.stop();
  assert.equal(records[1].aspirationId, undefined);
  assert.ok(Object.hasOwn(records[1], 'aspirationId'));
  assert.equal(records[1].taskLinkMode, 'none');
  timer.start('阅读');
  const nextStarted = JSON.parse(saved).running.startedAt;
  timer.rename('阅读', nextStarted, { aspirationId: 'a' });
  timer.rename('完全不同的事项', nextStarted);
  assert.equal(JSON.parse(saved).running.attribution, undefined);
  timer.rename('   ', nextStarted);
  assert.equal(JSON.parse(saved).running.title, '完全不同的事项');
  timer.stop();
  delete global.window;
});
