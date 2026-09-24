const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the actual handlers with render-local snapshots and state setters.
// No browser storage or user records are touched.
const file = path.join(__dirname, '../components/TodoApp.tsx');
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['snapshotEntries', 'undoEntries', 'redoEntries', 'updateEntry', 'deleteEntry'];
const declarations = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) declarations.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(declarations.length, names.length);
const code = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const handlers = new Function('entries', 'entriesHistory', 'entriesFuture', 'setEntries', 'setEntriesHistory', 'setEntriesFuture', `${code}; return {${names.join(',')}};`);

function harness(initial) {
  const state = { entries: structuredClone(initial), history: [], future: [] };
  const setter = key => next => { state[key] = typeof next === 'function' ? next(state[key]) : next; };
  return { state, call(name, ...args) {
    return handlers(state.entries, state.history, state.future, setter('entries'), setter('history'), setter('future'))[name](...args);
  } };
}

const original = { id: 'a', title: '看电视', date: '2026-09-23', minutes: 120, startTime: '22:30', endTime: '00:30', dateAnchor: 'start', taskId: 'task', taskLinkMode: 'manual', aspirationId: 'goal', category: '休息', categorySource: 'user' };

test('mistaken undo can be redone exactly, including overnight time, task and goal attribution', () => {
  const h = harness([original]);
  h.call('updateEntry', 'a', { minutes: 90, endTime: '00:00', title: '陪伴侣看电视' });
  const edited = structuredClone(h.state.entries);
  h.call('undoEntries');
  assert.deepEqual(h.state.entries, [original]);
  h.call('redoEntries');
  assert.deepEqual(h.state.entries, edited);
  assert.equal(h.state.future.length, 0);
  h.call('undoEntries'); h.call('redoEntries');
  assert.deepEqual(h.state.entries, edited);
});

test('multiple undo/redo steps restore edits and deletions in order, including other dates', () => {
  const h = harness([original, { id: 'b', title: '阅读', date: '2026-09-24', minutes: 20 }]);
  const initial = structuredClone(h.state.entries);
  h.call('updateEntry', 'a', { minutes: 30 });
  const edited = structuredClone(h.state.entries);
  h.call('deleteEntry', 'b');
  const deleted = structuredClone(h.state.entries);
  h.call('undoEntries'); assert.deepEqual(h.state.entries, edited);
  h.call('undoEntries'); assert.deepEqual(h.state.entries, initial);
  h.call('undoEntries'); assert.deepEqual(h.state.entries, initial);
  h.call('redoEntries'); assert.deepEqual(h.state.entries, edited);
  h.call('redoEntries'); assert.deepEqual(h.state.entries, deleted);
  h.call('redoEntries'); assert.deepEqual(h.state.entries, deleted);
});

test('new edits after undo clear stale redo, while both stacks remain bounded', () => {
  const h = harness([original]);
  for (let i = 1; i <= 40; i++) h.call('updateEntry', 'a', { minutes: i });
  assert.equal(h.state.history.length, 30);
  for (let i = 0; i < 35; i++) h.call('undoEntries');
  assert.equal(h.state.future.length, 30);
  h.call('updateEntry', 'a', { title: '新的修改' });
  const branch = structuredClone(h.state.entries);
  assert.equal(h.state.future.length, 0);
  h.call('redoEntries'); assert.deepEqual(h.state.entries, branch);
});
