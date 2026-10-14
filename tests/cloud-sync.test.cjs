const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return load(path.join(path.dirname(file), name + '.ts'), mocks, globals);
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks, globals);
    return require(name);
  }, mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}
const { mergeSync, equalSync } = load('components/todo/syncMerge.ts');
const copy = value => structuredClone(value);
const fixture = () => ({
  tasks: [{ id: 'task', title: '准备面试', date: '2026-10-14', status: 'todo', subtasks: [{ id: 'step', title: '原步骤', done: false }] }],
  entries: [], aspirations: [], goalResults: [], behaviors: [], habits: [], habitLogs: [], dayPlans: {}, taskTemplates: [],
  timer: { running: null, updatedAt: 0 },
});

test('phone record addition does not override desktop workflow, attribution or minimum start', () => {
  const base = fixture(), local = copy(base), cloud = copy(base);
  local.entries.push({ id: 'phone', title: '阅读' });
  cloud.entries.push({ id: 'desktop', title: '复盘' });
  cloud.tasks[0].subtasks[0].title = '电脑新步骤';
  cloud.tasks[0].subtasks[0].startAction = { kind: 'minimum', title: '打开文档' };
  cloud.tasks[0].aspirationId = 'goal';
  const result = mergeSync(base, local, cloud);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.data.tasks, cloud.tasks);
  assert.equal(result.data.entries.length, 2);
  assert.equal(base.tasks[0].subtasks[0].title, '原步骤');
});

test('different fields merge; divergent workflow edits require a scoped explicit choice', () => {
  const base = fixture(), local = copy(base), cloud = copy(base);
  local.tasks[0].status = 'in_progress'; cloud.tasks[0].subtasks[0].title = '电脑新步骤';
  let result = mergeSync(base, local, cloud);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.data.tasks[0].status, 'in_progress');
  assert.equal(result.data.tasks[0].subtasks[0].title, '电脑新步骤');
  local.tasks[0].subtasks[0].title = '手机新步骤';
  result = mergeSync(base, local, cloud);
  assert.deepEqual(result.conflicts[0].path, ['tasks', 'task', 'subtasks']);
  const chosen = mergeSync(base, local, cloud, { [result.conflicts[0].signature]: 'cloud' });
  assert.equal(chosen.conflicts.length, 0);
  assert.equal(chosen.data.tasks[0].status, 'in_progress');
  assert.equal(chosen.data.tasks[0].subtasks[0].title, '电脑新步骤');
  cloud.tasks[0].subtasks[0].title = '电脑再次修改';
  assert.equal(mergeSync(base, local, cloud, { [result.conflicts[0].signature]: 'cloud' }).conflicts.length, 1);
});

test('deletions propagate without resurrection; edit/delete conflicts remain visible', () => {
  const base = fixture(), local = copy(base), cloud = copy(base);
  local.entries.push({ id: 'phone' }); cloud.tasks = [];
  assert.deepEqual(mergeSync(base, local, cloud).data.tasks, []);
  assert.deepEqual(mergeSync(base, cloud, local).data.tasks, []);
  local.tasks[0].title = '改过的任务';
  assert.equal(mergeSync(base, local, cloud).conflicts.length, 1);
});

test('legacy missing fields are retained; dirty upgrade never guesses conflicting steps', () => {
  const local = fixture(), cloud = fixture(); cloud.tasks[0].subtasks[0].title = '新步骤';
  assert.equal(mergeSync({}, local, cloud).conflicts.length, 1);
  assert.deepEqual(mergeSync(local, local, { entries: [] }).data.tasks, local.tasks);
  const reordered = { ...local, tasks: [{ ...local.tasks[0], optional: undefined }] };
  assert.ok(equalSync(local, reordered));
});

test('day plans merge by date/field; newest timer wins without creating a record', () => {
  const base = fixture(), local = fixture(), cloud = fixture();
  base.dayPlans = { '2026-10-14': { mustDoTaskId: 'old', aspirationIds: ['a'] } };
  local.dayPlans = { '2026-10-14': { mustDoTaskId: 'new', aspirationIds: ['a'] } };
  cloud.dayPlans = { '2026-10-14': { mustDoTaskId: 'old', aspirationIds: ['b'] } };
  cloud.timer = { running: { title: '阅读', startedAt: 100 }, updatedAt: 200 };
  const result = mergeSync(base, local, cloud);
  assert.deepEqual(result.data.dayPlans['2026-10-14'], { mustDoTaskId: 'new', aspirationIds: ['b'] });
  assert.deepEqual(result.data.timer, cloud.timer); assert.deepEqual(result.data.entries, []);
});

function server(data) {
  return {
    data: copy(data), version: 1, calls: [], beforePost: null, fail: false, failWrites: false,
    async fetch(url, options) {
      const body = options?.body ? JSON.parse(options.body) : null;
      this.calls.push({ url, body });
      if (this.fail) return { ok: false, status: 502 };
      if (options?.method === 'POST') {
        if (this.failWrites) return { ok: false, status: 502 };
        if (this.beforePost) await this.beforePost(body);
        if (body.expectedRevision !== this.revision()) return { ok: false, status: 409 };
        this.data = copy(body.payload); this.version++;
        return { ok: true, status: 200 };
      }
      const value = { data: copy(this.data), revision: this.revision() };
      return { ok: true, status: 200, json: async () => value };
    },
    revision() { return this.data === null ? null : String(this.version).padStart(40, '0'); },
    change(fn) { fn(this.data); this.version++; },
  };
}

function device(remote, initial = fixture(), base = fixture(), storageOverride) {
  let data = copy(initial), cursor = 0, changed = false, effects = [], now = 0, id = 0, value;
  const slots = [], timers = new Map(), listeners = new Map();
  const storage = storageOverride ?? new Map([['mytodo.sync.code', 'test-code'], ['mytodo.sync.base.v2', JSON.stringify({ code: 'test-code', data: base })]]);
  const depsSame = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], v => { const next = typeof v === 'function' ? v(slots[i]) : v; if (!Object.is(next, slots[i])) { slots[i] = next; changed = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !depsSame(slots[i].deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !depsSame(slots[i].deps, deps)) {
      const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
  };
  const events = { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  const document = { ...events, visibilityState: 'visible' };
  const hook = load('components/todo/sync.ts', { react }, {
    window: { ...events, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } },
    document, fetch: remote.fetch.bind(remote),
    setTimeout(fn, ms) { const next = ++id; timers.set(next, { fn, at: now + ms, ms }); return next; },
    clearTimeout(i) { timers.delete(i); },
  }).useCloudSync;
  function render() {
    changed = false; cursor = 0; effects = [];
    const { tasks, entries, timer, ...lab } = data;
    value = hook({ hydrated: true, tasks, entries, timer, lab,
      setTasks: tasks => { data = { ...data, tasks: tasks.map(t => t) }; changed = true; },
      setEntries: entries => { data = { ...data, entries }; changed = true; },
      setLab: patch => { data = { ...data, ...patch }; changed = true; },
      adoptTimer: timer => { data = { ...data, timer }; changed = true; },
    });
    effects.forEach(fn => fn());
  }
  async function settle() { for (let i = 0; i < 100; i++) { await Promise.resolve(); if (changed) render(); } }
  render();
  return {
    get state() { return value; }, get data() { return data; }, storage, timers, render, settle,
    edit(fn) { data = copy(data); fn(data); render(); },
    async refresh() { const pending = value.refresh(); await settle(); await pending; await settle(); },
    async advance(ms) { now += ms; const due = [...timers].filter(([, v]) => v.at <= now); for (const [i, item] of due) { if (timers.delete(i)) item.fn(); } await settle(); },
    async event(name) { listeners.get(name)?.(); await settle(); },
    destroy() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('actual hook: mobile record + desktop steps sync both ways without false dirty or echo writes', async () => {
  const remote = server(fixture()), phone = device(remote), desktop = device(remote);
  await phone.settle(); await desktop.settle();
  desktop.edit(d => { d.tasks[0].subtasks[0].title = '电脑新步骤'; });
  await desktop.refresh();
  phone.edit(d => { d.entries.push({ id: 'phone-record' }); });
  await phone.refresh(); await desktop.refresh();
  assert.equal(phone.data.tasks[0].subtasks[0].title, '电脑新步骤');
  assert.equal(remote.data.tasks[0].subtasks[0].title, '电脑新步骤');
  assert.deepEqual(desktop.data.entries, [{ id: 'phone-record' }]);
  assert.equal(phone.state.status, 'synced'); assert.equal(phone.storage.get('mytodo.sync.dirty'), undefined);
  const writes = remote.calls.filter(c => c.body).length;
  await phone.refresh(); await phone.advance(1000);
  assert.equal(remote.calls.filter(c => c.body).length, writes);
  phone.destroy(); desktop.destroy();
});

test('actual hook: same workflow conflict stops writes until explicit choice, including dirty upgrade', async () => {
  const local = fixture(), cloud = fixture(); local.tasks[0].subtasks[0].title = '手机新步骤'; cloud.tasks[0].subtasks[0].title = '电脑新步骤';
  const remote = server(cloud);
  const storage = new Map([['mytodo.sync.code', 'test-code'], ['mytodo.sync.dirty', '1']]);
  const phone = device(remote, local, undefined, storage); await phone.settle();
  assert.equal(phone.state.status, 'conflict'); assert.equal(remote.calls.filter(c => c.body).length, 0);
  assert.ok(storage.has('mytodo.sync.upgrade-backup.v2:test-code'));
  phone.state.resolveConflict(phone.state.conflicts[0].signature, 'cloud'); await phone.settle();
  assert.equal(phone.data.tasks[0].subtasks[0].title, '电脑新步骤'); assert.equal(phone.state.status, 'synced');
  phone.destroy();
});

test('actual hook: CAS race re-reads and retains competing device edits', async () => {
  const remote = server(fixture()), phone = device(remote); await phone.settle();
  phone.edit(d => { d.entries.push({ id: 'phone' }); });
  remote.beforePost = async () => { remote.beforePost = null; remote.change(d => { d.tasks[0].subtasks[0].title = '竞态中更新'; }); };
  await phone.refresh();
  assert.equal(remote.data.tasks[0].subtasks[0].title, '竞态中更新');
  assert.deepEqual(remote.data.entries, [{ id: 'phone' }]);
  assert.equal(phone.state.status, 'synced'); phone.destroy();
});

test('actual hook: offline edits survive reload; request failures never report synced', async () => {
  const remote = server(fixture()), phone = device(remote); await phone.settle();
  remote.fail = true;
  phone.edit(d => { d.tasks[0].subtasks[0].title = '离线步骤'; }); await phone.refresh();
  assert.equal(phone.state.status, 'error'); assert.equal(phone.storage.get('mytodo.sync.dirty'), '1');
  const saved = copy(phone.data); phone.destroy(); remote.fail = false;
  remote.change(d => { d.entries.push({ id: 'desktop' }); });
  const reopened = device(remote, saved, undefined, phone.storage); await reopened.settle();
  assert.equal(remote.data.tasks[0].subtasks[0].title, '离线步骤'); assert.equal(reopened.data.entries.length, 1);
  assert.equal(reopened.state.status, 'synced'); reopened.destroy();
});

test('actual hook: per-second parent renders do not starve polling, focus also refreshes', async () => {
  const remote = server(fixture()), phone = device(remote); await phone.settle();
  remote.change(d => { d.tasks[0].title = '后台修改'; });
  for (let i = 0; i < 60; i++) { phone.render(); await phone.advance(1000); }
  assert.equal(phone.data.tasks[0].title, '后台修改');
  remote.change(d => { d.tasks[0].title = '唤醒修改'; }); await phone.event('focus');
  assert.equal(phone.data.tasks[0].title, '唤醒修改'); phone.destroy();
});

test('actual hook: automatic debounce uploads edits without manual refresh or reference equality', async () => {
  const remote = server(fixture()), phone = device(remote); await phone.settle();
  phone.edit(d => { d.tasks[0].subtasks[0].title = '自动上传'; });
  await phone.settle(); phone.render(); await phone.advance(800);
  assert.equal(remote.data.tasks[0].subtasks[0].title, '自动上传');
  assert.equal(phone.state.status, 'synced'); phone.destroy();
});

test('actual hook: failed upload after merge retains both changes across reload, then retries safely', async () => {
  const remote = server(fixture()), phone = device(remote); await phone.settle();
  remote.change(d => { d.tasks[0].subtasks[0].title = '电脑新步骤'; });
  phone.edit(d => { d.entries.push({ id: 'offline-record' }); });
  remote.failWrites = true; await phone.refresh();
  assert.equal(phone.state.status, 'error'); assert.equal(phone.data.tasks[0].subtasks[0].title, '电脑新步骤');
  assert.equal(phone.storage.get('mytodo.sync.dirty'), '1');
  phone.destroy(); remote.failWrites = false;
  const reopened = device(remote, phone.data, undefined, phone.storage); await reopened.settle();
  assert.equal(reopened.state.status, 'synced'); assert.equal(remote.data.entries.length, 1);
  assert.equal(remote.data.tasks[0].subtasks[0].title, '电脑新步骤'); reopened.destroy();
});

test('actual hook: switching code invalidates pending replies from the old account', async () => {
  const remote = server(fixture()); let release;
  const fetch = remote.fetch.bind(remote);
  remote.fetch = (url, opts) => new Promise(resolve => { release = () => fetch(url, opts).then(resolve); });
  const phone = device(remote); await phone.settle();
  phone.state.disconnect(); await phone.settle();
  remote.data.tasks[0].title = '旧同步码内容'; release(); await phone.settle();
  assert.equal(phone.state.status, 'off'); assert.equal(phone.data.tasks[0].title, '准备面试'); phone.destroy();
});

test('actual hook: edits while upload is pending are not acknowledged prematurely', async () => {
  const remote = server(fixture()), phone = device(remote); await phone.settle();
  let release; remote.beforePost = () => new Promise(resolve => { release = resolve; });
  phone.edit(d => { d.entries.push({ id: 'first' }); });
  const request = phone.state.refresh(); await phone.settle();
  phone.edit(d => { d.tasks[0].title = '上传时修改'; });
  assert.equal(phone.state.status, 'syncing');
  remote.beforePost = null; release(); await request; await phone.settle();
  assert.equal(remote.data.tasks[0].title, '上传时修改');
  assert.equal(phone.state.status, 'synced'); phone.destroy();
});

test('API blocks unversioned old clients and reports atomic conflicts', async () => {
  let writes = 0;
  const api = load('app/api/sync/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/components/todo/kv': { kvConfig: () => ({}), kvReadSync: async () => ({ data: fixture(), revision: 'a'.repeat(40) }), kvCompareAndSetSync: async () => { writes++; return false; } },
  });
  const get = await api.GET({ url: 'https://example.test/api/sync?code=test' });
  assert.equal(get.body.revision, 'a'.repeat(40));
  assert.equal((await api.POST({ json: async () => ({ code: 'test', payload: fixture() }) })).status, 428);
  assert.equal(writes, 0);
  assert.equal((await api.POST({ json: async () => ({ code: 'test', payload: fixture(), expectedRevision: 'a'.repeat(40) }) })).status, 409);
});

test('KV reads hash original bytes; Lua CAS rejects backend errors, not just HTTP errors', async () => {
  let command, response = { result: JSON.stringify(fixture()) };
  const kv = load('components/todo/kv.ts', {}, { fetch: async (url, init) => { command = JSON.parse(init.body); return { ok: true, json: async () => response }; } });
  const read = await kv.kvReadSync({ url: 'test', token: 'fake' }, 'test');
  assert.match(read.revision, /^[a-f0-9]{40}$/);
  response = { result: 0 }; assert.equal(await kv.kvCompareAndSetSync({ url: 'test' }, 'test', fixture(), read.revision), false);
  assert.equal(command[0], 'EVAL'); assert.equal(command[4], read.revision); assert.match(command[1], /redis.sha1hex/);
  response = { error: 'ERR' }; await assert.rejects(kv.kvCompareAndSetSync({ url: 'test' }, 'test', fixture(), null));
});

test('quick-log preserves tasks, workflows, goals and timer and retries concurrent changes', async () => {
  let cloud = fixture(), revision = 1, attempts = 0;
  cloud.aspirations = [{ id: 'goal', title: '目标' }];
  const api = load('app/api/quick-log/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/components/todo/llmparse': { parseWithLLM: async () => [{ title: '阅读', minutes: 10 }] },
    '@/components/todo/kv': {
      kvConfig: () => ({}), kvGetSync: async () => copy(cloud),
      kvReadSync: async () => ({ data: copy(cloud), revision }),
      kvCompareAndSetSync: async (kv, code, data, expected) => {
        if (++attempts === 1) { cloud.tasks[0].subtasks[0].title = '同时改的步骤'; revision++; return false; }
        assert.equal(expected, revision); cloud = data; return true;
      },
    },
  });
  const result = await api.POST({ json: async () => ({ code: 'test-code', text: '阅读10分钟', date: '2026-10-14', now: '12:00' }) });
  assert.equal(result.status, 200); assert.equal(cloud.entries.length, 1);
  assert.equal(cloud.tasks[0].subtasks[0].title, '同时改的步骤');
  assert.equal(cloud.aspirations[0].title, '目标'); assert.deepEqual(cloud.timer, fixture().timer);
});

test('conflict UI shows both workflows and selects only the chosen field', () => {
  const base = fixture(), local = fixture(), cloud = fixture();
  local.tasks[0].subtasks[0].title = '本机步骤'; cloud.tasks[0].subtasks[0].title = '云端步骤';
  const conflicts = mergeSync(base, local, cloud).conflicts, calls = [];
  const Component = load('components/SyncModal.tsx', { react: { useState: v => [v, () => {}] } }).default;
  const tree = Component({ isOpen: true, code: 'test-code', status: 'conflict', lastSyncedAt: null, conflicts, taskTitles: { task: '准备面试' }, onResolveConflict: (...args) => calls.push(args) });
  const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : !node || typeof node !== 'object' ? [] : [node, ...flatten(node.props?.children)];
  const nodes = flatten(tree);
  assert.ok(nodes.some(n => n.type === 'pre' && n.props.children.includes('本机步骤')));
  assert.ok(nodes.some(n => n.type === 'pre' && n.props.children.includes('云端步骤')));
  nodes.find(n => n.type === 'button' && n.props.children === '使用云端这一处').props.onClick();
  assert.deepEqual(calls, [[conflicts[0].signature, 'cloud']]);
});
