# SchedBuddy · 大学生时间管理系统

桌面应用（Electron）+ 局域网 Web 双端，单用户日程可视化与规划工具。
灵感场景：多社团 + 主课 + 选修（可翘水课）+ 竞赛考试（可提前交卷）——把"记在脑子里的课表"变成能看清冲突、方便决策的日历。

> **产品全部位于 [`app/`](app/) 目录**（含代码、文档、运行时数据库、备份）。
> **项目说明总纲**：[`app/docs/项目说明.md`](app/docs/项目说明.md)（全局要求、已完成、未来规划）。
> `resources/` 原个人文件已并入 `app/resources/`（头像 avatar.jpg）。

## 运行与文档入口

- 需求与已确认决策：`app/docs/00-decisions.md`
- 架构：`app/docs/01-architecture.md` ｜ 数据模型与规则引擎：`app/docs/02-data-model.md`
- UI 规范：`app/docs/03-ui-spec.md` ｜ API：`app/docs/04-api.md` ｜ 版本规范：`app/docs/05-versioning.md`
- 开发规范：`app/docs/06-dev-conventions.md` ｜ 文档规范：`app/docs/07-doc-standards.md` ｜ 术语表：`app/docs/08-glossary.md`

## 仓库约定（用户规定）

1. 每一次对话结束都会修改版本号（`app/package.json` + `app/CHANGELOG.md`）并提交至 git。
2. **大版本（x.0.0）修改必须获得用户授权**；小版本按特性/修复自然递增。
3. **每次下载/安装依赖都必须先经用户手动确认清单**。
4. 成品（含数据库、资源、备份）一律放在 `app/` 内。

## 技术栈（已授权确认）

Electron + React + TypeScript + Vite + Node(Express) + SQLite(better-sqlite3)，npm workspaces 单仓库。
桌面端 = 常驻主机（内置后端 + 数据库）；局域网设备通过浏览器访问同一份数据（只读）。

## 本地运行（当前 v0.3.x：PC/Web 编辑核心已定版）

```powershell
cd app
npm install          # 首次
npm run build        # 打包 shared/server/web
npm start            # 启动服务 http://127.0.0.1:3876（0.0.0.0 监听）
npm run seed:demo    # 可选：写入演示日程
npm test             # 规则引擎自测（15 组）
```

- 数据自动存入 `app/data/schedbuddy.db`（不入库，含自动备份）。
- 开发模式：`npm run dev:server`（服务热更）+ 新终端 `npm run dev:web`（Vite 5173 代理 /api）。
- 本机为唯一写端（新建/编辑/删除、设置）；局域网浏览器只读。
- **路线规划（v0.4 起，详见 `app/docs/00-decisions.md` §5 与 `app/docs/01-architecture.md` §5）**：v0.4 = Android App（RN）骨架（局域网直连 + PIN 配对）；v0.5 = App 离线工作区 + 手动 pull/push/merge 同步。

## 桌面端（Electron）· 环境切换与打包

**架构（v0.3.5 起，无需任何 ABI 切换）**：后端始终由**系统 Node**（打包时随包自带 `resources/node/node.exe`）以子进程运行，Electron 只渲染窗口 —— `better-sqlite3` 永远只编译给系统 Node，Web 与桌面共用一份，**不再需要 electron-rebuild 手动切换**（electron-builder 已设 `npmRebuild:false`）。

```powershell
cd app
npm run desktop        # 开发运行：编译主进程 → 拉起后端 → 弹出 SchedBuddy 窗口
npm run dist:dir       # 打包 → desktop/release/win-unpacked\SchedBuddy.exe（目录即用，可压 RAR）
npm start              # Web 模式照常，无需任何切换
```

> **桌面打包是按需操作**：常规更新只执行 `npm run build`（shared/server/web）并提交；需要分发新桌面包时才运行 `npm run dist:dir`，不随每次更新自动打包。

- 桌面数据写入系统用户数据目录 `%APPDATA%\SchedBuddy\data`（与仓库内 `app/data` 相互独立）。
- 产物为解包目录（后端子进程需读取真实文件）；分发时已含随包 `node.exe`。
- 安装包（NSIS）与自定义图标为后续可选项。
