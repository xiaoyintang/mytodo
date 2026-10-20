const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}
const { stampCompletion } = load('components/todo/completion.ts');

const task = (extra = {}) => ({ id: 't', title: '投简历', date: '2026-10-20', status: 'todo', ...extra });

test('stamps the moment a task becomes done and clears it when reopened', () => {
  const done = stampCompletion([task()], [task({ status: 'done' })], 1000);
  assert.equal(done[0].completedAt, 1000);
  const edited = stampCompletion(done, [{ ...done[0], title: '投两份简历', completedAt: undefined }], 2000);
  assert.equal(edited[0].completedAt, 1000, 'later edits keep the original completion time');
  const reopened = stampCompletion(edited, [{ ...edited[0], status: 'in_progress' }], 3000);
  assert.equal('completedAt' in reopened[0], false);
});

test('legacy done tasks and brand-new tasks are not given a guessed time', () => {
  const legacy = task({ status: 'done' });
  assert.equal(stampCompletion([legacy], [{ ...legacy, title: '改名' }], 1000)[0].completedAt, undefined);
  assert.equal(stampCompletion([], [task({ id: 'new', status: 'done' })], 1000)[0].completedAt, undefined);
});

test('steps are stamped independently and unchanged lists keep identity', () => {
  const before = [task({ subtasks: [{ id: 's1', title: 'a', done: false }, { id: 's2', title: 'b', done: false }] })];
  const after = stampCompletion(before, [task({ subtasks: [{ id: 's1', title: 'a', done: true }, { id: 's2', title: 'b', done: false }] })], 500);
  assert.equal(after[0].subtasks[0].completedAt, 500);
  assert.equal(after[0].subtasks[1].completedAt, undefined);
  const same = [task()];
  assert.equal(stampCompletion(same, same, 1), same, 'no-op returns the same array');
});
