const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => name.startsWith('.')
    ? loadTs(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name + '.ts')))
    : require(name);
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}
const { parseTimeEntries, resolveRecentTimeEntries } = loadTs('components/todo/nlparse.ts');

test('recent activity plus duration stays one named entry, including comma and Chinese numbers', () => {
  for (const input of ['刚做了拉伸花了15分钟', '刚做了拉伸，花了15分钟', '我刚刚做了拉伸，用了十五分钟', '刚才做了拉伸，１５分钟']) {
    assert.deepEqual(parseTimeEntries(input, '18:30'), [
      { title: '拉伸', startTime: '18:15', endTime: '18:30', minutes: 15, endsNow: true },
    ], input);
  }
});

test('cross-midnight ends-now retains full duration and both clock times', () => {
  const [entry] = parseTimeEntries('刚做了拉伸，花了15分钟', '00:10');
  assert.equal(entry.startTime, '23:55');
  assert.equal(entry.endTime, '00:10');
  assert.equal(entry.minutes, 15);
  assert.equal(entry.endsNow, true);
  const [long] = parseTimeEntries('刚刚阅读了一个半小时', '00:15');
  assert.equal(long.startTime, '22:45');
  assert.equal(long.minutes, 90);
});

test('duration-only stays unanchored, explicit clock wins, and 刚好 does not mean just ended', () => {
  for (const input of ['拉伸15分钟', '拉伸，花了15分钟', '刚好阅读15分钟', '刚才补记昨天阅读15分钟']) {
    const [entry] = parseTimeEntries(input, '18:30');
    assert.equal(entry.startTime, undefined, input);
    assert.equal(entry.endTime, undefined, input);
    assert.equal(entry.endsNow, undefined, input);
  }
  const [explicit] = parseTimeEntries('刚才14:00到14:15拉伸', '18:30');
  assert.equal(explicit.startTime, '14:00');
  assert.equal(explicit.endTime, '14:15');
  assert.equal(explicit.endsNow, undefined);
});

test('separate activities stay separate; recent meaning does not leak into the next entry', () => {
  const entries = parseTimeEntries('刚做了拉伸，花了15分钟；阅读20分钟', '18:30');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, '拉伸');
  assert.equal(entries[0].endTime, '18:30');
  assert.equal(entries[1].title, '阅读');
  assert.equal(entries[1].startTime, undefined);
});

test('AI postprocessing repairs missing or wrong recent times without overriding explicit times', () => {
  const input = [{ title: '拉伸', minutes: 66, startTime: '10:00', endTime: '11:06' }];
  const repaired = resolveRecentTimeEntries('刚做了拉伸，花了15分钟', input, '00:10');
  assert.deepEqual(repaired[0], { title: '拉伸', minutes: 15, startTime: '23:55', endTime: '00:10', endsNow: true });
  assert.equal(input[0].minutes, 66);
  assert.deepEqual(resolveRecentTimeEntries('刚才10:00到11:06拉伸', input, '18:30'), input);
  const multiple = resolveRecentTimeEntries('刚做了拉伸，花了15分钟；阅读20分钟', [{ title: '拉伸', minutes: 15 }, { title: '阅读', minutes: 20 }], '18:30');
  assert.equal(multiple[0].endTime, '18:30');
  assert.equal(multiple[1].endTime, undefined);
  const reversed = [{ title: '阅读', minutes: 20 }, { title: '拉伸', minutes: 15 }];
  assert.deepEqual(resolveRecentTimeEntries('刚做了拉伸15分钟；阅读20分钟', reversed, '18:30'), reversed);
});

test('actual AI parser applies code-based time correction to model responses', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = 'test-only';
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ entries: [{ title: '拉伸', minutes: 15 }] }) } }] }) });
  try {
    const { parseWithLLM } = loadTs('components/todo/llmparse.ts');
    const [entry] = await parseWithLLM('刚做了拉伸，花了15分钟', '18:30');
    assert.equal(entry.startTime, '18:15');
    assert.equal(entry.endTime, '18:30');
    assert.equal(entry.endsNow, true);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = originalKey;
  }
});
