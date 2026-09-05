// 规则引擎自测（Node 直接运行：node tests/engine.test.cjs）
const assert = require('node:assert');
const {
  expandSchedule,
  detectConflicts,
  packDay,
  validateSchedule,
  weekdayOf,
  addDays,
} = require('../shared/dist/index.cjs');

const base = {
  id: 's1', title: '测试', notes: '', color: '#4A90E2', type: 'specific',
  activeFrom: null, activeTo: null, overrides: [],
  createdAt: '', updatedAt: '',
};

let n = 0;
function check(name, fn) {
  fn();
  console.log('  ✓', name);
  n++;
}

// ---- weekly 多段 ----
{
  const s = {
    ...base,
    rule: {
      kind: 'weekly', weekStart: '2025-09-01', oddEven: 'none',
      segments: [
        { weekday: 1, startMin: 8 * 60, endMin: 9 * 60 + 30 },
        { weekday: 3, startMin: 10 * 60, endMin: 11 * 60 + 30 },
      ],
    },
  };
  const occ = expandSchedule(s, { from: '2025-09-01', to: '2025-09-14', termStart: null });
  assert.strictEqual(occ.length, 4); // 周一&周三 × 两周
  assert.strictEqual(occ[0].date, '2025-09-01');
  assert.strictEqual(occ[0].startMin, 480);
  check('weekly 多段两周展开=4', () => {});
}

// ---- 单双周 ----
{
  const s = {
    ...base,
    rule: {
      kind: 'weekly', weekStart: '2025-09-01', oddEven: 'odd',
      segments: [{ weekday: 2, startMin: 18 * 60, endMin: 20 * 60 }],
    },
  };
  const occ = expandSchedule(s, { from: '2025-09-01', to: '2025-09-30', termStart: '2025-09-01' });
  // 单周：第1周(9/1-9/7 周二=9/2)、第3周(9/16)、第5周(9/30)
  assert.deepStrictEqual(occ.map((o) => o.date), ['2025-09-02', '2025-09-16', '2025-09-30']);
  check('单周仅命中奇数周', () => {});
}

// ---- 隔 N 天 ----
{
  const s = {
    ...base,
    rule: {
      kind: 'interval', startDate: '2025-09-01', everyNDays: 3,
      times: [{ startMin: 12 * 60, endMin: 13 * 60 }],
    },
  };
  const occ = expandSchedule(s, { from: '2025-09-01', to: '2025-09-10', termStart: null });
  assert.deepStrictEqual(occ.map((o) => o.date), ['2025-09-01', '2025-09-04', '2025-09-07', '2025-09-10']);
  check('隔3天展开正确', () => {});
}

// ---- once ----
{
  const s = {
    ...base,
    rule: { kind: 'once', date: '2025-12-20', times: [{ startMin: 540, endMin: 600 }, { startMin: 660, endMin: 720 }] },
  };
  const occ = expandSchedule(s, { from: '2025-12-01', to: '2025-12-31', termStart: null });
  assert.strictEqual(occ.length, 2);
  check('一次性多窗口', () => {});
}

// ---- 生效范围 ----
{
  const s = {
    ...base,
    activeFrom: '2025-09-15', activeTo: '2025-09-21',
    rule: { kind: 'weekly', weekStart: null, oddEven: 'none', segments: [{ weekday: 1, startMin: 480, endMin: 600 }] },
  };
  const occ = expandSchedule(s, { from: '2025-09-01', to: '2025-09-30', termStart: null });
  assert.deepStrictEqual(occ.map((o) => o.date), ['2025-09-15']);
  check('生效日期范围过滤', () => {});
}

// ---- override skip / move ----
{
  const s = {
    ...base,
    rule: { kind: 'weekly', weekStart: null, oddEven: 'none', segments: [{ weekday: 1, startMin: 480, endMin: 600 }] },
    overrides: [
      { date: '2025-09-08', action: 'skip' },
      { date: '2025-09-15', action: 'move', toDate: '2025-09-17' },
    ],
  };
  const occ = expandSchedule(s, { from: '2025-09-01', to: '2025-09-30', termStart: null });
  assert.deepStrictEqual(occ.map((o) => o.date), ['2025-09-01', '2025-09-17', '2025-09-22', '2025-09-29']);
  check('单次跳过+改期', () => {});
}

// ---- 冲突检测：fixed×fixed = error ----
{
  const a = { ...base, id: 'a', title: '数学', type: 'fixed', rule: { kind: 'weekly', weekStart: null, oddEven: 'none', segments: [{ weekday: 1, startMin: 480, endMin: 600 }] } };
  const b = { ...base, id: 'b', title: '英语', type: 'fixed', rule: { kind: 'weekly', weekStart: null, oddEven: 'none', segments: [{ weekday: 1, startMin: 540, endMin: 660 }] } };
  const det = detectConflicts([a, b], a, { from: '2025-09-01', to: '2025-09-07', termStart: null });
  assert.strictEqual(det.errors.length, 1);
  assert.strictEqual(det.warnings.length, 0);
  check('fixed×fixed 重叠=error', () => {});

  // fixed × optional = warning
  const c = { ...base, id: 'c', title: '水课', type: 'optional', rule: { kind: 'weekly', weekStart: null, oddEven: 'none', segments: [{ weekday: 1, startMin: 540, endMin: 660 }] } };
  const det2 = detectConflicts([a, c], c, { from: '2025-09-01', to: '2025-09-07', termStart: null });
  assert.strictEqual(det2.errors.length, 0);
  assert.strictEqual(det2.warnings.length, 1);
  check('fixed×optional 重叠=warning', () => {});
}

// ---- 自身重叠 ----
{
  const s = {
    ...base,
    rule: { kind: 'weekly', weekStart: null, oddEven: 'none', segments: [{ weekday: 1, startMin: 480, endMin: 600 }, { weekday: 1, startMin: 540, endMin: 700 }] },
  };
  const det = detectConflicts([], s, { from: '2025-09-01', to: '2025-09-07', termStart: null });
  assert.strictEqual(det.errors.length, 1);
  check('自身时段重叠=error', () => {});
}

// ---- packDay 排布 ----
{
  const mk = (id, type, s, e, color) => ({ scheduleId: id, title: id, type, color, date: '2025-09-01', startMin: s, endMin: e });
  const items = [
    mk('数学', 'fixed', 480, 600, '#E4574E'),
    mk('人文', 'fixed', 780, 870, '#E4574E'),
    mk('社团', 'specific', 540, 620, '#4A90E2'),   // 与数学重叠 -> 上排
    mk('社团2', 'specific', 800, 880, '#4A90E2'),  // 与人文重叠 -> 上排1? 与社团同排?(540-620 vs 800-880 不重叠)
    mk('水课', 'optional', 500, 700, '#F5A623'),   // 与数学&社团重叠
  ];
  const res = packDay(items);
  assert.strictEqual(res.laneCount, 3);
  const laneOf = Object.fromEntries(res.placed.map((p) => [p.occ.scheduleId, p.lane]));
  assert.strictEqual(laneOf['数学'], 0);
  assert.strictEqual(laneOf['人文'], 0);
  assert.strictEqual(laneOf['社团'], 1);
  assert.strictEqual(laneOf['社团2'], 1);
  assert.strictEqual(laneOf['水课'], 2);
  // row0 空闲 = 0-480, 600-780, 870-1440
  assert.deepStrictEqual(res.row0Free, [[0, 480], [600, 780], [870, 1440]]);
  check('packDay 按重要度堆叠+row0空闲', () => {});

  // 无空排：仅临时日程（如 9/12 ACM）只占 1 排
  const solo = packDay([mk('ACM 校赛', 'temporary', 540, 660, '#9B7EDE')]);
  assert.strictEqual(solo.laneCount, 1);
  assert.strictEqual(solo.placed[0].lane, 0);
  assert.deepStrictEqual(solo.row0Free, [[0, 540], [660, 1440]]);
  check('仅临时日程占1排(无空排)', () => {});

  // 混排：可选课不与固定课重叠 → 与固定课共用同一排
  const mixed = packDay([
    mk('高等数学', 'fixed', 480, 600, '#E4574E'),
    mk('水课(14点)', 'optional', 840, 900, '#F5A623'),
  ]);
  assert.strictEqual(mixed.laneCount, 1);
  assert.ok(mixed.placed.every((p) => p.lane === 0));
  check('无重叠可选与固定同排(无空排)', () => {});
}

// ---- 课程总数量（按天计次）----
{
  // weekly 每周一&三，限 3 天 → 第 1 周 一/三 + 第 2 周 一 后截止
  const s = {
    ...base,
    occurrenceLimit: 3,
    rule: {
      kind: 'weekly', weekStart: '2025-09-01', oddEven: 'none',
      segments: [
        { weekday: 1, startMin: 8 * 60, endMin: 9 * 60 + 30 },
        { weekday: 3, startMin: 10 * 60, endMin: 11 * 60 + 30 },
      ],
    },
  };
  const occ = expandSchedule(s, { from: '2025-09-01', to: '2025-10-31', termStart: '2025-09-01' });
  assert.deepStrictEqual(occ.map((o) => o.date), ['2025-09-01', '2025-09-03', '2025-09-08']);
  check('总数量3天：周一&周三截止', () => {});

  // interval 每 3 天，限 2 天 → 仅前两次
  const s2 = {
    ...base,
    occurrenceLimit: 2,
    rule: { kind: 'interval', startDate: '2025-09-01', everyNDays: 3, times: [{ startMin: 12 * 60, endMin: 13 * 60 }] },
  };
  const occ2 = expandSchedule(s2, { from: '2025-09-01', to: '2025-12-31', termStart: null });
  assert.deepStrictEqual(occ2.map((o) => o.date), ['2025-09-01', '2025-09-04']);
  check('总数量2次：隔3天仅前两次', () => {});
}

// ---- validate ----
{
  assert.ok(validateSchedule({ ...base, title: '', rule: { kind: 'weekly', weekStart: null, oddEven: 'odd', segments: [] } }).length >= 2);
  const s = { ...base, title: 'x', rule: { kind: 'weekly', weekStart: '2025-09-01', oddEven: 'odd', segments: [{ weekday: 1, startMin: 480, endMin: 600 }] } };
  assert.strictEqual(validateSchedule(s).length, 0);
  check('校验器', () => {});
}

console.log(`\n引擎自测全部通过（${n} 组）`);
