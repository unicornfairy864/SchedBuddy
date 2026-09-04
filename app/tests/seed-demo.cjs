// 演示数据（幂等：每次执行先清空再重建）。运行：node tests/seed-demo.cjs
const BASE = 'http://127.0.0.1:3876';

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  // 1) 清空（先读出现有 id）
  const cur = await req('GET', '/api/schedules');
  for (const s of cur.data.schedules ?? []) await req('DELETE', '/api/schedules/' + s.id);

  // 2) 学期起点：2026-08-31（周一）
  await req('PUT', '/api/settings', { settings: { termStart: '2026-08-31' } });

  const weekly = (title, type, color, segments, extra = {}) => ({
    title, notes: extra.notes ?? '', type, color,
    rule: { kind: 'weekly', weekStart: null, oddEven: extra.oddEven ?? 'none', segments },
    overrides: [], activeFrom: null, activeTo: null, ...extra.cleanup,
  });

  const demo = [
    // —— 固定日程（主课）——
    { ...weekly('高等数学', 'fixed', '#E4574E', [
      { weekday: 1, startMin: 8 * 60, endMin: 9 * 60 + 30 },
      { weekday: 3, startMin: 10 * 60, endMin: 11 * 60 + 30 },
    ], { notes: 'A 教 301 · 单双周都有' }) },
    { ...weekly('大学英语', 'fixed', '#E4574E', [
      { weekday: 2, startMin: 10 * 60, endMin: 11 * 60 + 30 },
    ], { notes: '听力教室 B204' }) },
    { ...weekly('人文通识', 'fixed', '#E4574E', [
      { weekday: 4, startMin: 13 * 60, endMin: 14 * 60 + 30 },
    ], { notes: '' }) },
    // —— 特定日程（社团，单/双周）——
    { ...weekly('篮球社训练', 'specific', '#4A90E2', [
      { weekday: 2, startMin: 18 * 60, endMin: 20 * 60 },
    ], { oddEven: 'odd', notes: '单周周二 · 南操场' }), rule: { kind: 'weekly', weekStart: '2026-08-31', oddEven: 'odd', segments: [{ weekday: 2, startMin: 18 * 60, endMin: 20 * 60 }] } },
    { ...weekly('吉他社合奏', 'specific', '#4A90E2', [
      { weekday: 5, startMin: 19 * 60, endMin: 21 * 60 },
    ], { oddEven: 'even', notes: '双周周五 · 活动中心 202' }), rule: { kind: 'weekly', weekStart: '2026-08-31', oddEven: 'even', segments: [{ weekday: 5, startMin: 19 * 60, endMin: 21 * 60 }] } },
    // 隔 N 天
    {
      title: '晨跑打卡', notes: '每 2 天一次，6:30 北门集合', type: 'specific', color: '#2FB98A',
      rule: { kind: 'interval', startDate: '2026-09-01', everyNDays: 2, times: [{ startMin: 390, endMin: 420 }] },
      overrides: [], activeFrom: null, activeTo: null,
    },
    // —— 可选日程（水课，可翘）——
    { ...weekly('毛概（水课·可翘）', 'optional', '#F5A623', [
      { weekday: 3, startMin: 10 * 60 + 30, endMin: 12 * 60 },
    ], { notes: '与周三高数后半段重叠，可翘' }) },
    // —— 临时日程（竞赛/考试）——
    {
      title: 'ACM 校赛初赛', notes: '机房 C 区 · 提前交卷可去社团招新', type: 'temporary', color: '#9B7EDE',
      rule: { kind: 'once', date: '2026-09-12', times: [{ startMin: 9 * 60, endMin: 11 * 60 }] },
      overrides: [], activeFrom: null, activeTo: null,
    },
  ];

  let conflictDemo = null;
  for (const d of demo) {
    const r = await req('POST', '/api/schedules', d);
    if (r.status !== 201) {
      console.log('!! 插入失败', d.title, r.status, JSON.stringify(r.data).slice(0, 300));
      continue;
    }
    if (r.data.conflicts?.warnings?.length) conflictDemo = r.data.conflicts;
  }

  // 冲突策略演示：fixed 重叠应被拒绝(409)
  const badFixed = weekly('撞课的线代', 'fixed', '#E4574E', [
    { weekday: 1, startMin: 8 * 60 + 30, endMin: 9 * 60 }, // 与高数周一重叠
  ]);
  const reject = await req('POST', '/api/schedules', badFixed);

  const list = await req('GET', '/api/schedules');
  console.log('OK 种子完成：日程数 =', (list.data.schedules ?? []).length);
  console.log('OK 冲突告警示例：', conflictDemo ? conflictDemo.warnings.map((w) => `${w.a.title} × ${w.b.title}`).join('，') : '无');
  console.log('OK fixed×fixed 应 409：实际', reject.status, reject.data.error ?? '');
  if (reject.status !== 409) process.exitCode = 1;
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
