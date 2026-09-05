# 08 · 术语表（Glossary）

> 状态：生效　·　最近更新：v0.2.28（2026-09-05）
> 全仓库统一口径；新增术语请登记于此。

| 术语 | 英文 | 定义 |
| --- | --- | --- |
| 日程 | Schedule | 一个可编辑条目（名称/备注/类型/颜色/规则/时段/生效范围/例外），可有多个时段 |
| 类型 | Type | `fixed`固定 / `specific`特定(社团等) / `optional`可选 / `temporary`临时；重要度 0→1→2→3 |
| 规则 | Rule | 决定“哪些日期发生”的判别联合：weekly（固定星期，可叠加单双周）/ interval（隔 N 天）/ once（一次性） |
| 时段（段） | Segment | weekly 的一个（星期几+起止分钟）或 once/interval 的起止窗口；同一日程可有多个时段 |
| 发生 | Occurrence | 展开后某日某起止的一次具体时段 |
| 单次例外 | Override | 对某一次具体发生做 skip(跳过)/move(改期)/retime(改时)，不改规则本身 |
| 单双周锚点 | weekStart / termStart | 第 1 周周一的日期；单周=奇数周序号、双周=偶数 |
| 生效范围 | activeFrom/activeTo | 日程只在范围内发生（含边界） |
| 冲突 | Conflict | 同日同时段重叠；fixed×fixed 与自身重叠=error，其余=warning（可强制保存） |
| 排（横条） | Lane/Row | 一条水平时间排；自底向上第 0 排…；永不产生空排，同排可混类型 |
| 空闲带 | row0Free | 排 0 上未被方块占用的区间，以浅绿显示 |
| 日带 | Band | 一个可见日的渲染单元（gutter+排区+标尺）；周=7 带纵向堆叠 |
| 半天带 | Half Band | 日视图的两段：上午 0–12、下午 12–24（可裁首尾空余） |
| 可见时段 | TimeRange | 某带实际显示的时间窗（周视图为 7 天共轴窗口） |
| 现在线 | now-line | 今天当前时刻的红色竖线 |
| 只读 | readOnly | 未授权客户端仅可查看；写操作被服务端拒绝（现状=非回环一律拒；规划 v0.4=未配对 LAN 拒） |
| 权威主机/权威库 | Host / Authoritative DB | 常驻的 PC 端（Express + SQLite）；同步的最终一致目标，rev 由主机唯一递增 |
| 移动写端 | Mobile writer | Android App（RN + TS，规划 v0.4–0.5）：局域网内第二个可写端，内置库离线可用 |
| 离线工作区 | Offline workspace | App 内置数据库：断网时本地查看/新建/修改/删除，联网后经同步收敛 |
| 同步 | Sync | 客户端与权威主机双向收敛数据；本方案仅限局域网、由**用户手动发起** |
| 拉取 | Pull | 从主机取回 `rev > since` 的变更（含墓碑）并入本地 |
| 推送 | Push | 上传本地待同步改动；遇冲突则不落库、返回冲突清单 |
| 合并 | Merge | 冲突裁决：保留主机版 / 保留本机版 / 手动编辑合并；裁决后重推收敛 |
| 同步序号 | rev | 记录级单调递增整数（主机维护），pull/push 的水印与冲突基线 |
| 墓碑/软删除 | Tombstone / soft delete | 删除不物理移除，置 `deleted_at` 保留记录以把删除传播给另一端，防止"复活" |
| 设备配对 | Pairing | 主机生成一次性 PIN，App 输入后换发 `deviceId + token`；写请求凭 token（规划 v0.4） |
| workspaces | — | npm 单仓库：shared/server/web/desktop（+ 规划 mobile），依赖单向向下 |
