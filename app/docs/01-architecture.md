# 01 · 架构

> 状态：生效　·　最近更新：v0.3.0（2026-09-05）　·　规范：`07-doc-standards.md`

## 1. 拓扑（现状：双端）

```
┌─────────────── 桌面主机（本机）───────────────┐
│ Electron 主进程 (main.ts)                     │
│   ├─ 内嵌启动 @schedbuddy/server  (Express)   │
│   │    ├─ SQLite: app/data/schedbuddy.db      │
│   │    └─ 静态托管: web/dist (React 构建)     │
│   └─ 打开本地窗口加载 http://127.0.0.1:PORT   │
└───────────────────────────────────────────────┘
        ▲ localhost 读写            ▲ LAN
  浏览器 127.0.0.1 (桌面壳=本机界面)  手机/平板/宿舍机 只读
                                     （服务端按来源地址判定并拒绝写请求）
```

### 1.1 规划形态（已决策 · v0.3–0.5 落地，见 §5；当前代码未含）

场景：满课学生不回寝室、在校园收到社团/竞赛日程 → 需移动端**新建/修改**日程并可离线查看。
方案：新增第三端 **Android App（React Native + TypeScript）**；App 内置本地库作**离线工作区**，
**仅局域网**内由**用户手动发起 pull / push / merge** 与主机收敛。

```
┌──────────── PC 主机（权威库 · 常驻）───────────┐
│ Express :3876 + SQLite(app/data/schedbuddy.db) │
│   ├─ 本机浏览器 / 桌面壳       读写             │
│   ├─ 局域网浏览器（未配对）     只读             │
│   └─ Android App（同一局域网）  读写 + 手动同步   │
└───────────────────────────────────────────────┘
             ▲ 手动 pull/push/merge（仅局域网）
   Android App（RN + TS）：内置 SQLite = 离线工作区
     离线（校园/移动网）：本地查看/编辑/删除 → 待同步队列
     回网：用户手动发起同步；冲突逐条人工裁决
```

- 写权限（v0.4 起）：回环地址 **或** 携带配对所得设备 token 才可写；未配对 LAN 设备仍 403（详见 `04-api.md`）。
- 记录级同步字段（v0.3 落库）：`rev`（单调同步序号）、`deleted_at`（软删墓碑）、`last_writer`（deviceId）。
- **公网穿透与口令鉴权：明确不做（backlog）**——本方案依赖局域网可信模型 + PIN 配对。

- **默认端口**：`3876`（可通过 `PORT` / `SCHEDBUDDY_PORT` 覆盖，避免与常见服务冲突）。
- 服务绑定 `0.0.0.0`；对**非回环地址**（非 `127.0.0.1`/`::1`）的写请求一律 `403`；`/api/meta` 返回 `readOnly` 供前端隐藏编辑入口。
- 纯开发模式：`server` 可脱离 Electron 独立运行（`npm run dev:server`），同一前端在浏览器调试。

## 2. 代码结构（全部在 `app/` 下）

```
app/
├─ package.json            # workspaces 根：版本号唯一权威来源
├─ CHANGELOG.md
├─ docs/                   # 需求/设计文档
├─ shared/                 # @schedbuddy/shared：类型 + 纯函数（规则引擎/展开/冲突/排布/格式化），零依赖
├─ server/                 # Express API + SQLite 迁移 + 备份；同时被 desktop 内嵌
├─ web/                    # React 前端（Vite 构建产物 server 静态托管）
├─ desktop/                # Electron 主进程 + preload（规划顺延）
├─ mobile/                 # （规划 v0.4）React Native Android App：复用 shared + web 布局计算；RN 组件重绘 UI
└─ data/                   # 运行时数据（不入库）：db、backups/、export/
```

依赖方向：`shared ← server`，`shared ← web`，`shared ← desktop`，`shared ← mobile`（只向下游依赖，不反向）。

## 3. 构建与运行策略

- `web`：Vite dev（开发热更）与 `vite build` → `web/dist`。
- `server`、`desktop`：TypeScript 源码，由 esbuild 打包成 CJS/ESM 到各自 `dist/`；dev 用 `tsx watch`。
- `shared`：纯 TS 源码直接供各端使用——Vite 直接编译；server/desktop 打包时随源码一并 bundle（避免单独发布产物）。
- 数据目录解析优先级：`SCHEDBUDDY_DATA` 环境变量 → 仓库 `app/data`（开发默认）。

## 4. 主要风险与对策

| 风险 | 对策 |
| --- | --- |
| better-sqlite3 为原生模块，Electron ABI 不匹配 | Electron/系统 Node **ABI 互斥切换**：桌面 `npx electron-rebuild -f -w better-sqlite3`；Web `npm rebuild better-sqlite3`（详见 `README.md` 与 `06-dev-conventions.md`；electron-builder 打包自动重编译） |
| Electron 下载体积大 / 网络慢 | 与安装清单一并说明；desktop 可滞后一期接入，前端 + API 先独立可跑 |
| LAN 只读但同网段被伪造来源 | 本地局域网可信模型，文档明示；后续可加可选口令 |
| 打包后 `app/data` 可能只读（如 Program Files） | 通过 `SCHEDBUDDY_DATA` 指向可写目录；本期优先源码运行形态 |

## 5. 里程碑（0.x 路线）

- ✅ **0.1**（已发布）：仓库/文档/骨架 + git。
- ✅ **0.2**（已发布）：shared 规则引擎与排布算法（自测 13 组通过）；server API + SQLite(v2 迁移) + 备份 + 写保护守卫；web 周/日视图只读渲染（日带布局/hover 悬浮窗/现在线）。
- ✅ **0.3.0**（已定版，2026-09-05）：PC/Web **编辑核心** —— 新建/编辑/删除弹窗与冲突告警交互（红/黄前置、不拦保存、红自动 force）、设置面板、同步字段落库（迁移 v3 软删）、「高级」折叠区（单双周 + 生效限制：日期范围 / 课程总数量，迁移 v4 引擎按天截止）、弹窗控件升级与动画打磨（详见 `项目说明.md` 里程碑）。引擎自测 15 组。
- **0.4**：**Android App（RN + TS）骨架**：`app/mobile` workspace、局域网直连主机、周/日视图（复用 shared 引擎与布局计算、RN 重绘 UI）、只读起步、主机地址配置 + **PIN 一次性配对换发设备 token**（server 增加配对端点与 token 写校验）。
- **0.5**：App **离线工作区**（内置 SQLite：离线查看/新建/修改/删除）+ **用户手动 pull/push/merge**（冲突逐条裁决：留主机版/留本机版/手动编辑）+ 删除传播（墓碑）+ 回网同步提示。
- **顺延/backlog**：Electron 桌面壳**已起步**（v0.3.1 主进程 + v0.3.x 可产出 win-unpacked 目录；正式桌面壳里程碑待排期）；真实局域网实测；公网通道 + 口令鉴权（明确不做，视未来需要再评估）；NSIS 安装包 / 自定义图标（可选项）。
