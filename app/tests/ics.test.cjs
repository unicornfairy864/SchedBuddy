// iCalendar（RFC 5545 + RFC 6868）自测：node tests/ics.test.cjs
const assert = require('node:assert');
const {
  scheduleToIcs, parseIcs, eventsToSchedules, parseRRule,
  escapeText, decodeText, escapeParamValue, decodeParamValue,
  contentLine, parseLines, dateTimeFloating,
} = require('../shared/dist/index.cjs');

let n = 0;
function check(name, fn) { fn(); console.log('  ✓', name); n++; }

const base = { notes: '', color: '#4A90E2', activeFrom: null, activeTo: null, occurrenceLimit: null, overrides: [] };
const s1 = { ...base, id: 's1', title: '高等数学', rule: { kind: 'weekly', weekStart: null, oddEven: 'none', segments: [{ weekday: 1, startMin: 480, endMin: 590 }, { weekday: 3, startMin: 480, endMin: 590 }] } };
const s2 = { ...base, id: 's2', title: '晨跑', rule: { kind: 'interval', startDate: '2026-09-01', everyNDays: 3, times: [{ startMin: 390, endMin: 420 }] } };
const s3 = { ...base, id: 's3', title: '六级模考', rule: { kind: 'once', date: '2026-09-26', times: [{ startMin: 540, endMin: 690 }] }, overrides: [] };

// —— A2：文本 / 参数值转义 ——
check('escapeText/decodeText 往返', () => {
  const src = 'A\\B;C,D\nE';
  assert.strictEqual(decodeText(escapeText(src)), src);
});
check('RFC6868 caret 参数编码', () => {
  assert.strictEqual(escapeParamValue('a^b\nc"d'), 'a^^b^nc^\'d');
  assert.strictEqual(decodeParamValue('a^^b^nc^\'d'), 'a^b\nc"d');
});
check('contentLine 折叠与 parseLines 复原', () => {
  const long = '测试'.repeat(60); // 多字节：验证折叠不切 UTF-8
  const line = contentLine('SUMMARY', [['X-P', 'v^v']], long);
  const parsed = parseLines('BEGIN:VCALENDAR\r\n' + line + '\r\nEND:VCALENDAR');
  const sum = parsed.find((p) => p.name === 'SUMMARY');
  assert.ok(sum, '应能解析出 SUMMARY');
  assert.strictEqual(sum.value, long);
  assert.deepStrictEqual(sum.params['X-P'], ['v^v']);
});

// —— 一次性 ——
check('once → DTSTART/DTEND', () => {
  const ics = scheduleToIcs([s3], { from: '2026-09-01', to: '2026-09-30', termStart: null });
  assert.ok(ics.includes('DTSTART:20260926T090000'));
  assert.ok(ics.includes('DTEND:20260926T113000'));
  const { events, ignored } = parseIcs(ics);
  assert.strictEqual(events.length, 1);
  const { schedules } = eventsToSchedules(events);
  assert.strictEqual(schedules[0].rule.kind, 'once');
  assert.strictEqual(schedules[0].rule.date, '2026-09-26');
});

// —— 周规则 ——
check('weekly 多段 → 每段 VEVENT(RRULE WEEKLY BYDAY) + 往返', () => {
  const ics = scheduleToIcs([s1], { from: '2026-09-01', to: '2026-09-30', termStart: null });
  assert.ok(ics.includes('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'));
  assert.ok(ics.includes('FREQ=WEEKLY;INTERVAL=1;BYDAY=WE'));
  assert.ok(ics.includes('DTSTART:20260907T080000')); // 首个周一
  assert.ok(ics.includes('DTSTART:20260902T080000')); // 首个周三
  const { events } = parseIcs(ics);
  assert.ok(events.length >= 2);
  const { schedules } = eventsToSchedules(events);
  const wk = schedules.find((s) => s.rule.kind === 'weekly');
  assert.ok(wk, '应重建为 weekly');
  assert.deepStrictEqual(wk.rule.segments.map((x) => x.weekday).sort(), [1, 3]);
  assert.deepStrictEqual(wk.rule.segments[0], { weekday: 1, startMin: 480, endMin: 590 });
});

// —— interval ——
check('interval → FREQ=DAILY;INTERVAL=N', () => {
  const ics = scheduleToIcs([s2], { from: '2026-09-01', to: '2026-09-30', termStart: null });
  assert.ok(ics.includes('FREQ=DAILY;INTERVAL=3'));
  const { events } = parseIcs(ics);
  const { schedules } = eventsToSchedules(events);
  const iv = schedules[0];
  assert.strictEqual(iv.rule.kind, 'interval');
  assert.strictEqual(iv.rule.everyNDays, 3);
});

// —— 单双周 ——
check('单双周(INTERVAL=2) 相位锚定', () => {
  const odd = { ...base, id: 'odd1', title: '篮球社', rule: { kind: 'weekly', weekStart: '2026-08-31', oddEven: 'odd', segments: [{ weekday: 2, startMin: 990, endMin: 1080 }] } };
  const ics = scheduleToIcs([odd], { from: '2026-09-01', to: '2026-10-31', termStart: '2026-08-31' });
  assert.ok(ics.includes('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'));
  // 2026-09-01 所在周 = 第 1 周(锚 8/31) → 周二 9/1 为单周应命中；解析重建为 odd
  const { events } = parseIcs(ics);
  const { schedules } = eventsToSchedules(events);
  const wk = schedules[0];
  assert.strictEqual(wk.rule.oddEven, 'odd');
  assert.ok(wk.rule.weekStart);
});

// —— skip → EXDATE ——
check('skip 单次 → EXDATE', () => {
  const s = { ...s1, overrides: [{ date: '2026-09-14', action: 'skip' }] }; // 周一
  const ics = scheduleToIcs([s], { from: '2026-09-01', to: '2026-09-30', termStart: null });
  assert.ok(ics.includes('EXDATE:20260914T080000'), ics);
});

// —— 课程总数量：显式 RDATE ——
check('课程总数量 → DTSTART + RDATE 列表', () => {
  const s = { ...s1, occurrenceLimit: 3 };
  const ics = scheduleToIcs([s], { from: '2026-09-01', to: '2026-09-30', termStart: null });
  assert.ok(ics.includes('RDATE:'), '应含 RDATE');
  assert.ok(ics.includes('DTSTART:20260902T080000'), '最早发生日（周三）为首个 DTSTART');
});

// —— 未知/忽略 ——
check('不支持项进入 ignored 而不抛错', () => {
  const txt = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:u1\r\nDTSTART:20260901T090000\r\nDTEND:20260901T093000\r\nRRULE:FREQ=MONTHLY\r\nSUMMARY:x\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  const { events, ignored } = parseIcs(txt);
  assert.strictEqual(events.length, 0); // RRULE 不支持 → 不入事件（本实现忽略整事件）
  assert.ok(ignored.some((x) => x.includes('RRULE')), JSON.stringify(ignored));
});

console.log(`\niCalendar 自测全部通过（${n} 组）`);
