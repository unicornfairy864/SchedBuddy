# 04 · API 约定

Base：`http://<host>:3876/api`。JSON；日期 `YYYY-MM-DD`，时间用分钟或 `HH:mm`（见各接口）。错误统一 `{ error: string, details?: unknown }`。

## 访问控制（写保护）

- 服务绑定 `0.0.0.0`。对写请求（POST/PUT/DELETE）检查 socket 远端地址：
  - `127.0.0.1` / `::1`（回环）→ 允许（桌面本机）；
  - 其余（LAN）→ `403 { error: "readonly" }`。
- GET 一律放行。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/meta` | `{ version, readOnly, port, hostname, termStart?, now }` |
| GET | `/api/schedules` | 全部日程（含 rule/segments/overrides JSON） |
| POST | `/api/schedules` | 新建；body: Schedule 对象（不含 id/created_at/updated_at）；`force?:boolean`。错误：`{error:'conflict', conflicts:[...]}` 或 `{error:'invalid', issues:[...]}` |
| PUT | `/api/schedules/:id` | 全量更新，同上校验 |
| DELETE | `/api/schedules/:id` | 删除（`404` 若不存在） |
| GET | `/api/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD` | 服务端展开结果（调试/只读端可选缓存用） |
| GET/PUT | `/api/settings` | `{ termStart?, termEnd?, weekCount?, holidays?, ui? }` |
| GET | `/api/export` | 全量 JSON（schedule + settings），供备份迁移 |
| POST | `/api/import` | 导入（覆盖式，需 force 确认） |

服务端保存流程：`validateSchedule`（shared）→ 冲突检测 `detectConflicts`（shared，窗口 = 该日程可能影响范围，缺省 ±1 年）→ 策略判定 → 写库。

## 数据目录与备份

- 目录：`SCHEDBUDDY_DATA` 或默认仓库 `app/data`。
- 自动备份：服务启动时若距上次备份 ≥ 24h，复制 `schedbuddy.db` → `backups/schedbuddy-<ts>.db`，最多保留 14 份（可配置）。
- 前端静态文件目录：`web/dist`（不存在时仅 API 可用，便于前后端并行开发）。

## 端口与冲突

默认 `3876`；环境变量 `PORT`（server 独立运行）与桌面设置共用；与常见 3000/5173/3080 不冲突。
