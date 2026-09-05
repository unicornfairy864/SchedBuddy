# 05 · 版本与 Git 规范

> 状态：生效　·　最近更新：v0.2.21（2026-09-04）　·　开发提交细则见 `06-dev-conventions.md` §6

## 1. 用户规定（最高优先级）

1. **每一次对话**结束都要修改版本并提交至 git。
2. **大版本**（`x.0.0`）修改**必须获得用户授权**后方可进行。
3. 每次**下载/安装依赖**都必须先给用户看清单并获手动确认。
4. 成品（含存储组件）全部在 `app/` 内。

## 2. 版本策略（SemVer 简化）

- 当前基线：**0.1.0**（本仓库首个正式提交）。
- 版本号唯一权威来源：`app/package.json` 的 `version` 字段 + `app/CHANGELOG.md`（同步更新）。
- 递增规则：
  - 每次对话若引入**新特性/能力** → 递增 **minor**（0.x.0）；
  - 仅修复/重构/文档 → 递增 **patch**（0.0.x）；
  - 进入 `1.0.0`（首个对外可交付大版本）或任何 `N.0.0` → 必须先征得用户同意。
- 提交信息格式：`v<version> <摘要>`；建议单条对话内可多次提交，但**对话收尾必有版本提交**。
- 里程碑按 `docs/01-architecture.md` §5 推进；每完成一个里程碑即 +1 minor。

## 3. 分支与提交约定

- 主分支 `main`（本次 `git init -b main`）。
- 仓库级 git 身份（本机未配置全局身份时设置）：
  `user.name = SchedBuddy Dev`、`user.email = dev@schedbuddy.local` —— 用户可自行修改。
- `app/data/*.db`、`backups/`、`node_modules/`、`dist/` 不入库（见根 `.gitignore`）。

## 4. 变更记录

见 `app/CHANGELOG.md`（Keep a Changelog 风格，中文）。

## 5. 文档同步规定

功能 / 界面 / 规则 / 文档的任何修改，收尾时必须同步更新相应文档，保持“文档 = 现状”：
- 项目总纲：`docs/项目说明.md`（与 `app/` 同级）；
- 需求与决策：`app/docs/00-decisions.md`；架构/数据/UI/API：`app/docs/01~04`；
- 更新日志：`app/CHANGELOG.md`（与版本提交同一次 commit）。
