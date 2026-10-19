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
const { newlyStartedAction, startWinsOn, hasStartWin } = load('components/todo/startWin.ts');

const base = { id: 't1', title: '视频粗剪', date: '2026-10-19', status: 'todo' };
const minimum = (title, extra = {}) => ({ kind: 'minimum', title, ...extra });

test('task-level start action flipping to done is a new win', () => {
  const before = { ...base, startAction: minimum('打开工程') };
  const after = { ...before, startAction: minimum('打开工程', { done: true }), status: 'in_progress' };
  assert.equal(newlyStartedAction(before, after)?.title, '打开工程');
  assert.equal(newlyStartedAction(after, after), undefined, 'already-done action is not celebrated twice');
});

test('step-level start action is detected and other edits are not wins', () => {
  const step = { id: 's1', title: '挑素材', done: false, startAction: minimum('看第一个片段', { targetStepId: 's1' }) };
  const before = { ...base, subtasks: [step] };
  const renamed = { ...before, title: '视频粗剪 v2' };
  assert.equal(newlyStartedAction(before, renamed), undefined);
  const after = { ...before, subtasks: [{ ...step, startAction: { ...step.startAction, done: true } }] };
  assert.equal(newlyStartedAction(before, after)?.title, '看第一个片段');
});

test('wins are counted per day without double-counting migrated task-level actions', () => {
  const step = { id: 's1', title: '挑素材', done: false, startAction: minimum('看第一个片段', { targetStepId: 's1', done: true }) };
  const tasks = [
    { ...base, startAction: minimum('看第一个片段', { targetStepId: 's1', done: true }), subtasks: [step] },
    { ...base, id: 't2', startAction: minimum('穿鞋', { done: true }) },
    { ...base, id: 't3', date: '2026-10-18', startAction: minimum('打开文档', { done: true }) },
  ];
  assert.equal(startWinsOn('2026-10-19', tasks), 2);
});

test('started marker only shows on unfinished tasks', () => {
  const started = { ...base, status: 'in_progress', startAction: minimum('穿鞋', { done: true }) };
  assert.equal(hasStartWin(started), true);
  assert.equal(hasStartWin({ ...started, status: 'done' }), false);
  assert.equal(hasStartWin({ ...base, startAction: minimum('穿鞋') }), false);
});
