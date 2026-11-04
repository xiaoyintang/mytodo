const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function parser(response, inspect = () => {}) {
  const mod = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../components/todo/llmtask.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(() => ({ callLLMJson: async (prompt, text) => { inspect(prompt, text); return response; } }), mod, mod.exports);
  return text => mod.exports.parseTasksWithLLM(text, '2026-11-04', '周三');
}

test('task parser retains ordered steps, scores and notes without interpreting completion', async () => {
  const steps = ['第三套第4题：左手倒右手 84 ✅', '第三套第5题：需求是否被满足 82 ✅', '第三套第10题：经验迁移；改成模板题，不再打分', '第二套第4题：跨部门冲突 82 ✅', '第二套第10题：为什么看机会 80 ✅'];
  const parse = parser({ tasks: [{ title: '做题', steps }] }, prompt => {
    assert.ok(prompt.includes('"steps"'));
    assert.ok(prompt.includes('不要把步骤塞进 title'));
    assert.ok(prompt.includes('不擅自生成步骤'));
  });
  const tasks = await parse('做题，步骤如下');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, '做题');
  assert.deepEqual(tasks[0].steps, steps);
  assert.equal(tasks[0].targetMinutes, undefined);
  assert.equal(tasks[0].startTime, undefined);
});

test('malformed steps are ignored and ordinary independent tasks remain independent', async () => {
  const tasks = await parser({ tasks: [
    { title: '做题', steps: ['  第一步  ', null, { title: 'not a string', done: true }, '', 42] },
    { title: '买菜', steps: 'not an array' }, { title: '散步' },
  ] })('做题、买菜、散步');
  assert.deepEqual(tasks.map(t => t.title), ['做题', '买菜', '散步']);
  assert.deepEqual(tasks[0].steps, ['第一步']);
  assert.ok(!('steps' in tasks[1]));
  assert.ok(!('steps' in tasks[2]));
  assert.equal(await parser(null)('做题'), null);
});

test('repeating tasks retain steps on every date, including next-week fallback', async () => {
  const steps = ['打开资料', '练两题'];
  const explicit = await parser({ tasks: [{ title: '做题', dates: ['2026-11-05', '2026-11-06'], steps }] })('明后天做题');
  assert.equal(explicit.length, 2);
  assert.notEqual(explicit[0].steps, explicit[1].steps);
  const fallback = await parser({ tasks: [{ title: '做题', date: '2026-11-09', steps }] })('下周每天做题，步骤如下：打开资料，然后练两题');
  assert.equal(fallback.length, 7);
  assert.ok(fallback.every(t => JSON.stringify(t.steps) === JSON.stringify(steps)));
});
