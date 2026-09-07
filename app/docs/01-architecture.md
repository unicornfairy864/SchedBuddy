# 01 · 架构

> 状态：生效　·　最近更新：v0.4.1（2026-09-08）　·　规范：`07-doc-standards.md`

## 1. 拓扑（现状：桌面主机 + 局域网只读 Web + Android 只读/配对骨架）

```
┌─────────────── 桌面主机（本机，可选常驻）────────┐
│ Electron 主进程 (main.ts)                       │
│   ├─ 内嵌启动 @schedbuddy/server  (Express)     │
│   │    ├─ SQLite: app/data/schedbuddy.db        │
│   │    └─ 静态托管: web/dist (React 构建)       │
│   └─ 打开本地窗口加载 http://127.0.0.1:PORT     │
└─────────────────────────────────────────────────┘
        ▲ localhost 读写            ▲ LAN
  浏览器 127.0.0.1 (桌面壳=本机界面)  手机浏览器 只读
  已配对 Android App（v0.4 只读视图 + 写凭证已就绪）
```

### 1.1 目标形态（v0.4.1 修订：本地优先 · 已决策，见 §5；v0.5 落地）

**模型**：不再有"唯一权威主机"。App 与桌面各自持有**本地完整副本**，均可独立全功能使用；
桌面/网页为**可选**同步对端；同一局域网内由用户**手动双向同步**（pull / push / merge，冲突逐条裁决）。

```
 Android App（本地权威副本 · 离线独立）
   ├─ 内置 SQLite：离线查看/新建/编辑/删除（不依赖电脑）
   └─ 回网：局域网 自动发现主机 → 手动 pull/push/merge
                          ⇅ 双向
 桌面 / Web（另一份本地副本 · 可选）
   ├─ Express :3876 + SQLite + Web 只读
   └─ Windows 防火墙规则由安装器/首启提权自动放行（免手动开端口）
```

- **自动发现**：主机周期性 mDNS 公告 `_schedbuddy._tcp.local`（端口 3876，辅助 UDP 广播）；App 自动列出主机，回退=扫桌面二维码 / 手动 IP（Android 需本地网络权限）。
- **同步写鉴权**：沿用 PIN 配对设备 token（v0.4 已实现 `/api/pair`、`/api/devices`）；局域网浏览器仍只读 403。
- **同步数据基础**（v0.3 已落库）：`rev`（单调同步序号）、`deleted_at`（软删墓碑）、`last_writer`（deviceId）。
- **公网穿透与口令鉴权：明确不做（backlog）**——依赖局域网可信模型 + PIN 配对。
- **默认端口**：`3876`（可用 `PORT` / `SCHEDBUDDY_PORT` 覆盖）。
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
├─ desktop/                # Electron 主进程（已起步 v0.3.5）：随包 node.exe 子进程拉起 server，Electron 只渲染窗口
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
| better-sqlite3 原生模块与 Electron ABI 不匹配 | **v0.3.5 起免切换**：后端始终由系统 Node 运行（桌面壳用随包 `node.exe` 子进程拉起 server，Electron 只渲染窗口），`better-sqlite3` 只编译给系统 Node；electron-builder 设 `npmRebuild:false`（详见 `README.md`） |
| Electron 下载体积大 / 网络慢 | 与安装清单一并说明；desktop 可滞后一期接入，前端 + API 先独立可跑 |
| LAN 只读但同网段被伪造来源 | 本地局域网可信模型，文档明示；后续可加可选口令 |
| 打包后 `app/data` 可能只读（如 Program Files） | 通过 `SCHEDBUDDY_DATA` 指向可写目录；本期优先源码运行形态 |

## 5. 里程碑（0.x 路线）

- ✅ **0.1**（已发布）：仓库/文档/骨架 + git。
- ✅ **0.2**（已发布）：shared 规则引擎与排布算法（自测 13 组通过）；server API + SQLite(v2 迁移) + 备份 + 写保护守卫；web 周/日视图只读渲染（日带布局/hover 悬浮窗/现在线）。
- ✅ **0.3.0**（已定版，2026-09-05）：PC/Web **编辑核心** —— 新建/编辑/删除弹窗与冲突告警交互（红/黄前置、不拦保存、红自动 force）、设置面板、同步字段落库（迁移 v3 软删）、「高级」折叠区（单双周 + 生效限制：日期范围 / 课程总数量，迁移 v4 引擎按天截止）、弹窗控件升级与动画打磨（详见 `项目说明.md` 里程碑）。引擎自测 15 组。
- ✅ **0.4**（已定版，2026-09-08）：**Android App（RN + TS）骨架** —— `app/mobile` workspace、局域网直连主机、周/日**只读视图**（复用 shared 展开/日期引擎；**RN 纵向日卡列表**，不移植横向时间轴 —— `03-ui-spec` 的横向时间轴口径仅适用 Web/桌面）、主机地址配置、**PIN 一次性配对换发设备 token**（server `/api/pin` `/api/pair` `/api/devices` + token 写校验，DB v5）。移动端离线工作区与 pull/push/merge 属 v0.5。
- **0.5**（v0.4.1 修订：**本地优先独立版**）：App 内置 SQLite = **本地权威副本**，单机离线完整可用（查看/新建/编辑/删除），不依赖桌面；**局域网自动发现**（mDNS `_schedbuddy._tcp.local` + UDP 广播，回退扫码/手动 IP）；与桌面**双向手动 pull/push/merge**（冲突逐条裁决：留本机版/留对端版/手动合并）+ 删除传播（墓碑）；桌面 **Windows 防火墙自动放行**（NSIS/首启提权建入站规则，免手动开端口）。
- **顺延/backlog**：Electron 桌面壳**已起步**（v0.3.1 主进程 + v0.3.x 可产出 win-unpacked 目录；正式桌面壳里程碑待排期）；真实局域网实测；公网通道 + 口令鉴权（明确不做，视未来需要再评估）；NSIS 安装包 / 自定义图标（可选项）。
