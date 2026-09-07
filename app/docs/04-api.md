# 04 · API 约定

> 状态：生效　·　最近更新：v0.3.10（2026-09-06）　·　规范：`07-doc-standards.md`

Base：`http://<host>:3876/api`。JSON；日期 `YYYY-MM-DD`，时间用分钟或 `HH:mm`（见各接口）。错误统一 `{ error: string, details?: unknown }`。

## 访问控制（写保护）

**现状**：服务绑定 `0.0.0.0`。对写请求（POST/PUT/DELETE）检查 socket 远端地址：
- `127.0.0.1` / `::1`（回环）→ 允许（桌面本机）；
- 其余（LAN）→ `403 { error: "readonly" }`。
- GET 一律放行。

**规划（v0.4 起，随 App 引入）**：写判定改为 **回环地址** 或 **携带有效设备 token**（`Authorization: Bearer <token>`，经 `/api/pair` PIN 一次性配对换发）；未配对 LAN 客户端（含手机浏览器）仍 403 只读。详见 §规划扩展接口。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/meta` | `{ version, readOnly, port, lan|null, termStart?, now }`（`lan` = 本机局域网访问地址，v0.3.3 起） |
| GET | `/api/schedules` | 全部**在册**日程（含 rule/segments/overrides JSON；每条含同步元字段 `rev`/`deletedAt`/`lastWriter`） |
| POST | `/api/schedules` | 新建；body: Schedule 对象（不含 id/created_at/updated_at 及同步元字段）；`force?:boolean`。错误：`{error:'conflict', conflicts:[...]}` 或 `{error:'invalid', issues:[...]}`。新建 = rev 1、lastWriter `'pc'` |
| PUT | `/api/schedules/:id` | 全量更新，同上校验；保存即视为在册，rev = 既有值 + 1 |
| DELETE | `/api/schedules/:id` | **软删除**（v0.2.29 起）：置 `deleted_at` 墓碑并 rev+1，删除可随同步传播；在册记录删除 → `{ok:true, deleted:true}`；已删除或不存在 → `404` |
| GET | `/api/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD` | 服务端展开结果（调试/只读端可选缓存用） |
| GET/PUT | `/api/settings` | `{ termStart?, termEnd?, weekCount?, holidays?, ui? }` |
| GET | `/api/export` | 全量 JSON：`{ version, exportedAt, settings, schedules }`（schedules = 在册全部；settings 全键），供备份/迁移 |
| POST | `/api/import` | 导入备份 JSON（合并式）：逐条校验通过的 schedule 按 id **覆盖/复活**（清墓碑、rev+1）或新增；`settings` 并入；文件外的既有日程保留。返回 `{ ok, failed, bad:[{title?,issues}] }` |
| GET | `/api/export.ics?from=&to=` | 导出 iCalendar（RFC 5545）文本（`text/calendar` 下载）；缺省 from=今天、to=+365 天；映射见 `09-icalendar.md` |
| POST | `/api/import.ics` | 导入 iCalendar 文本（body `{text}`）：支持子集重建为日程并按 id 覆盖/新增；返回 `{ ok, failed, bad, ignored[] }`（不支持项忽略并报告） |

服务端保存流程：`validateSchedule`（shared）→ 冲突检测 `detectConflicts`（shared，窗口 = 该日程可能影响范围，缺省 ±1 年）→ 策略判定 → 写库。

> **已实现（v0.2.29，v0.3 数据层）**：DELETE 已由物理删除改为**软删**（置 `deleted_at` 墓碑并 rev+1）；写路径由服务端维护 `rev`/`deleted_at`/`last_writer`（客户端提交值一律忽略）；`GET /schedules`、`/occurrences`、保存时冲突检测均只含在册（未删除）日程，墓碑仅保留供 v0.5 同步 pull 消费（见 `02-data-model.md` §8）。

## 规划扩展接口（已决策 · v0.4–0.5 实现；当前代码未含）

面向 Android App 的移动写端接口。Base 同 `/api`；除 `meta` 外 GET 放行，写类均校验 token。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/pair` | PIN 一次性配对：`body { pin }` → `201 { deviceId, token }`（token 长期有效，可撤销）；PIN 由主机端生成（单次、短时效） |
| GET | `/api/sync/pull?since=<rev>` | 增量拉取：`since` = 客户端上次同步到的 rev（首次省略 = 全量）。返回 `{ upto, schedules:[…], settings:[…], tombstones:[{id, deletedAt}] }`，仅含 `rev > since` 的变更 |
| POST | `/api/sync/push` | 增量推送：`body { deviceId, baseRev, changes:[…] }`，每条 change = 完整 Schedule（或墓碑 `{id, deleted:true}`）。无冲突 → 逐条落库、rev 递增，返回 `{ accepted:[{id, rev}], upto }`；存在冲突 → 冲突记录**不落库**，返回 `{ conflicts:[{ id, serverVersion, clientVersion }] }`，客户端进入人工 merge |
| POST | `/api/sync/merge` | 冲突裁决结果上传：`body { deviceId, decisions:[{ id, resolution:'server'|'client'|{ mergedSchedule } }] }` → 落库并递增 rev（`'server'` 表示弃用本机版、无写入） |

错误：token 缺失/无效 → `401 { error:'unauthorized' }`；PIN 错误/过期 → `403 { error:'badpin' }`；`baseRev` 落后（期间主机已前移）→ `409 { error:'conflict', baseRev, currentRev }` 需重拉再推。

## 数据目录与备份

- 目录：`SCHEDBUDDY_DATA` 或默认仓库 `app/data`。
- 自动备份：服务启动时若距上次备份 ≥ 24h，复制 `schedbuddy.db` → `backups/schedbuddy-<ts>.db`，最多保留 14 份（可配置）。
- 前端静态文件目录：`web/dist`（不存在时仅 API 可用，便于前后端并行开发）。

## 端口与配置

默认 `3876`；环境变量唯一来源为 `SCHEDBUDDY_PORT`（另有 `SCHEDBUDDY_DATA`、`SCHEDBUDDY_WEB`，见 `06-dev-conventions.md` §9）；与常见 3000/5173/3080 不冲突。

## 请求/响应示例

创建固定日程（每周一 08:00–09:30）：

```jsonc
POST /api/schedules
{
  "title": "高等数学", "notes": "A 教 301", "type": "fixed", "color": "#E4574E",
  "rule": { "kind": "weekly", "weekStart": null, "oddEven": "none",
            "segments": [{ "weekday": 1, "startMin": 480, "endMin": 570 }] },
  "overrides": [], "activeFrom": null, "activeTo": null
}
// 201
{ "schedule": { "id": "…uuid…", "title": "高等数学", /* …同上… */ },
  "conflicts": { "errors": [], "warnings": [] } }
```

与现有固定课重叠（409）：

```jsonc
POST /api/schedules   // fixed × fixed 重叠且未 force
→ 409 { "error": "conflict",
        "conflicts": { "errors": [ { "date": "2026-09-07", "total": 1,
             "a": { "scheduleId": "…", "title": "线代", "type": "fixed", "startMin": 510, "endMin": 570 },
             "b": { "scheduleId": "…", "title": "高等数学", "type": "fixed", "startMin": 480, "endMin": 570 } } ],
                       "warnings": [] },
        "message": "存在硬性冲突（固定×固定或自身重叠）" }
```

查询某周展开结果：

```jsonc
GET /api/occurrences?from=2026-08-31&to=2026-09-06
→ { "from": "…", "to": "…",
    "occurrences": [ { "scheduleId": "…", "title": "高等数学", "type": "fixed", "color": "#E4574E",
                       "date": "2026-08-31", "startMin": 480, "endMin": 570 }, /* … */ ] }
```

## 错误码速查

| error | HTTP | 含义/处理 |
| --- | --- | --- |
| `invalid` | 400 | 校验失败，附带 `issues[]` |
| `conflict` | 409 | 硬冲突（fixed×fixed 或自身重叠）；前端列出并提示强制保存（`force:true`）。规划：sync push 的 rev 落后亦 409 |
| `readonly` | 403 | 未授权客户端写入被拒（现状 = 全部 LAN；规划 = 未配对 LAN） |
| `unauthorized` | 401 | （规划 v0.4）写请求缺 token 或 token 无效 |
| `badpin` | 403 | （规划 v0.4）配对 PIN 错误/过期 |
| `notfound` | 404 | id 不存在（PUT/DELETE） |
| `internal` | 500 | 服务端异常（记 `[api-error]` 日志） |
