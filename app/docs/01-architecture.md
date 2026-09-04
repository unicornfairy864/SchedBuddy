# 01 · 架构

## 1. 拓扑

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
├─ desktop/                # Electron 主进程 + preload
└─ data/                   # 运行时数据（不入库）：db、backups/、export/
```

依赖方向：`shared ← server`，`shared ← web`，`shared ← desktop`（只向下游依赖，不反向）。

## 3. 构建与运行策略

- `web`：Vite dev（开发热更）与 `vite build` → `web/dist`。
- `server`、`desktop`：TypeScript 源码，由 esbuild 打包成 CJS/ESM 到各自 `dist/`；dev 用 `tsx watch`。
- `shared`：纯 TS 源码直接供各端使用——Vite 直接编译；server/desktop 打包时随源码一并 bundle（避免单独发布产物）。
- 数据目录解析优先级：`SCHEDBUDDY_DATA` 环境变量 → 仓库 `app/data`（开发默认）。

## 4. 主要风险与对策

| 风险 | 对策 |
| --- | --- |
| better-sqlite3 为原生模块，Electron ABI 不匹配 | 安装 `@electron/rebuild`，desktop 构建前执行 rebuild；server 独立运行时用 Node 预编译产物 |
| Electron 下载体积大 / 网络慢 | 与安装清单一并说明；desktop 可滞后一期接入，前端 + API 先独立可跑 |
| LAN 只读但同网段被伪造来源 | 本地局域网可信模型，文档明示；后续可加可选口令 |
| 打包后 `app/data` 可能只读（如 Program Files） | 通过 `SCHEDBUDDY_DATA` 指向可写目录；本期优先源码运行形态 |

## 5. 里程碑（0.x 路线）

- ✅ **0.1**（已发布）：仓库/文档/骨架 + git。
- ✅ **0.2**（已发布）：shared 规则引擎与排布算法（自测 11 组通过）；server API + SQLite(v2 迁移) + 备份 + 写保护守卫；web 周/日视图只读渲染（日带布局/hover 悬浮窗/现在线）。
- **0.3**（下一对话）：创建/编辑/删除表单（类型、取色器、时段列表、规则表单、生效范围）+ 冲突告警交互（错误禁用/警告二次确认/强制）+ 动画打磨 + 设置面板（学期起点）。
- **0.4**：desktop 壳内嵌服务 + 本地窗口 + 真实局域网只读验证（本机有 VPN/WARP 网关与禁用 IPv6，仅可在用户局域网实测）+ 单次跳过/改期交互。
- **打包/安装程序（electron-builder）已按用户要求搁置**：待用户给出明确打包指令时再启动（届时先提交 Electron 依赖清单供确认）。
