// Run: node --test tests/task-title-editor.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function editorHarness(title) {
  const values = [];
  let cursor = 0;
  const saved = [];
  let closed = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], value => { values[index] = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/TaskTitleEditor.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : require(name), module, module.exports);
  function render() {
    cursor = 0;
    return module.exports.default({ title, onSave: value => saved.push(value), onClose: () => closed++ }).props.children[0].props;
  }
  let input = render();
  return {
    saved, closed: () => closed,
    change(value) { input.onChange({ target: { value } }); input = render(); },
    key(key, extra = {}) { input.onKeyDown({ key, nativeEvent: {}, preventDefault() {}, stopPropagation() {}, ...extra }); },
    blur() { input.onBlur(); },
  };
}

test('Enter saves trimmed title once, including the subsequent blur event', () => {
  const editor = editorHarness('旧任务');
  editor.change('  确认三个问题  ');
  editor.key('Enter');
  editor.blur();
  assert.deepEqual(editor.saved, ['确认三个问题']);
  assert.equal(editor.closed(), 1);
});

test('Escape discards draft; blank and unchanged titles do not overwrite tasks', () => {
  const editor = editorHarness('旧任务');
  editor.change('不保存');
  editor.key('Escape');
  editor.blur();
  assert.deepEqual(editor.saved, []);
  assert.equal(editor.closed(), 1);
  for (const value of ['  ', '旧任务']) {
    const empty = editorHarness('旧任务');
    empty.change(value);
    empty.blur();
    assert.deepEqual(empty.saved, []);
  }
});

test('Chinese IME confirmation and Shift+Enter do not submit; outside blur saves', () => {
  const editor = editorHarness('旧任务');
  editor.change('中文任务');
  editor.key('Enter', { nativeEvent: { isComposing: true } });
  editor.key('Enter', { keyCode: 229 });
  editor.key('Enter', { shiftKey: true });
  assert.equal(editor.closed(), 0);
  editor.blur();
  assert.deepEqual(editor.saved, ['中文任务']);
});
