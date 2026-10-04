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
const { parseTimeEntries, resolveRecentTimeEntries, resolveRelativeEntryDays } = loadTs('components/todo/nlparse.ts');

test('historical duration gets explicit relative date without invented clock times', () => {
  for (const input of ['昨日做了阅读两小时', '昨天做了阅读，花了2小时', '我昨日刚做了阅读两小时']) {
    const [entry] = parseTimeEntries(input, '18:30');
    assert.equal(entry.title, '阅读', input);
    assert.equal(entry.dayOffset, -1);
    assert.equal(entry.minutes, 120);
    assert.equal(entry.startTime, undefined);
    assert.equal(entry.endTime, undefined);
    assert.equal(entry.endsNow, undefined);
  }
  assert.equal(parseTimeEntries('前天阅读三小时', '18:30')[0].dayOffset, -2);
  assert.equal(parseTimeEntries('今日阅读一小时', '18:30')[0].dayOffset, 0);
  assert.equal(parseTimeEntries('阅读一小时', '18:30')[0].dayOffset, undefined);
  assert.equal(parseTimeEntries('昨天9点开始阅读', '18:30').length, 0);
});

test('relative days follow each activity and preserve explicit overnight ranges', () => {
  const entries = parseTimeEntries('昨天阅读2小时，运动30分钟；今天写作1小时；刚做了拉伸15分钟', '18:30');
  assert.deepEqual(entries.map(e => e.dayOffset), [-1, -1, 0, 0]);
  assert.equal(entries[3].endsNow, true);
  const [night] = parseTimeEntries('昨晚22:30到00:30看电视', '18:30');
  assert.equal(night.dayOffset, -1);
  assert.equal(night.startTime, '22:30');
  assert.equal(night.endTime, '00:30');
  assert.equal(night.minutes, 120);
});

test('AI date repair handles omitted dates and clears hallucinated recent clock times', () => {
  const repaired = resolveRelativeEntryDays('昨日做了阅读2小时', [{title: '阅读', minutes: 120, startTime: '16:30', endTime: '18:30', endsNow: true}]);
  assert.equal(repaired[0].dayOffset, -1);
  assert.equal(repaired[0].startTime, undefined);
  assert.equal(repaired[0].endsNow, undefined);
});

test('overnight labels distinguish start-day ranges from end-day recent/timer records', () => {
  const { entryTimeLabel } = loadTs('components/todo/time.ts');
  const range = { startTime: '22:30', endTime: '00:30' };
  assert.equal(entryTimeLabel(range), '22:30 - 次日 00:30');
  assert.equal(entryTimeLabel({ ...range, dateAnchor: 'start' }), '22:30 - 次日 00:30');
  assert.equal(entryTimeLabel({ ...range, dateAnchor: 'end' }), '前一天 22:30 - 00:30');
  assert.equal(entryTimeLabel({ startTime: '10:00', endTime: '11:00', dateAnchor: 'end' }), '10:00 - 11:00');
  assert.equal(entryTimeLabel({}), '补记');
});

test('ledger sorting respects overnight direction, stable ties and untimed records', () => {
  const { compareEntriesByStartTime } = loadTs('components/todo/time.ts');
  const entries = [
    { id: 'untimed' },
    { id: 'late', startTime: '23:30', endTime: '00:30', dateAnchor: 'start' },
    { id: 'morning', startTime: '10:10', endTime: '10:55', dateAnchor: 'end' },
    { id: 'overnight', startTime: '23:10', endTime: '00:21', dateAnchor: 'end' },
    { id: 'early', startTime: '00:51', endTime: '01:46' },
    { id: 'legacy', startTime: '22:30', endTime: '00:30' },
    { id: 'earlier-overnight', startTime: '22:00', endTime: '00:10', dateAnchor: 'end' },
    { id: 'same-start', startTime: '00:51' },
    { id: 'untimed2', endTime: '13:00' },
  ];
  const before = structuredClone(entries);
  assert.deepEqual([...entries].sort(compareEntriesByStartTime).map(e => e.id), [
    'earlier-overnight', 'overnight', 'early', 'same-start', 'morning', 'legacy', 'late', 'untimed', 'untimed2',
  ]);
  assert.deepEqual(entries, before);
});

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

test('explicit overnight ranges and start-plus-duration are not guessed into the afternoon', () => {
  for (const text of ['22:30到00:30陪伴侣看电视', '22点30到0点30陪伴侣看电视', '晚上10点半到次日凌晨0点半陪伴侣看电视', '22:30陪伴侣看电视2小时']) {
    const [entry] = parseTimeEntries(text, '19:57');
    assert.equal(entry.startTime, '22:30', text);
    assert.equal(entry.endTime, '00:30', text);
    assert.equal(entry.minutes, 120, text);
    assert.equal(entry.endsNow, undefined, text);
  }
  assert.equal(parseTimeEntries('9点到2点读书', '19:57')[0].endTime, '14:00');
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
