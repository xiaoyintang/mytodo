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
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react' && react) return react;
    if (name.startsWith('@/components/todo/')) return load(name.slice(2) + '.ts', react);
    if (name === '@/components/ViewChrome') return Object.fromEntries(['AppHeader', 'AppShell', 'MonthDatePicker', 'ViewTabs', 'WeekDateStrip'].map(key => [key, key]));
    if (name.startsWith('@/components/')) return { default: name.split('/').pop() };
    return require(name);
  }, module, module.exports);
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
  const react = { useEffect() {}, useRef(value) { return { current: value }; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => state[i] = v]; } };
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

test('focus celebration only runs on completion of the same task, cleans up and never replays on mount', () => {
  const slots = []; let cursor = 0; let effects = []; let deps; let cleanup; let timer;
  const originalWindow = global.window;
  global.window = { setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { timer = undefined; } };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => slots[i] = value]; },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useEffect(fn, next) { if (!deps || next.some((v, i) => v !== deps[i])) { deps = next; effects.push(fn); } },
  };
  const Component = load('components/DailyFocusSection.tsx', react).default;
  function render(task) {
    const props = { task, tasks, aspirations: [], isToday: true, onSelect() {} };
    cursor = 0; let tree = Component(props);
    for (const effect of effects) { cleanup?.(); cleanup = effect(); }
    effects = []; cursor = 0; tree = Component(props);
    return tree;
  }
  const animated = tree => tree.props.className.includes('daily-focus-celebrate');
  try {
    assert.equal(animated(render({ ...tasks[0], status: 'done' })), false);
    assert.equal(animated(render(tasks[0])), false);
    const completed = render({ ...tasks[0], status: 'done' });
    assert.equal(animated(completed), true);
    assert.ok(JSON.stringify(completed).includes('今天最重要的这一件，做到了。'));
    timer(); assert.equal(animated(render({ ...tasks[0], status: 'done' })), false);
    assert.equal(animated(render({ ...tasks[1], status: 'done' })), false);
    render(tasks[1]); assert.equal(animated(render({ ...tasks[1], status: 'done' })), true);
    assert.equal(animated(render(tasks[1])), false); assert.equal(timer, undefined);
    render({ ...tasks[1], status: 'done' }); cleanup?.(); assert.equal(timer, undefined);
  } finally { global.window = originalWindow; }
});

test('daily focus remains in its chronological agenda or anytime list, with a summary linking the same task', () => {
  const slots = []; let cursor = 0;
  const react = { useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; }, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => slots[i] = value]; } };
  const Component = load('components/TodoDayView.tsx', react).default;
  let currentTasks = [...tasks, { id: 'earlier', title: '先开会', date, status: 'todo', startTime: '10:00' }];
  let chosen = 'a';
  const render = () => { cursor = 0; return Component({ viewMode: 'day', selectedDate: date, today: date,
    tasks: currentTasks, entries: [], aspirations: [], goalResults: [], behaviors: [], habits: [],
    dayPlans: { [date]: { date, primaryAspirationIds: [], mustDoTaskId: chosen } }, running: null, elapsedMs: 0 }); };
  let tree = render();
  const detailButtons = flatten(tree).filter(n => n.type === 'button' && n.props['aria-label']?.startsWith('查看任务详情：'));
  assert.deepEqual(detailButtons.map(n => n.props['data-full-text']), ['写周报', '先开会', '答复提纲']);
  assert.equal(flatten(tree).filter(n => n.props['aria-label'] === '查看任务详情：答复提纲').length, 1);
  flatten(tree).find(n => n.props['aria-label'] === '查看关键任务详情：答复提纲').props.onClick();
  tree = render();
  const sheet = flatten(tree).find(n => n.type?.default === 'TaskBottomSheet' || n.type === 'TaskBottomSheet');
  assert.equal(sheet.props.task.id, 'a');
  chosen = 'b'; tree = render();
  assert.equal(flatten(tree).filter(n => n.props['aria-label'] === '查看任务详情：写周报').length, 1);
  currentTasks = currentTasks.map(t => t.id === 'b' ? { ...t, status: 'done' } : t);
  tree = render();
  const focus = flatten(tree).find(n => n.type?.default === 'DailyFocusSection' || n.type === 'DailyFocusSection');
  assert.equal(focus.props.task.status, 'done');
});
