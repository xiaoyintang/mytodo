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
test('history sorts by date/time, deduplicates only within the same goal, and keeps attribution snapshots', () => {
  const entries = [
    { id: '1', title: '阅读', date: '2026-09-08', aspirationId: 'a', minutes: 30 },
    { id: '2', title: '阅读', date: '2026-09-09', aspirationId: 'b', startTime: '10:00', minutes: 20 },
    { id: '3', title: ' 阅读 ', date: '2026-09-09', aspirationId: 'a', startTime: '11:00', minutes: 10 },
    { id: '4', title: '阅读', date: '2026-09-09', startTime: '12:00', minutes: 5 },
    { id: '5', title: '写作', date: '2026-09-07', aspirationId: 'deleted', minutes: 5 },
  ];
  const before = JSON.stringify(entries);
  const choices = buildEntryHistory(entries, [{ id: 'a', title: '学习' }, { id: 'b', title: '放松', archived: true }]);
  assert.deepEqual(choices.map(c => c.goalLabel), ['未归属目标', '学习', '放松（已归档）', '原目标已删除']);
  assert.equal(choices[3].aspirationId, 'deleted');
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(historyEntryFields(choices[1]), { aspirationId: 'a', taskId: undefined, taskLinkMode: 'none' });
  assert.deepEqual(buildEntryHistory([], []), []);
});

test('timer selection persists goal without restarting; same-title goal changes and explicit unassigned survive reload', () => {
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
  timer.rename('阅读', startedAt, { aspirationId: 'b' });
  assert.equal(JSON.parse(saved).running.attribution.aspirationId, 'b');
  const previous = saved;
  timer.rename('旧设备的草稿', startedAt - 1, { aspirationId: 'wrong' });
  assert.equal(saved, previous);
  timer = mount(records);
  timer.stop();
  assert.equal(records.length, 1);
  assert.equal(records[0].title, '阅读');
  assert.equal(records[0].aspirationId, 'b');
  assert.equal(records[0].taskId, undefined);
  assert.equal(records[0].taskLinkMode, 'none');
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
