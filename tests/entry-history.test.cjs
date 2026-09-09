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

const { buildEntryHistory, historyEntryFields } = loadTs('components/todo/entryHistory.ts');
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
  const choices = buildEntryHistory(entries, [{ id: 'a', title: '学习' }, { id: 'b', title: '放松', archived: true }], [{ id: 'task-a', title: '读专业书' }, { id: 'task-b', title: '读论文' }], '2026-09-09');
  assert.deepEqual(choices.map(c => c.goalLabel), ['学习', '学习', '未归属目标', '学习', '放松（已归档）']);
  assert.deepEqual(choices.map(c => c.taskId), ['task-a', 'task-b', undefined, undefined, undefined]);
  assert.equal(choices[0].taskLabel, '读专业书');
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(historyEntryFields(choices[0]), { aspirationId: 'a', taskId: 'task-a', taskLinkMode: 'manual' });
  assert.deepEqual(historyEntryFields(choices[2]), { aspirationId: undefined, taskId: undefined, taskLinkMode: 'none' });
  assert.deepEqual(buildEntryHistory(entries, [], [], '2026-09-11'), []);
  assert.deepEqual(buildEntryHistory([], [], [], '2026-09-09'), []);
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
  timer = mount(records);
  timer.stop();
  assert.equal(records.length, 1);
  assert.equal(records[0].title, '阅读');
  assert.equal(records[0].aspirationId, 'b');
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
