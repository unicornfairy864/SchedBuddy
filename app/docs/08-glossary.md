# 08 · 术语表（Glossary）

> 状态：生效　·　最近更新：v0.2.21（2026-09-04）
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
| 只读 | readOnly | 局域网客户端仅可查看；写操作由服务端按回环地址 403 |
| workspaces | — | npm 单仓库：shared/server/web/desktop，依赖单向向下 |
