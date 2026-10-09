const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => mocks[name] ?? (name.startsWith('.')
    ? load(path.join(path.dirname(file), name + '.ts'), mocks)
    : name.startsWith('@/components/todo/') ? load(name.slice(2) + '.ts', mocks) : require(name)), module, module.exports);
  return module.exports;
}
const { changeTimerStart, timerStartTimestamp } = load('components/todo/timerStart.ts');
const { configureReward, DEFAULT_REWARD, rewardProgress, stopTimer, beginReward } = load('components/todo/timerReward.ts');
const minute = 60000, now = new Date(2026, 9, 9, 16, 10).getTime();
const initial = () => ({ running: { title: '阅读', startedAt: now, attribution: { taskId: 'task', aspirationId: 'goal' } }, updatedAt: now });

test('backdating preserves attribution and stopping records the full adjusted time once', () => {
  const original = initial(), next = changeTimerStart(original, now, now - 10 * minute, now);
  assert.equal(next.running.startedAt, now - 10 * minute);
  assert.deepEqual(next.running.attribution, original.running.attribution);
  assert.equal(original.running.startedAt, now);
  assert.ok(next.updatedAt > original.updatedAt);
  const stopped = stopTimer(next, now + 5 * minute);
  assert.equal(stopped.entry.minutes, 15);
  assert.equal(stopped.entry.startTime, '16:00'); assert.equal(stopped.entry.endTime, '16:15');
  assert.equal(stopped.entry.taskId, 'task'); assert.equal(stopped.entry.aspirationId, 'goal');
});

test('invalid/future/stale requests do nothing; explicit dates handle midnight and invalid dates', () => {
  const state = initial();
  for (const invalid of [NaN, Infinity, now + 1, 1e20]) assert.equal(changeTimerStart(state, now, invalid, now), state);
  assert.equal(changeTimerStart(state, now - 1, now - minute, now), state);
  assert.equal(changeTimerStart(state, now, now, now), state);
  assert.equal(timerStartTimestamp('2026-02-30', '12:00'), null);
  for (const time of ['24:00', '12:60', '', 'abc']) assert.equal(timerStartTimestamp('2026-10-09', time), null);
  const midnight = timerStartTimestamp('2026-10-09', '00:10');
  const yesterday = timerStartTimestamp('2026-10-08', '23:50');
  const adjusted = changeTimerStart({ running: { title: '阅读', startedAt: midnight }, updatedAt: midnight }, midnight, yesterday, midnight);
  const stopped = stopTimer(adjusted, midnight);
  assert.equal(stopped.entry.minutes, 20); assert.equal(stopped.entry.date, '2026-10-09');
  assert.equal(stopped.entry.dateAnchor, 'end'); assert.equal(stopped.entry.startTime, '23:50');
});

test('adjustment keeps active reward/focus linkage and previously credited focus time', () => {
  const state = configureReward(initial(), DEFAULT_REWARD, now);
  state.reward.creditedMs = 5 * minute;
  const adjusted = changeTimerStart(state, now, now - 25 * minute, now);
  assert.equal(adjusted.reward.id, state.reward.id);
  assert.equal(adjusted.reward.creditedMs, 5 * minute);
  assert.equal(rewardProgress(adjusted, now).ready, true);
  const claimed = beginReward(adjusted, now);
  assert.equal(claimed.entry.minutes, 25);
  const changedReward = changeTimerStart(claimed.state, now, now - 3 * minute, now);
  assert.equal(rewardProgress(changedReward, now).rewardMs, 3 * minute);
  assert.equal(stopTimer(changedReward, now).entry.category, '娱乐');
  assert.equal(stopTimer(changedReward, now).entry.taskId, undefined);
});

test('hook updates live elapsed time, persists across reload and sync, and emits no record until stop', () => {
  const realNow = Date.now, originalWindow = global.window;
  Date.now = () => now;
  const storage = new Map(), records = [];
  global.window = { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  function mount() {
    const slots = []; let cursor = 0, first = true; const effects = [];
    const react = { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], v => slots[i] = typeof v === 'function' ? v(slots[i]) : v]; },
      useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); }, useCallback: fn => fn,
      useEffect(fn, deps) { if (first && deps?.length === 0) effects.push(fn); } };
    const { useTimer } = load('components/todo/useTimer.ts', { react });
    const render = () => { cursor = 0; return useTimer(entry => records.push(entry)); };
    render(); effects.forEach(fn => fn()); first = false;
    return render;
  }
  try {
    let render = mount(), timer = render(); timer.start('阅读'); timer = render();
    timer.rename('阅读', now, { taskId: 'task', aspirationId: 'goal' }); timer = render();
    assert.equal(timer.adjustStart(now - 10 * minute, now), true); timer = render();
    assert.equal(timer.elapsedMs, 10 * minute); assert.equal(records.length, 0);
    render = mount(); timer = render(); assert.equal(timer.elapsedMs, 10 * minute);
    assert.equal(timer.running.attribution.taskId, 'task');
    const previous = JSON.parse(storage.get('mytodo.timer.v1'));
    timer.adopt({ running: { title: '新的计时', startedAt: now - minute }, updatedAt: previous.updatedAt + 1 });
    assert.equal(timer.adjustStart(now - 20 * minute, now - 10 * minute), false);
    timer.stop(); assert.equal(records.length, 1); assert.equal(records[0].title, '新的计时');
    assert.equal(timer.adjustStart(now - 20 * minute, now - minute), false);
  } finally { Date.now = realNow; global.window = originalWindow; }
});

test('editor opens from the start label, supports ten-minute shortcut, explicit dates, cancel and save', () => {
  const state = []; let cursor = 0, tree; const calls = [];
  const react = { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial;
    return [state[i], value => state[i] = value]; } };
  const Component = load('components/TimerStartEditor.tsx', { react, '@/components/TimePicker': { default: 'TimePicker' } }).default;
  const old = new Date(2026, 0, 1, 0, 5).getTime();
  const props = { startedAt: old, onAdjust: (...args) => { calls.push(args); return true; } };
  const flatten = n => Array.isArray(n) ? n.flatMap(flatten) : n && typeof n === 'object' ? [n, ...flatten(n.props.children)] : [];
  const render = () => { cursor = 0; tree = Component(props); };
  const nodes = () => flatten(tree);
  const click = text => { nodes().find(n => n.type === 'button' && n.props.children === text).props.onClick(); render(); };
  const open = () => { nodes().find(n => n.type === 'button' && n.props['aria-label'] === '调整计时开始时间').props.onClick(); render(); };
  render(); open(); click('提前 10 分钟');
  assert.equal(nodes().find(n => n.type === 'input').props.value, '2025-12-31');
  assert.equal(nodes().find(n => n.type === 'TimePicker').props.value, '23:55');
  click('取消'); assert.equal(calls.length, 0);
  open(); click('提前 10 分钟'); click('保存开始时间');
  assert.deepEqual(calls, [[old - 10 * minute, old]]);
  open(); nodes().find(n => n.type === 'input').props.onChange({ target: { value: '2099-01-01' } }); render();
  assert.equal(nodes().find(n => n.type === 'button' && n.props.children === '保存开始时间').props.disabled, true);
});
