# 02 · 数据模型与规则引擎

> 状态：生效　·　最近更新：v0.2.29（2026-09-05）　·　规范：`07-doc-standards.md`

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
└─ overrides[]  { date, action:'skip'|'move'|'retime', toDate?, startMin?, endMin? }
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

> 上表为 **v2 基线**；迁移 v3（v0.2.29）起 `schedules` 与 `settings` 另含同步列 `rev` / `deleted_at` / `last_writer`（见 §8.1），读取/渲染只返回在册记录。

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
5. 应用 overrides：命中日期 `skip` → 丢弃该日全部段；`move` → 原日期丢弃、在 `toDate` 增加；`retime` → 当日替换为 startMin/endMin。
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

1. 全部日程按重要度升序（fixed → specific → optional → temporary）、同重要度按开始时间升序；
2. 逐个放入**自下而上第一条不与之重叠的排**；只有所有已用排都重叠时才在其上方新增一排 —— **永不产生空排**；
3. **类型不保留专用排**：同排可混合不同类型（只要时间不重叠）；最底排（排 0）未被任何方块占用的区间以浅绿空闲带显示；
4. 每排时间轴同为 00:00–24:00；最底排下方绘制时间标尺（整点刻度 + 文字）；块间留 2px 间隙、圆角矩形。

> fixed×fixed 若被"强制保存"产生重叠，将自然落在相邻排（同规则下不产生额外空排）。

## 6. 类型与文件名约定

- `shared/src/types.ts`：Schedule/rule/segment/Occurrence/Conflict。
- `shared/src/engine.ts`：expand / detectConflicts / lanePack（返回每排块布局，供渲染层绝对定位）。
- `shared/src/time.ts`：minute↔HH:mm、YYYY-MM-DD 工具、周序号计算（ISO 风格，周一为一周首日）。
- 校验函数 `validateSchedule()` 在 shared，服务端保存与前端表单共用。

## 7. 完整 JSON 示例（与 API 数据一致）

固定主课（weekly，单双周锚点为空则回退设置项 termStart）：

```json
{
  "id": "d5f4…（UUID）", "title": "高等数学", "notes": "A 教 301",
  "type": "fixed", "color": "#E4574E",
  "rule": { "kind": "weekly", "weekStart": null, "oddEven": "none",
            "segments": [ { "weekday": 1, "startMin": 480, "endMin": 570 },
                          { "weekday": 3, "startMin": 600, "endMin": 690 } ] },
  "activeFrom": null, "activeTo": null,
  "overrides": [], "createdAt": "2026-09-04T…", "updatedAt": "2026-09-04T…"
}
```

社团（单周）：`rule = { kind:'weekly', weekStart:'2026-08-31', oddEven:'odd', segments:[{weekday:2,startMin:1080,endMin:1200}] }`；
隔 N 天：`rule = { kind:'interval', startDate:'2026-09-01', everyNDays:2, times:[{startMin:390,endMin:420}] }`；
一次性：`rule = { kind:'once', date:'2026-09-12', times:[{startMin:540,endMin:660}] }`。
单次例外示例：`overrides:[{date:'2026-09-08',action:'skip'},{date:'2026-09-15',action:'move',toDate:'2026-09-17'}]`。

## 8. 同步扩展（8.1 已实现 · 8.2/8.3 属 v0.4–0.5 规划）

场景与方案详见 `00-decisions.md` §1 行 8–12 与 `01-architecture.md` §1.1：PC 主机为**权威库**；
Android App 内置库为**离线工作区**；用户在局域网内**手动 pull/push/merge**。为此需要：

### 8.1 server `schedules` 表新增列（✅ 迁移 v3，v0.2.29 已实现）

```sql
ALTER TABLE schedules ADD COLUMN rev          INTEGER NOT NULL DEFAULT 0; -- 单调同步序号
ALTER TABLE schedules ADD COLUMN deleted_at   TEXT;                        -- 软删墓碑（NULL=在册）
ALTER TABLE schedules ADD COLUMN last_writer  TEXT NOT NULL DEFAULT 'pc';  -- 最后修改设备 id
UPDATE schedules SET rev = 1;   -- 既有在册行补基线（客户端 since=0 拉取时 rev>0 全部可见）
ALTER TABLE settings  ADD COLUMN rev          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings  ADD COLUMN deleted_at   TEXT;
ALTER TABLE settings  ADD COLUMN last_writer  TEXT NOT NULL DEFAULT 'pc';
UPDATE settings SET rev = 1;
```

- **rev**：主机侧每次写 +1（含移动端经 push 落库的写），作为 pull/push 的单调水印（不依赖 `updatedAt` 字符串比较，规避时钟偏移/同毫秒碰撞）。新建 = rev 1；更新 = 既有 rev + 1。
- **软删（已实现）**：写路径的 DELETE 只置 `deleted_at` 并 rev+1（墓碑），物理删除不做；删除作为一条“变更”双向传播，避免“一端删除、另一端同步后复活”。`listSchedules`/`GET /schedules`/`/occurrences`/保存时冲突检测只含在册（`deleted_at IS NULL`）记录。
- **last_writer（已实现）**：记录最后写入设备（本机 = `'pc'`，App = 其 deviceId）；服务端强制维护，客户端提交的 rev/deletedAt/lastWriter 一律忽略。

`settings` 表以 `key` 为记录单位参与同步（迁移 v3 已带 rev/墓碑/last_writer 列；`setSettings` 每次写 rev+1。当前仅 termStart 等少数键，冲突概率极低）。

### 8.2 App 内置库（规划 v0.4–0.5）

- 镜像表：`schedules` / `settings`（列同 server，含 rev/deleted_at/last_writer）；
- 同步元数据表：`sync_meta(host, device_id, token, last_pull_rev, last_push_rev, last_sync_at)`；
- **离线写队列**：新建/修改/删除先落本地镜像并标记待推送（pending）；用户点“推送”时批量上传；成功后按返回的新 rev 更新本地。
- 渲染与 Web 一致：展开/冲突/排布全部调用 `shared` 纯函数，本地库只存 Schedule 记录，不落 Occurrence。

### 8.3 冲突判定（push 阶段，主机裁决）

同一记录 `id`：主机发现“本地自 `baseRev` 以来已变化”且“客户端也自其 `last_push_rev` 以来改过” → 不落库，返回冲突清单（主机版 + 客户端版 + last_writer）；客户端进入**合并列表**由用户逐条裁决（保留主机版 / 保留本机版 / 手动编辑合并），裁决结果以新版本重推收敛。
