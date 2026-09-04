# SchedBuddy 更新日志

版本规则见 `docs/05-versioning.md`。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.2.1] - 2026-09-04

### Changed（UI 反馈调整）
- 周视图填满整个可视区（日带纵向平分剩余空间，排高自适应）。
- 日视图改为「上午 0:00–12:00 + 下午 12:00–24:00」两条半天带，自动裁剪首尾空余时段；跨 12 点日程的两段共享同一 hover key，视为同一整体（聚焦/动画同步）。
- 全局字号放大；Logo 由字母 S 换成头像（`app/resources/avatar.jpg`，原 avator.jpg 更名）；时间导航与周/日切换控件归并为中部一组。
- 规则引擎/API 无逻辑变更。

## [0.2.0] - 2026-09-04

### Added
- **shared 规则引擎**（`app/shared`，浏览器/服务端共用纯函数）：
  - 展开：固定星期多段（weekly）、单/双周（基于学期起点锚点）、隔 N 天（interval）、一次性（once）、生效日期范围、校历停课跳过（预留）；
  - 单次例外 overrides：跳过 / 改期；
  - 冲突检测：自身重叠与 fixed×fixed = 硬冲突（默认拒绝），其余组合 = 警告（可强制保存）；
  - 排布算法 packDay：最底排=固定+绿色空闲区间，上方按重要度（固定>特定>可选>临时）贪心堆叠。
- **server**（Express + SQLite better-sqlite3）：
  - `/api/meta` `schedules` `occurrences` `settings` `export` `import`；迁移机制（user_version v2）；自动备份（≥24h，保留 14 份）；
  - 写保护：仅回环地址（桌面本机）可增删改，局域网请求 403；冲突策略校验（409）与 force 支持。
- **web**（React + TS + Vite）周/日视图只读渲染：
  - 横向“日带”布局（排 0 = 空闲绿带 + 固定块，上方按重要度堆叠），整点栅格线、现在线、每 2h 时间标尺；
  - hover 聚焦（其余块弱化）+ 120ms 快速淡入悬浮窗（颜色块/名称/类型徽标/备注/当前与其它时段/规则摘要）；
  - 类型默认色、今天高亮、“只读”徽标、上一页/下一页/今天、周/日切换。
- 引擎自测 11 组全部通过（`npm test`）；演示种子 `npm run seed:demo`（主课/社团单双周/隔2天/水课/临时竞赛）。
- 用户头像移入 `app/resources/avatar.jpg`（原 avator.jpg，0.2.1 更名）；根目录 resources 已删除。

### Fixed
- 表结构冗余 NOT NULL 列 segments_json 导致插入 500（v2 迁移重建表，时段统一存 rule_json）。

## [0.1.0] - 2025-07-XX

### Added
- 初始化 git 仓库与 npm workspaces 骨架（`shared/server/web/desktop`）。
- 需求确认与决策记录、架构、数据模型与规则引擎、UI 规范、API、版本规范文档。
- 版本策略：每对话递增并提交；大版本仅授权后修改。
