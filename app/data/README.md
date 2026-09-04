# app/data — 运行时存储目录（不入库）

本目录存放系统运行时产生的数据，均由程序自动创建，**不提交 git**（见根目录 `.gitignore`）。

| 路径 | 内容 |
| --- | --- |
| `schedbuddy.db` | SQLite 主数据库（日程/设置/历史） |
| `backups/` | 服务启动时的自动备份（`schedbuddy-YYYYMMDD-HHmmss.db`），可配置保留份数 |
| `export/` | 手动导出的 JSON 备份（一键导出/导入） |

- 目录默认位置 = `app/data`（相对仓库根解析）。
- 环境变量 `SCHEDBUDDY_DATA` 可覆盖（打包分发时如需写入用户数据目录，通过该变量或启动参数指定，见 `app/docs/04-api.md`）。
- 校历等静态种子数据将来放 `app/data/seeds/`，属于产品内容，应入库（放仓库而非运行时目录）。
