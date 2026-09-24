const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  return node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];
}

function harness(date, edit = true, parsedEntries = [], overrides = {}) {
  const slots = []; let cursor = 0, tree; const updates = [], additions = [];
  const react = { ...require('react'), useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function('require', 'module', 'exports', 'fetch', code)(name => {
      if (name === 'react') return react;
      if (name === '@/components/ViewChrome') return Object.fromEntries(['AppHeader', 'AppShell', 'MonthDatePicker', 'ViewTabs', 'WeekDateStrip'].map(n => [n, n]));
      if (name.startsWith('@/components/todo/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('@/components/')) return { default: name.split('/').pop() };
      if (name.startsWith('.')) return load(path.join(path.dirname(file), name + '.ts'));
      return require(name);
    }, module, module.exports, async () => ({ ok: true, json: async () => ({ entries: parsedEntries }) }));
    cache.set(file, module.exports); return module.exports;
  }
  const Component = load('components/TimeLogView.tsx').default;
  const props = {
    viewMode: 'log', selectedDate: date, today: '2026-09-16', dayPlans: {},
    onSelectDate: next => { props.selectedDate = next; render(); },
    aspirations: [{ id: 'goal', title: '面试' }],
    tasks: [{ id: 'planned', title: '还没记过的任务', date, status: 'todo', aspirationId: 'goal' },
      { id: 'other', title: '其他日期任务', date: '2099-01-01', status: 'todo' }],
    entries: [{ id: 'entry', title: '原记录', date, minutes: 15, startTime: '10:00', endTime: '10:15', category: '正事', taskId: 'old', taskLinkMode: 'manual' }],
    timer: { running: null, elapsedMs: 0 }, running: null, elapsedMs: 0,
    onUpdateEntry: (...args) => updates.push(args),
    onAddEntries: entries => additions.push(entries),
    ...overrides,
  };
  function render() { cursor = 0; tree = Component(props); }
  const input = () => flatten(tree).find(n => n.type === 'EntryNameInput');
  render();
  if (edit) { flatten(tree).find(n => n.props['aria-label'] === '编辑记录：原记录').props.onClick(); render(); }
  return { input, updates, additions, render, nodes: () => flatten(tree),
    async parse(text, ai = true) {
      flatten(tree).find(n => n.type === 'textarea').props.onChange({ target: { value: text } }); render();
      await flatten(tree).find(n => n.type === 'button' && n.props.children?.includes?.(ai ? 'AI 解析' : '快速解析')).props.onClick(); render();
    },
    select(choice) { input().props.onSelect(choice); render(); },
    save() { flatten(tree).find(n => n.type === 'button' && n.props.children === '保存').props.onClick(); render(); },
  };
}

test('record toolbar exposes redo after undo, even when there is no older undo step', () => {
  let redos = 0;
  const h = harness('2026-09-24', false, [], { canUndoEntries: false, canRedoEntries: true, onRedoEntries: () => redos++ });
  const undo = h.nodes().find(n => n.props['aria-label'] === '撤回最近一次记录改动');
  const redo = h.nodes().find(n => n.props['aria-label'] === '重做，恢复刚撤回的记录改动');
  assert.equal(undo.props.disabled, true);
  assert.equal(redo.props.disabled, false);
  assert.ok(redo.props.className.includes('min-h-11'));
  redo.props.onClick();
  assert.equal(redos, 1);
});

test('AI record preview edits clock times, recalculates minutes and retains task link before save', async () => {
  const h = harness('2026-09-16', false, [{ title: '还没记过的任务', startTime: '11:35', endTime: '12:10', minutes: 35 }]);
  await h.parse('做了事情');
  const time = which => h.nodes().find(n => n.type === 'TimePicker' && n.props.label === `第 1 笔记录${which}时间`);
  const minutes = () => h.nodes().find(n => n.props['aria-label'] === '第 1 笔记录分钟数');
  time('开始').props.onChange('23:35'); h.render();
  time('结束').props.onChange('00:10'); h.render();
  assert.equal(minutes().props.value, 35);
  minutes().props.onChange({ target: { value: '45' } }); h.render();
  assert.equal(time('结束').props.value, '00:20');
  assert.equal(h.additions.length, 0);
  h.nodes().find(n => n.type === 'button' && n.props.children?.includes?.('确认记录')).props.onClick();
  assert.deepEqual(h.additions[0], [{ title: '还没记过的任务', date: '2026-09-16', startTime: '23:35', endTime: '00:20', minutes: 45, taskId: 'planned', taskLinkMode: 'auto' }]);
});

test('invalid dates and equal times block confirmation; changing date clears old task attribution', async () => {
  const h = harness('2026-09-16', false, [{ title: '还没记过的任务', startTime: '10:00', endTime: '10:15', minutes: 15 }]);
  await h.parse('做了事情');
  const confirm = () => h.nodes().find(n => n.type === 'button' && n.props.children?.includes?.('确认记录'));
  const date = () => h.nodes().find(n => n.props['aria-label'] === '第 1 笔记录日期');
  date().props.onChange({ target: { value: '2026-02-30' } }); h.render();
  assert.equal(confirm().props.disabled, true); confirm().props.onClick(); assert.equal(h.additions.length, 0);
  date().props.onChange({ target: { value: '2099-01-01' } }); h.render();
  const picker = h.nodes().find(n => n.type === 'EntryTaskPicker');
  assert.equal(picker.props.value, ''); assert.deepEqual(picker.props.tasks.map(t => t.id), ['other']);
  h.nodes().find(n => n.type === 'TimePicker' && n.props.label === '第 1 笔记录结束时间').props.onChange('10:00'); h.render();
  assert.equal(confirm().props.disabled, true);
});

test('explicit overnight preview defaults to selected day then next day and allows correcting the direction', async () => {
  const h = harness('2026-09-23', false);
  await h.parse('22:30到00:30陪伴侣看电视', false);
  const anchor = text => h.nodes().find(n => n.type === 'button' && n.props.children === text);
  assert.equal(anchor('当天 → 次日').props['aria-pressed'], true);
  assert.equal(h.nodes().find(n => n.props['aria-label'] === '第 1 笔记录日期').props.value, '2026-09-23');
  anchor('前一天 → 当天').props.onClick(); h.render();
  assert.equal(anchor('前一天 → 当天').props['aria-pressed'], true);
  anchor('当天 → 次日').props.onClick(); h.render();
  h.nodes().find(n => n.type === 'button' && n.props.children?.includes?.('确认记录')).props.onClick();
  assert.equal(h.additions[0][0].dateAnchor, 'start');
  assert.equal(h.additions[0][0].minutes, 120);
  assert.equal(h.additions[0][0].date, '2026-09-23');
});

test('recent overnight preview keeps end-day anchoring when confirmed', async () => {
  const h = harness('2026-09-23', false, [{ title: '阅读', startTime: '23:55', endTime: '00:10', minutes: 15, endsNow: true }]);
  await h.parse('刚阅读15分钟');
  assert.equal(h.nodes().find(n => n.type === 'button' && n.props.children === '前一天 → 当天').props['aria-pressed'], true);
  h.nodes().find(n => n.type === 'button' && n.props.children?.includes?.('确认记录')).props.onClick();
  assert.equal(h.additions[0][0].dateAnchor, 'end');
  assert.equal(h.additions[0][0].minutes, 15);
});

test('saved record editor can correct overnight direction without changing the task or duration', () => {
  const h = harness('2026-09-23');
  const time = label => h.nodes().find(n => n.type === 'TimePicker' && n.props.label === label);
  time('开始时间').props.onChange('22:30'); h.render();
  time('结束时间').props.onChange('00:30'); h.render();
  h.nodes().find(n => n.type === 'button' && n.props.children === '前一天 → 当天').props.onClick(); h.render();
  h.save();
  assert.equal(h.updates[0][1].dateAnchor, 'end');
  assert.equal(h.updates[0][1].minutes, 120);
  assert.equal(h.updates[0][1].taskId, 'old');
});

test('duration-only rule preview stays unanchored; modifying one row never modifies the other', async () => {
  const h = harness('2026-09-16', false);
  await h.parse('阅读15分钟；拉伸20分钟', false);
  h.nodes().find(n => n.props['aria-label'] === '第 1 笔记录分钟数').props.onChange({ target: { value: '30' } }); h.render();
  assert.ok(h.nodes().filter(n => n.type === 'TimePicker').every(n => n.props.value === ''));
  h.nodes().find(n => n.type === 'button' && n.props.children?.includes?.('确认记录')).props.onClick();
  assert.deepEqual(h.additions[0].map(e => e.minutes), [30, 20]);
});

test('record header opens calendar on selected historical date and can return to live today', () => {
  const h = harness('2025-12-31', false);
  const header = () => h.nodes().find(n => n.type === 'AppHeader');
  assert.equal(header().props.subtitle, '2025年12月31日 · 周三');
  header().props.onTitleClick(); h.render();
  const picker = h.nodes().find(n => n.type === 'MonthDatePicker');
  assert.equal(picker.props.selectedDate, '2025-12-31');
  assert.equal(picker.props.today, '2026-09-16');
  assert.ok(h.nodes().some(n => n.props['aria-label'] === '编辑记录：原记录'));
  assert.ok(h.nodes().some(n => n.props.children?.join?.('') === '12月31日台账'));
  picker.props.onSelect('2026-01-02'); picker.props.onClose(); h.render();
  assert.equal(h.nodes().some(n => n.type === 'MonthDatePicker'), false);
  assert.equal(h.nodes().some(n => n.props['aria-label'] === '编辑记录：原记录'), false);
  assert.equal(header().props.subtitle, '2026年1月2日 · 周五');
  assert.equal(h.nodes().some(n => n.type === 'TimerPanel'), false);
  header().props.onToday(); h.render();
  assert.equal(header().props.onToday, undefined);
  assert.ok(h.nodes().some(n => n.type === 'TimerPanel'));
});

for (const date of ['2026-09-16', '2026-09-14']) {
  test(`task picker on ${date} only offers that day's tasks and preserves record content`, () => {
    const h = harness(date, false);
    h.nodes().find(n => n.props['aria-label'] === '选择“原记录”计入的任务').props.onClick(); h.render();
    const picker = h.nodes().find(n => n.type === 'EntryTaskPicker');
    assert.equal(picker.props.initiallyOpen, true);
    assert.deepEqual(picker.props.tasks.map(t => t.id), ['planned']);
    picker.props.onChange('planned'); h.render();
    assert.deepEqual(h.updates, [['entry', { taskId: 'planned', taskLinkMode: 'manual', aspirationId: 'goal' }]]);
    assert.ok(!h.nodes().some(n => n.type === 'EntryTaskPicker'));
    h.nodes().find(n => n.props['aria-label'] === '选择“原记录”计入的任务').props.onClick(); h.render();
    h.nodes().find(n => n.type === 'EntryTaskPicker').props.onChange(undefined);
    assert.deepEqual(h.updates[1], ['entry', { taskId: undefined, taskLinkMode: 'none' }]);
  });
  test(`saved record rename offers tasks on ${date}, and selection persists task AND goal without changing time`, () => {
    const h = harness(date);
    const choices = h.input().props.history;
    assert.equal(choices.filter(c => c.source === 'task').length, 1);
    assert.ok(choices.some(c => c.source === 'history' && c.title === '原记录'));
    assert.equal(choices.some(c => c.taskId === 'other'), false);
    h.select(choices.find(c => c.taskId === 'planned')); h.save();
    assert.deepEqual(h.updates, [['entry', { title: '还没记过的任务', minutes: 15, startTime: '10:00', endTime: '10:15', dateAnchor: 'start', taskId: 'planned', taskLinkMode: 'manual', aspirationId: 'goal' }]]);
  });
}
