const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, react) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react' && react) return react;
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', react);
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const { createTaskNote, editTaskNote } = load('components/todo/taskNotes.ts');
const task = { id: 't1', title: '准备答复', date: '2026-09-12', status: 'todo', aspirationId: 'g1',
  subtasks: [{ id: 's0', title: '整理资料', done: true }, { id: 's1', title: '写提纲', done: false }] };

test('notes snapshot the task, resolved KR and first unfinished step, without changing completion', () => {
  assert.equal(createTaskNote(task, '  '), undefined);
  const note = createTaskNote(task, '  打开文档后不知道写什么  ', { title: '找到工作' }, { id: 'kr1', title: '回答开放性问题' });
  assert.equal(note.text, '打开文档后不知道写什么');
  assert.equal(note.context.stepId, 's1');
  assert.equal(note.context.resultId, 'kr1');
  assert.equal(note.context.taskDate, '2026-09-12');
  const restored = JSON.parse(JSON.stringify({ ...task, notes: [note] }));
  restored.title = '新标题';
  restored.subtasks[1].title = '新步骤';
  assert.equal(restored.notes[0].context.taskTitle, '准备答复');
  assert.equal(restored.notes[0].context.stepTitle, '写提纲');
  assert.equal(restored.status, 'todo');
  assert.equal(createTaskNote({ ...task, status: 'done' }, '今天顺利开始了').context.stepId, undefined);
});

test('editing preserves context and creation time; templates do not inherit notes', () => {
  const note = createTaskNote(task, '先记一下');
  const other = createTaskNote(task, '一次成功的开始');
  const edited = editTaskNote([note, other], note.id, '  补充现场  ');
  assert.equal(edited[0].text, '补充现场');
  assert.equal(edited[0].context, note.context);
  assert.equal(edited[0].createdAt, note.createdAt);
  assert.equal(edited[1], other);
  assert.equal(editTaskNote(edited, note.id, ' '), edited);
  const { tasksToTemplateItems, instantiateTemplateTasks } = load('components/todo/taskTemplate.ts');
  const items = tasksToTemplateItems([{ ...task, notes: edited }]);
  assert.equal(items[0].notes, undefined);
  const result = instantiateTemplateTasks({ id: 'tpl', items }, [items[0].id], '2026-09-13', []);
  assert.equal(result.tasks[0].notes, undefined);
});

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== 'object') return [];
  return [node, ...flatten(node.props?.children)];
}

test('note UI appends, edits, discards and confirms deletion; unrelated task updates keep the draft', () => {
  const state = []; let cursor = 0; let current = { ...task }; let tree;
  const react = {
    useState(value) { const i = cursor++; if (!(i in state)) state[i] = value; return [state[i], v => state[i] = v]; },
    useRef(value) { const i = cursor++; if (!(i in state)) state[i] = { current: value }; return state[i]; },
  };
  const Component = load('components/TaskNotes.tsx', react).default;
  function render() { cursor = 0; tree = Component({ task: current, onChange: notes => current = { ...current, notes } }); }
  const button = label => flatten(tree).find(n => n.type === 'button' && (n.props['aria-label'] === label || n.props.children === label));
  function click(label) { const b = button(label); assert.ok(b, label); b.props.onClick(); render(); }
  function type(text) { flatten(tree).find(n => n.type === 'textarea').props.onChange({ target: { value: text } }); render(); }
  render();
  flatten(tree).find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children.includes('记一下')).props.onClick(); render();
  type('打开文档，先写了一个标题');
  current = { ...current, priority: 'high' }; render();
  assert.equal(flatten(tree).find(n => n.type === 'textarea').props.value, '打开文档，先写了一个标题');
  click('保存随记');
  assert.equal(current.notes.length, 1);
  click('编辑随记'); type('想丢掉的草稿'); click('取消');
  assert.equal(current.notes[0].text, '打开文档，先写了一个标题');
  click('编辑随记'); type('修订内容'); click('保存随记');
  assert.equal(current.notes[0].text, '修订内容');
  assert.equal(current.notes.length, 1);
  click('删除随记'); assert.equal(current.notes.length, 1);
  click('保留'); assert.equal(current.notes.length, 1);
  click('删除随记'); click('确认删除'); assert.equal(current.notes.length, 0);
  assert.equal(current.status, 'todo');
});

test('minimum-start entry has a visible label and 44px touch target for both tasks and steps', () => {
  const react = { useState: v => [v, () => {}], useEffect() {} };
  const Component = load('components/StartActionEditor.tsx', react).default;
  for (const targetStep of [undefined, task.subtasks[1]]) {
    const node = Component({ executable: true, targetStep, onChange() {} });
    assert.match(node.props.className, /min-h-11/);
    assert.match(node.props.className, /text-\[13px\]/);
    assert.ok(node.props.children.includes(targetStep ? '给这一步设最小启动' : '设置最小启动'));
  }
});
