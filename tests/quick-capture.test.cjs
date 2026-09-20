const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness(file, initialProps, fetchImpl = () => { throw new Error('Manual capture must not call AI'); }, exportName = 'default') {
  const slots = []; let cursor = 0, tree, props = initialProps;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect() {},
    useMemo: fn => fn(),
  };
  function load(relative) {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', 'fetch', code)(name => {
      if (name === 'react') return react;
      if (name.startsWith('./')) return load(path.join(path.dirname(relative), name + '.ts'));
      if (name.startsWith('@/components/todo/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('@/components/')) return { default: name.split('/').at(-1) };
      return require(name);
    }, mod, mod.exports, fetchImpl);
    return mod.exports;
  }
  const Component = load(file)[exportName];
  function render(updates = {}) { props = { ...props, ...updates }; cursor = 0; tree = Component(props); }
  function nodes(n = tree) { return Array.isArray(n) ? n.flatMap(child => nodes(child ?? null)) : !n || typeof n !== 'object' ? [] : [n, ...nodes(n.props?.children ?? null)]; }
  const input = () => nodes().find(n => n.type === 'input' && n.props.type === 'text');
  render();
  return { nodes, render, input,
    type(value) { input().props.onChange({ target: { value } }); render(); },
    enter(overrides = {}) { input().props.onKeyDown({ key: 'Enter', keyCode: 13, nativeEvent: {}, preventDefault() {}, ...overrides }); render(); },
    click(label) { const button = nodes().find(n => n.type === 'button' && (n.props['aria-label'] === label || n.props.children === label)); assert.ok(button, label); button.props.onClick(); render(); },
  };
}

test('Enter creates title-only on viewed date, trims, keeps capture ready, never calls AI', () => {
  const calls = [];
  const h = harness('components/QuickAddTask.tsx', { date: '2026-10-05', onCreate: task => calls.push(task) });
  h.type('  写项目提纲  '); h.enter();
  assert.deepEqual(calls, [{ title: '写项目提纲', date: '2026-10-05', status: 'todo' }]);
  assert.equal(h.input().props.value, '');
  h.enter(); assert.equal(calls.length, 1);
  h.render({ date: '2026-10-06' }); h.type('下一条'); h.click('直接添加任务');
  assert.equal(calls[1].date, '2026-10-06');
});

test('Chinese composition confirmation and blank title never create tasks', () => {
  const calls = []; const h = harness('components/QuickAddTask.tsx', { date: '2026-09-21', onCreate: t => calls.push(t) });
  h.type('写提纲'); h.enter({ nativeEvent: { isComposing: true } }); h.enter({ keyCode: 229 });
  h.type('   '); h.enter(); assert.equal(calls.length, 0);
});

test('weekly inline capture opens in place, supports repeated entry and Escape', () => {
  const calls = []; const h = harness('components/QuickAddTask.tsx', { compact: true, date: '2026-09-24', onCreate: t => calls.push(t) });
  assert.equal(h.input(), undefined); h.click('在 2026-09-24 添加任务');
  h.type('准备面试'); h.enter(); h.type('复盘面试'); h.enter();
  assert.equal(calls.length, 2); assert.ok(calls.every(t => t.date === '2026-09-24'));
  assert.ok(h.input()); h.enter({ key: 'Escape' }); assert.equal(h.input(), undefined);
});

test('AI remains explicit, previews before creating, and preserves parsed schedule', async () => {
  const calls = []; let requests = 0;
  const h = harness('components/QuickAddTask.tsx', { date: '2026-09-21', onCreate: t => calls.push(t) }, async () => {
    requests++; return { ok: true, json: async () => ({ tasks: [{ title: '开会', date: '2026-09-22', startTime: '09:00' }] }) };
  });
  h.type('明早九点开会');
  const ai = h.nodes().find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children.includes('AI'));
  await ai.props.onClick(); h.render();
  assert.equal(requests, 1); assert.equal(calls.length, 0);
  const confirm = h.nodes().find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children.includes('创建'));
  assert.ok(confirm); confirm.props.onClick();
  assert.equal(calls[0].startTime, '09:00'); assert.equal(calls[0].date, '2026-09-22');
});

test('mainline empty action edits current day, excludes archive, respects cap; goal badge navigates separately', () => {
  const calls = []; const date = '2026-09-24';
  const aspirations = ['甲', '乙', '丙', '丁'].map((title, i) => ({ id: String(i), title }));
  aspirations.push({ id: 'old', title: '归档', archived: true });
  const h = harness('components/MainlineBar.tsx', { date, aspirations, dayPlans: {}, running: null, elapsedMs: 0,
    onOpenGoals: () => calls.push('goals'), onOpenGoal: id => calls.push(['open', id]),
    onToggleMainline: (day, id) => calls.push([day, id]) });
  h.click('选择当天主线');
  assert.equal(calls.length, 0);
  let choices = h.nodes().filter(n => n.type === 'button' && n.props['aria-pressed'] !== undefined);
  assert.equal(choices.length, 4); choices[0].props.onClick(); assert.deepEqual(calls[0], [date, '0']);
  h.render({ dayPlans: { [date]: { date, primaryAspirationIds: ['0', '1', '2'] } } });
  choices = h.nodes().filter(n => n.type === 'button' && n.props['aria-pressed'] !== undefined);
  assert.equal(choices[3].props.disabled, true); assert.equal(choices[0].props.disabled, false);
  h.click('打开主线 1：甲'); assert.deepEqual(calls[1], ['open', '0']);
  h.render({ date: '2026-09-25' }); assert.ok(!h.nodes().some(n => n.type === 'section'));
});

test('no active goals guides to goals rather than an unusable selector', () => {
  const calls = []; const h = harness('components/MainlineBar.tsx', { date: '2026-09-21', aspirations: [], dayPlans: {}, running: null,
    onOpenGoals: () => calls.push('goals') });
  h.click('还没有目标，先建一个'); assert.deepEqual(calls, ['goals']);
});

test('week header hides daily mainlines, preserving goals and timer; week planner uses viewed week', () => {
  const calls = [];
  const base = { date: '2026-09-21', aspirations: [{ id: 'g', title: '学习' }], dayPlans: {},
    showMainlines: false, running: { title: '阅读' }, elapsedMs: 60000,
    onOpenGoals: () => calls.push('goals'), onStopTimer: () => calls.push('stop'),
    onToggleMainline: () => calls.push('unexpected toggle'),
  };
  const h = harness('components/MainlineBar.tsx', base);
  for (const dayPlans of [{}, { '2026-09-21': { primaryAspirationIds: ['g'] } }]) {
    h.render({ dayPlans });
    assert.ok(!h.nodes().some(n => n.props['aria-expanded'] !== undefined));
    assert.ok(!h.nodes().some(n => n.props['aria-label']?.startsWith('打开主线')));
    assert.ok(!h.nodes().some(n => n.type === 'section'));
  }
  h.click('打开我的目标');
  h.nodes().find(n => n.props.onClick === base.onStopTimer).props.onClick();
  assert.deepEqual(calls, ['goals', 'stop']);
  const week = harness('components/TodoWeekView.tsx', { selectedDate: '2026-10-05', today: '2026-09-21',
    tasks: [], entries: [], aspirations: base.aspirations, goalResults: [], behaviors: [], habits: [], dayPlans: {}, running: null,
    onToggleMainline: (date, id) => calls.push([date, id]),
  });
  assert.equal(week.nodes().find(n => n.type === 'MainlineBar').props.showMainlines, false);
  const planner = week.nodes().find(n => n.type === 'MainlinePlanner');
  assert.equal(planner.props.days[0].getMonth(), 9);
  assert.equal(planner.props.days[0].getDate(), 5);
  planner.props.onToggle('2026-10-07', 'g');
  assert.deepEqual(calls.at(-1), ['2026-10-07', 'g']);
});

test('week status control cycles the same task independently of details and updates completion count', () => {
  const date = '2026-09-21'; let task = { id: 'task', title: '写提纲', date, status: 'todo' };
  const calls = [];
  const h = harness('components/TodoWeekView.tsx', { selectedDate: date, today: date, tasks: [task], entries: [],
    aspirations: [], goalResults: [], behaviors: [], habits: [], dayPlans: {}, running: null,
    onCycleTaskStatus: id => { calls.push(id); task = { ...task, status: { todo: 'in_progress', in_progress: 'done', done: 'todo' }[task.status] }; },
  });
  function day() { const n = h.nodes().find(n => n.type?.name === 'DayRow'); return n.type(n.props); }
  function row() { const n = h.nodes(day()).find(n => n.type?.name === 'WeekTaskRow'); return n.type(n.props); }
  function sheet() { return h.nodes().find(n => n.type === 'TaskBottomSheet'); }
  for (const label of ['标记为进行中', '标记为已完成', '设为待办']) {
    const buttons = h.nodes(row()).filter(n => n.type === 'button');
    assert.equal(buttons.length, 2);
    assert.ok(buttons.every(b => !h.nodes(b.props.children).some(n => n.type === 'button')));
    const control = buttons.find(n => n.props['aria-label'] === `${label}：写提纲`);
    assert.ok(control.props.className.includes('h-11 w-11')); control.props.onClick();
    h.render({ tasks: [task] }); assert.equal(sheet().props.isOpen, false);
    assert.ok(h.nodes(day()).some(n => Array.isArray(n.props?.children) && n.props.children.join('') === `${task.status === 'done' ? 1 : 0}/1`));
  }
  assert.deepEqual(calls, ['task', 'task', 'task']);
  h.nodes(row()).find(n => n.props['aria-label'] === '查看任务详情：写提纲').props.onClick(); h.render();
  assert.equal(sheet().props.isOpen, true); assert.equal(sheet().props.task.id, 'task'); assert.equal(calls.length, 3);
});

test('day navigation lives in date strip, redundant header add is absent', () => {
  const h = harness('components/TodoDayView.tsx', { selectedDate: '2026-09-21', today: '2026-09-21', tasks: [], entries: [],
    aspirations: [], goalResults: [], behaviors: [], habits: [], dayPlans: {}, running: null,
    onPrevWeek() {}, onNextWeek() {},
  });
  // Named imports are stubbed by this harness; identify chrome by its unique props.
  const header = h.nodes().find(n => n.props.title === '今天');
  assert.equal(header.props.onAdd, undefined); assert.equal(header.props.onPrev, undefined); assert.equal(header.props.onNext, undefined);
  const strip = h.nodes().find(n => n.props.days && n.props.onSelect !== undefined);
  // onSelectDate is optional in this fixture, so find the strip through its callbacks instead.
  const dateStrip = strip ?? h.nodes().find(n => n.props.days && n.props.onPrevWeek);
  assert.equal(typeof dateStrip.props.onPrevWeek, 'function'); assert.equal(typeof dateStrip.props.onNextWeek, 'function');
});

test('date strip arrows have 44px targets and call the respective week handlers once', () => {
  const calls = []; const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 21 + i));
  const h = harness('components/ViewChrome.tsx', { days, selectedDate: '2026-09-21', today: '2026-09-21',
    onSelect: date => calls.push(date), onPrevWeek: () => calls.push('prev'), onNextWeek: () => calls.push('next'),
  }, undefined, 'WeekDateStrip');
  for (const arrow of h.nodes().filter(n => n.type?.name === 'WeekArrow')) {
    const button = arrow.type(arrow.props); assert.ok(button.props.className.includes('h-11 w-11')); button.props.onClick();
  }
  assert.deepEqual(calls, ['prev', 'next']);
  h.nodes().find(n => n.props['aria-label'] === '周二 22日').props.onClick(); assert.equal(calls[2], '2026-09-22');
});

test('week range opens month picker and return-to-week selects actual today', () => {
  const calls = []; const h = harness('components/TodoWeekView.tsx', { selectedDate: '2026-10-05', today: '2026-09-21', tasks: [], entries: [],
    aspirations: [], goalResults: [], behaviors: [], habits: [], dayPlans: {}, running: null,
    onSelectDate: date => calls.push(date),
  });
  assert.equal(h.nodes().find(n => n.props.title === '周计划').props.onAdd, undefined);
  h.nodes().find(n => n.type === 'button' && n.props['aria-label']?.startsWith('选择周日期')).props.onClick(); h.render();
  const picker = h.nodes().find(n => n.props.selectedDate === '2026-10-05' && n.props.onClose);
  assert.ok(picker); picker.props.onSelect('2026-12-31'); assert.equal(calls[0], '2026-12-31');
  const returnButton = h.nodes().find(n => n.props['aria-label'] === '回到本周');
  assert.ok(h.nodes(returnButton.props.children).some(n => n.props['aria-hidden'] === 'true'));
  h.click('回到本周'); assert.equal(calls[1], '2026-09-21');
});

test('record navigation matches day: nearby return-to-today and arrows in date strip', () => {
  const calls = [];
  const h = harness('components/TimeLogView.tsx', { selectedDate: '2026-09-14', today: '2026-09-21', tasks: [], entries: [],
    aspirations: [], dayPlans: {}, timer: { running: null }, running: null,
    onSelectDate: date => calls.push(date), onPrevWeek: () => calls.push('prev'), onNextWeek: () => calls.push('next'),
  });
  const header = h.nodes().find(n => n.props.title === '记录');
  assert.equal(header.props.actionsNearTitle, true);
  assert.equal(header.props.onPrev, undefined); assert.equal(header.props.onNext, undefined);
  header.props.onToday(); assert.equal(calls[0], '2026-09-21');
  const strip = h.nodes().find(n => n.props.days && n.props.onPrevWeek);
  strip.props.onPrevWeek(); strip.props.onNextWeek();
  assert.deepEqual(calls, ['2026-09-21', 'prev', 'next']);
  header.props.onTitleClick(); h.render();
  assert.ok(h.nodes().some(n => n.props.selectedDate === '2026-09-14' && n.props.onClose));
  h.render({ selectedDate: '2026-09-21' });
  assert.equal(h.nodes().find(n => n.props.title === '记录').props.onToday, undefined);
});
