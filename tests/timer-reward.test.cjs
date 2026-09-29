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
    ? load(path.join(path.dirname(file), name + '.ts'), mocks) : require(name)), module, module.exports);
  return module.exports;
}
const { DEFAULT_REWARD, configureReward, rewardProgress, beginReward, resumeFocus, stopTimer, readRewardCycle } = load('components/todo/timerReward.ts');
const start = new Date(2026, 8, 29, 10, 0).getTime();
const min = 60000;
const idle = { running: null, updatedAt: 0 };
const focus = () => configureReward({ ...idle, running: { title: '学概率统计', startedAt: start, attribution: { taskId: 't', aspirationId: 'g' } } }, DEFAULT_REWARD, start);

test('reward is optional, validates settings and can attach without restarting existing focus', () => {
  const old = { ...idle, running: { title: '读书', startedAt: start } };
  assert.equal(configureReward(old, { ...DEFAULT_REWARD, focusMinutes: 0 }, start), old);
  assert.equal(configureReward(old, { ...DEFAULT_REWARD, rewardMinutes: 1.5 }, start), old);
  assert.equal(configureReward(old, { ...DEFAULT_REWARD, title: '' }, start), old);
  const next = configureReward(old, DEFAULT_REWARD, start + 10 * min);
  assert.equal(next.running.startedAt, start);
  assert.equal(rewardProgress(next, start + 10 * min).focusMs, 10 * min);
  assert.equal(configureReward(next, DEFAULT_REWARD, start + 11 * min), next);
  assert.equal(configureReward(idle, DEFAULT_REWARD, start).running.title, '正事');
  assert.equal(DEFAULT_REWARD.focusSound, false);
  assert.equal(DEFAULT_REWARD.rewardSound, true);
});

test('focus pauses accumulate exact milliseconds; ordinary entertainment does not earn progress', () => {
  const state = focus();
  const paused = stopTimer(state, start + 18 * min);
  assert.equal(paused.entry.minutes, 18);
  assert.equal(paused.entry.category, '正事');
  assert.equal(paused.entry.taskId, 't');
  assert.equal(paused.state.reward.creditedMs, 18 * min);
  assert.equal(rewardProgress(paused.state, start + 60 * min).focusMs, 18 * min);
  const other = { ...paused.state, running: { title: '娱乐', startedAt: start + 20 * min } };
  assert.equal(rewardProgress(other, start + 40 * min).focusMs, 18 * min);
  assert.equal(resumeFocus(other, start + 40 * min).state, other);
  const stoppedOther = stopTimer(other, start + 40 * min);
  const resumed = resumeFocus(stoppedOther.state, start + 40 * min).state;
  assert.equal(resumed.running.attribution.taskId, 't');
  assert.equal(rewardProgress(resumed, start + 52 * min - 1).ready, false);
  assert.equal(rewardProgress(resumed, start + 52 * min).ready, true);
});

test('threshold never auto-stops focus; reward starts only on claim, not retroactively', () => {
  const state = focus();
  assert.equal(beginReward(state, start + 29 * min).state, state);
  const before = structuredClone(state);
  assert.equal(rewardProgress(state, start + 45 * min).ready, true);
  assert.deepEqual(state, before);
  const claimed = beginReward(state, start + 45 * min);
  assert.equal(claimed.entry.minutes, 45);
  assert.equal(claimed.state.running.startedAt, start + 45 * min);
  assert.equal(claimed.state.reward.phase, 'reward');
  assert.equal(rewardProgress(claimed.state, start + 45 * min).rewardMs, 0);
  assert.equal(beginReward(claimed.state, start + 45 * min).entry, undefined);
  assert.equal(rewardProgress(claimed.state, start + 55 * min).rewardOver, true);
  assert.equal(claimed.state.running.title, '奖励 · 自由活动');
});

test('reward records actual time without task/goal credit; returning starts a fresh round', () => {
  const claimed = beginReward(focus(), start + 30 * min).state;
  const back = resumeFocus(claimed, start + 43 * min);
  assert.equal(back.entry.minutes, 13);
  assert.equal(back.entry.category, '娱乐');
  assert.equal(back.entry.categorySource, 'user');
  assert.equal(back.entry.taskLinkMode, 'none');
  assert.equal(back.entry.taskId, undefined);
  assert.equal(back.entry.aspirationId, undefined);
  assert.equal(back.state.reward.creditedMs, 0);
  assert.equal(back.state.running.title, '学概率统计');
  assert.equal(back.state.running.attribution.taskId, 't');
  assert.equal(rewardProgress(back.state, start + 43 * min).ready, false);
  assert.notEqual(back.state.reward.id, claimed.reward.id);
  assert.equal(resumeFocus(back.state, start + 43 * min).entry, undefined);
});

test('stopping reward early is allowed, restart survives serialization, legacy timer remains valid', () => {
  const claimed = beginReward(focus(), start + 30 * min).state;
  const paused = stopTimer(claimed, start + 32 * min);
  assert.equal(paused.entry.minutes, 2);
  assert.equal(paused.state.reward.phase, 'finished');
  const saved = JSON.parse(JSON.stringify(paused.state));
  assert.deepEqual(readRewardCycle(saved.reward), saved.reward);
  assert.equal(resumeFocus(saved, start + 40 * min).state.reward.creditedMs, 0);
  assert.equal(readRewardCycle(undefined), undefined);
  assert.equal(readRewardCycle({ config: {} }), undefined);
  const legacy = stopTimer({ running: { title: '普通计时', startedAt: start }, updatedAt: start }, start + 5 * min);
  assert.equal(legacy.entry.minutes, 5);
  assert.equal(legacy.entry.category, undefined);
});

test('reward and focused records crossing midnight retain end-day date semantics', () => {
  const late = new Date(2026, 8, 29, 23, 40).getTime();
  const state = configureReward(idle, DEFAULT_REWARD, late);
  const claimed = beginReward(state, late + 30 * min);
  assert.equal(claimed.entry.date, '2026-09-30');
  assert.equal(claimed.entry.startTime, '23:40');
  assert.equal(claimed.entry.endTime, '00:10');
  assert.equal(claimed.entry.dateAnchor, 'end');
  assert.equal(claimed.entry.minutes, 30);
});

test('hook actions prevent duplicate claims, persist reward state, and preserve rename association on return', () => {
  const RealDate = global.Date;
  let now = start;
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const storage = new Map();
  global.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, sessionStorage: { getItem: () => null, setItem() {} } };
  try {
    const records = [];
    function mount() {
      const effects = [];
      const react = { useRef: value => ({ current: value }), useCallback: fn => fn,
        useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect: fn => effects.push(fn) };
      const { useTimer } = load('components/todo/useTimer.ts', { react });
      const hook = useTimer(entry => records.push(entry));
      effects.forEach(fn => fn());
      return hook;
    }
    let hook = mount();
    hook.enableReward(DEFAULT_REWARD);
    const getState = () => JSON.parse(storage.get('mytodo.timer.v1'));
    let id = getState().reward.id;
    hook.rename('写回答', start, { taskId: 'answer', aspirationId: 'interview' });
    now += 30 * min;
    hook = mount(); // reload must retain the round
    assert.equal(getState().reward.focus.title, '写回答');
    hook.startReward('stale-id'); assert.equal(records.length, 0);
    hook.startReward(id); hook.startReward(id);
    assert.equal(records.length, 1);
    assert.equal(records[0].taskId, 'answer');
    now += 10 * min;
    hook.continueFocus(id); hook.continueFocus(id);
    assert.equal(records.length, 2);
    assert.equal(records[1].taskLinkMode, 'none');
    assert.equal(getState().running.attribution.taskId, 'answer');
    id = getState().reward.id;
    hook.dismissReward(id);
    assert.equal(getState().reward, undefined);
    assert.equal(getState().running.title, '写回答');
    hook.stop(); hook.stop(); assert.equal(records.length, 3);
  } finally { global.Date = RealDate; delete global.window; }
});
