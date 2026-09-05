# 06 · 开发规范（Engineering Conventions）

> 状态：生效　·　适用范围：本仓库所有代码/脚本/配置　·　最近更新：v0.3.5（2026-09-05）
> 冲突时以本文为准；修改本文件需同步 `docs/07-doc-standards.md` 的体系说明与 CHANGELOG。

## 1. 工具链与脚本速查（在 `app/` 下执行）

| 命令 | 用途 | 备注 |
| --- | --- | --- |
| `npm test` | 规则引擎自测（`node tests/engine.test.cjs`） | 提交前必须通过 |
| `npm run build` | 构建 shared/server/web | esbuild + Vite |
| `npm start` | 启动后端（`node server/dist/index.cjs`） | 默认 0.0.0.0:3876 |
| `npm run dev:server` | 服务热更（重建后 `node --watch`） | 见 §9 |
| `npm run dev:web` | Vite 开发服务器（5173，代理 /api→3876） | |
| `npm run seed:demo` | 重建演示数据 | 幂等：先清空全部日程 |
| `node scripts/build.mjs [shared\|server\|desktop]` | 按需单包构建 | 缺省 shared+server |
| `npm run desktop` / `npm run dist:dir` | 桌面开发运行 / 打包 win-unpacked（Electron） | 见「原生模块 ABI 切换」 |

### 原生模块（better-sqlite3）—— 单一 Node ABI，无需切换（v0.3.5 起）

- **架构**：后端始终由系统 Node 运行（Web 直跑；桌面壳以随包 `node.exe` 子进程拉起后端，Electron 只渲染窗口），因此 `better-sqlite3` **只编译给系统 Node**，Web 与桌面共用一份。
- electron-builder 已设 `npmRebuild:false`，打包**不会**把它重编译成 Electron ABI；`npm run desktop` / `npm start` 之间无需任何 rebuild/electron-rebuild。
- 若本机意外出现 ABI 报错（如曾用过 `electron-rebuild`），修复：`npm rebuild better-sqlite3`。
- 桌面产物为解包目录并随包复制 `resources/node/node.exe`（`scripts/copy-node.cjs`，`dist:dir` 收尾自动执行）。
- 完整说明见 `README.md`「桌面端（Electron）· 环境切换与打包」。

## 2. 目录职责（红线：依赖方向单向向下）

```
app/
├─ shared/   纯 TS：类型/时间工具/规则引擎/冲突/排布/校验 —— 零运行时依赖，禁止 IO、随机、副作用
├─ server/   Express + better-sqlite3：仅可依赖 shared（dist 打包时同源编译）
├─ web/      React 前端：仅可依赖 shared 源码（相对路径导入 TS）；禁止访问 db/存储
├─ desktop/  Electron 主进程（v0.4）：内嵌 server，同样只准依赖 shared/server
├─ data/     运行时数据（不入库）
└─ tests/    引擎自测 .cjs、演示种子 .cjs
```

- 禁止 `web/server/desktop` 之间互相 import；禁止 shared 依赖任何其它 workspace。
- 前端 import shared 一律使用相对路径（如 `../../../shared/src/types`），不使用包别名，保证 esbuild/Vite 同源编译。

## 3. TypeScript 代码规范

- 全仓库 `strict: true`、`noEmit`，类型放 `shared/src/types.ts` 的接口；业务联合类型优先 discriminated union（见 `rule`）。
- **命名**：
  - 变量/函数/文件名：`camelCase`（`time.ts`、`expandSchedule`、`row0Free`）；
  - 类型/接口/类/React 组件：`PascalCase`（`Schedule`、`PackDayResult`、`DayBands.tsx`）；
  - 布尔量用 `is/has/can/should` 前缀（`hasOcc`、`isToday`、`readOnly`）；
  - React 事件回调入参统一 `onXxx(info|null, key|null)`，事件处理器 `handleXxx`。
- 时间一律用**当日分钟整数**（0–1439/`endMin≤1440`）与 `YYYY-MM-DD` 字符串；除 UI 时钟外禁止直接依赖 `Date` 运算（`shared/src/time.ts` 已封装）。
- 共享层纯函数：无副作用、无 IO、不调用 `Math.random`、不抛业务异常（返回结果/错误数组）。
- `import type` 用于纯类型导入；不允许 `any` 泄漏到 shared（server 中 db 行映射可用局部 `any` 并立刻窄化）。

## 4. React 组件规范（web/）

- 函数组件 + Hooks；禁止 class 组件。
- Props 全部显式类型（组件顶部定义 `XxxProps` 接口并导出需要的子类型，如 `Band`/`HoverInfo`）。
- 状态提升到 `App`；列表 key 稳定且局部唯一；渲染大表前先 `useMemo`。
- 事件委托优先（见悬浮窗容器级 `onMouseMove` 代理），避免每个块绑多个监听。
- 悬浮窗/弹窗类动效统一走“先渲染隐藏态 → rAF/双 rAF → 加显式类触发过渡”，不在 CSS 动画与 transition 混用上绕圈（踩坑记录见 0.2.8–0.2.10）。
- 禁 `dangerouslySetInnerHTML`；用户文本一律 React 转义渲染。

## 5. CSS 规范

- 设计令牌集中在 `web/src/style.css` 的 `:root`（`--accent/--lane-h/--ease/--radius/...`），禁止散落魔法值。
- 类名 BEM-lite：组件前缀 `.sb-`（`sb-block/sb-tip`），修饰 `.t-<type>`、状态 `.ho/.focus/.slim/.in/.out`、布局 `.lane/.band/.ruler`。
- 动效时长集中在 120–300ms；缓动统一 `var(--ease)`；hover/active/press 必须有反馈。
- 不用 `!important`；响应式断点档：顶栏 `900px`（紧凑单行）/ `720px`（双行网格，周/日与导航同中轴）/ `480px`（尺寸微调）/ `430px`（省略日期段、保留第N周，品牌字号收缩）/ `300px`（极窄·品牌仅 Logo）；板面日带内容断点 `860px`（gutter 收窄 + 日带「＋」微缩，见 `03-ui-spec.md` §7）。v0.2.36 起顶栏右区仅 `⚙ 设置`（无 `⋯` 折叠，新建走日带 gutter「＋」）。

## 6. Git / 提交规范

- 主分支 `main`；仓库级身份 `SchedBuddy Dev <dev@schedbuddy.local>`（用户可改）。
- **提交信息（Conventional Commits，中文概要）**：
  `type(scope): 概要`，type ∈ `feat / fix / docs / style / refactor / perf / test / chore / revert`。
  示例：`fix(daybands): 日视图固定上午/下午两带`。
- 提交前 checklist：`npm test` 通过 → `npm run build` 通过 → 版本号+CHANGELOG 更新 → 受影响文档已同步（见 07 §4）。
- 不入库：`node_modules/ dist/ *.db backups/ .npm-cache/`（见根 `.gitignore`）。
- “每对话必有一版提交”；大版本（x.0.0）须用户授权；被打回/作废的改动用 `git revert` 或授权后 `reset --hard` 处理并留痕说明。

## 7. 错误处理与日志

- API 错误统一 JSON：`{ error, message, issues? | conflicts? }`；error 枚举：`invalid / conflict / notfound / readonly / internal`。
- 服务端启动打印：版本、本机/局域网地址、数据目录；`[api-error]` 记录完整 stack。
- 前端加载失败展示错误态+重试；静默失败仅限非关键装饰。

## 8. 安全约定（本地/局域网模型）

- **写保护唯一实现点**：`server/src/api.ts` 的 `isLoopback`（剥离 `::ffff:` 后判断回环），所有写路由必须过 `writeGuard`。
- 不信任任何请求体：入库前一律 `validateSchedule`（shared 同前端表单同一校验器）。
- 静态站点禁返回 server 源码/数据文件；不写日志明文敏感内容（本模型无凭据）。

## 9. 配置与环境变量（唯一来源）

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `SCHEDBUDDY_PORT` | 监听端口 | 3876 |
| `SCHEDBUDDY_DATA` | 数据目录 | `<cwd>/data` |
| `SCHEDBUDDY_WEB` | 前端静态目录 | `<cwd>/web/dist` |

- server 独立运行用 `node server/dist/index.cjs`；desktop 内嵌同一 `startServer`（v0.4）。
- dev 双进程：`npm run dev:server`（3876）＋ `npm run dev:web`（5173，/api 代理）。

## 10. 测试规范

- `shared` 纯逻辑全覆盖核心场景：展开（weekly/单双周/隔N/once/范围/override）、冲突矩阵、packDay 排布（无空排/混排/row0 空闲）。
- 测试文件用 Node 内置 assert + `node:test` 风格直接运行（当前 `tests/engine.test.cjs`），保持零依赖。
- API 冒烟以 `tests/seed-demo.cjs` + 文档化 curl 序列为准；UI 按 `docs/03` 的验收清单人工验收。
- 新修复应先在测试里给反例（如“仅临时日程占 1 排”），再改代码。
