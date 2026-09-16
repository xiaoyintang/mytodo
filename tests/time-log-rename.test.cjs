const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  return node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];
}

function harness(date, edit = true) {
  const slots = []; let cursor = 0, tree; const updates = [];
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
    new Function('require', 'module', 'exports', code)(name => {
      if (name === 'react') return react;
      if (name === '@/components/ViewChrome') return Object.fromEntries(['AppHeader', 'AppShell', 'MonthDatePicker', 'ViewTabs', 'WeekDateStrip'].map(n => [n, n]));
      if (name.startsWith('@/components/todo/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('@/components/')) return { default: name.split('/').pop() };
      if (name.startsWith('.')) return load(path.join(path.dirname(file), name + '.ts'));
      return require(name);
    }, module, module.exports);
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
  };
  function render() { cursor = 0; tree = Component(props); }
  const input = () => flatten(tree).find(n => n.type === 'EntryNameInput');
  render();
  if (edit) { flatten(tree).find(n => n.props['aria-label'] === '编辑记录：原记录').props.onClick(); render(); }
  return { input, updates, render, nodes: () => flatten(tree),
    select(choice) { input().props.onSelect(choice); render(); },
    save() { flatten(tree).find(n => n.type === 'button' && n.props.children === '保存').props.onClick(); render(); },
  };
}

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
  test(`saved record rename offers tasks on ${date}, and selection persists task AND goal without changing time`, () => {
    const h = harness(date);
    const choices = h.input().props.history;
    assert.equal(choices.filter(c => c.source === 'task').length, 1);
    assert.ok(choices.some(c => c.source === 'history' && c.title === '原记录'));
    assert.equal(choices.some(c => c.taskId === 'other'), false);
    h.select(choices.find(c => c.taskId === 'planned')); h.save();
    assert.deepEqual(h.updates, [['entry', { title: '还没记过的任务', minutes: 15, startTime: '10:00', endTime: '10:15', taskId: 'planned', taskLinkMode: 'manual', aspirationId: 'goal' }]]);
  });
}
