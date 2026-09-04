# 02 · 数据模型与规则引擎

## 1. 概念模型

```
Schedule（一个条目）
├─ id / title / notes / color('#rrggbb')
├─ type: 'fixed'|'specific'|'optional'|'temporary'   ← 重要度来源
├─ rule:  weekly | interval | once                    ← 如何确定“发生哪些日子”
├─ segments[]:  该规则下的时段明细
│     weekly → [{ weekday:1..7, startMin, endMin }]    (1=周一)
│     once   → [{ date:'YYYY-MM-DD', startMin, endMin }]
│     interval → [{ startMin, endMin }]                (每次发生都套用)
├─ activeFrom?/activeTo?  'YYYY-MM-DD'                 ← 生效日期范围
└─ overrides[]  { date, action:'skip'|'reschedule'|'retime', targetDate?, startMin?, endMin? }
```

- `startMin/endMin` = 当日分钟数（0–1439，endMin > startMin），展示层换算成 HH:mm。
- 重要度：`fixed=0 < specific=1 < optional=2 < temporary=3`（越小越靠底部、越先参与排布）。
- 规则为判别联合（discriminated union）+ JSON 列存储，新增类别/规则只增不改表结构。

## 2. SQLite 表结构（server 首次启动自动建表 + 迁移版本）

```sql
CREATE TABLE IF NOT EXISTS schedules (
  id         TEXT PRIMARY KEY,          -- crypto.randomUUID()
  title      TEXT NOT NULL,
  notes      TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL CHECK(type IN ('fixed','specific','optional','temporary')),
  color      TEXT NOT NULL DEFAULT '#4A90E2',
  rule_json  TEXT NOT NULL,             -- {kind:'weekly'|'interval'|'once', weekStart?, oddEven?, startDate?, everyNDays?, date?}
  segments_json TEXT NOT NULL,          -- 见上 segments[]
  overrides_json TEXT NOT NULL DEFAULT '[]',
  active_from TEXT,                     -- 'YYYY-MM-DD' | null
  active_to   TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                    -- JSON
);
```

`settings` 内置键：`termStart`（学期第 1 周周一的日期，单双周锚点）、`termEnd`、`weekCount`、`holidays`(停课日期 JSON)、`defaultColor`、`ui`。

## 3. 规则展开引擎（shared 纯函数，浏览器与服务器共用）

`expand(schedule, from, to): Occurrence[]`

```
Occurrence = { scheduleId, date, startMin, endMin }
```

展开步骤（对 `[from, to]` 窗口内每一天）：
1. **weekly**：命中规则内的 weekday；若 `oddEven ≠ none`，用 `weekStart` 计算该日期所在周序号，仅奇数/偶数周命中；无 `weekStart` 时回退 `settings.termStart`，仍无 → 该日程不产生（UI 创建时即提示）。
2. **interval**：日期 = `startDate + k × everyNDays`（k≥0）落在窗口内，每次取 rule 的时段窗口。
3. **once**：日期 = `date` 在窗口内。
4. 过滤：`date < activeFrom || date > activeTo` 丢弃。
5. 应用 overrides：命中日期 `skip` → 丢弃该日全部段；`reschedule` → 原日期丢弃、在 `targetDate` 增加；`retime` → 当日替换时间。
6. 输出升序 Occurrence 列表（用于渲染与冲突判定，不落库——规则修改即时生效）。

边界：跨午夜时长不允许（endMin ≤ 1439）；重叠校验按半开区间 `[start,end)`。

## 4. 冲突检测（shared 纯函数）

`detectConflicts(schedules, schedule, from, to): Conflict[]`（保存前对目标条目展开并两两比对）：

| 组合 | 结果 |
| --- | --- |
| fixed × fixed（同日同时段重叠） | **错误（默认拒绝）**，UI 列出，可勾选"强制保存"传 `force:true` |
| 其余任意组合重叠 | 黄色警告列表；默认允许"仍要保存" |
| 同一日程自身时段重叠 | 错误（表单校验拒绝） |

Conflict = { date, a:{title,type,start,end}, b:{title,type,start,end} }。

## 5. 排布（lane packing，视图渲染用）

对**某一天**的全部 Occurrence（按日程去重、时段切分）排横向条：

1. 最低一排（排 0）承载全部 `fixed` 块；底色 = 浅绿空闲带（未被 fixed 占用的区间显示为绿色空闲）。
2. 其余日程按重要度升序（specific → optional → temporary）、同重要度按开始时间升序，逐个放入**自下而上第一条无重叠的排**；若均重叠则在其上新增一排。
3. 每排时间轴同为 00:00–24:00；最底排下方绘制时间标尺（整点刻度 + 文字）。
4. 当天所需排数 n = 1（固定排）+ 实际用到的叠加排数；块间留 2px 间隙、圆角矩形。

> 被"强制保存"产生 fixed×fixed 重叠时，重叠方排入上方叠加排并加虚线描边提示（边缘场景，文档化约定）。

## 6. 类型与文件名约定

- `shared/src/types.ts`：Schedule/rule/segment/Occurrence/Conflict。
- `shared/src/engine.ts`：expand / detectConflicts / lanePack（返回每排块布局，供渲染层绝对定位）。
- `shared/src/time.ts`：minute↔HH:mm、YYYY-MM-DD 工具、周序号计算（ISO 风格，周一为一周首日）。
- 校验函数 `validateSchedule()` 在 shared，服务端保存与前端表单共用。
