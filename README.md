# SchedBuddy · 大学生时间管理系统

桌面应用（Electron）+ 局域网 Web 双端，单用户日程可视化与规划工具。
灵感场景：多社团 + 主课 + 选修（可翘水课）+ 竞赛考试（可提前交卷）——把"记在脑子里的课表"变成能看清冲突、方便决策的日历。

> **产品全部位于 [`app/`](app/) 目录**（含代码、文档、运行时数据库、备份）。
> 根目录 `resources/` 为个人文件（如头像），不属于成品，已 git 忽略。

## 运行与文档入口

- 需求与已确认决策：`app/docs/00-decisions.md`
- 架构：`app/docs/01-architecture.md` ｜ 数据模型与规则引擎：`app/docs/02-data-model.md`
- UI 规范：`app/docs/03-ui-spec.md` ｜ API：`app/docs/04-api.md` ｜ 版本规范：`app/docs/05-versioning.md`

## 仓库约定（用户规定）

1. 每一次对话结束都会修改版本号（`app/package.json` + `app/CHANGELOG.md`）并提交至 git。
2. **大版本（x.0.0）修改必须获得用户授权**；小版本按特性/修复自然递增。
3. **每次下载/安装依赖都必须先经用户手动确认清单**。
4. 成品（含数据库、资源、备份）一律放在 `app/` 内。

## 技术栈（已授权确认）

Electron + React + TypeScript + Vite + Node(Express) + SQLite(better-sqlite3)，npm workspaces 单仓库。
桌面端 = 常驻主机（内置后端 + 数据库）；局域网设备通过浏览器访问同一份数据（只读）。
