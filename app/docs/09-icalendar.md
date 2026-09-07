# 09 · iCalendar（RFC 5545 / RFC 6868）对接

> 状态：生效　·　最近更新：v0.3.10（2026-09-06）　·　规范：`07-doc-standards.md`
> 范围：仅 **A1（RFC 5545 本体）+ A2（RFC 6868 参数转义）**；CalDAV（4791）、iTIP/iMIP（5546/5547）、xCal/jCal（6321/7265）不在范围。
> 实现状态：shared 引擎（v0.3.9）与 server 端点 + 设置 UI（v0.3.10）均已接线；本文件为映射口径与忽略清单。

## 0. 决策口径
- D1 导出目标：**展示/兼容优先**（Google 日历、Outlook、手机日历可导入/订阅）+ 携带 SchedBuddy 自有 `X-` 属性以便再导入时按组合并。
- D2 多时段：一条日程 N 段 → N 个 VEVENT，共享 `UID` 前缀 + `X-SCHEDBUDDY-GROUP=<scheduleId>`。
- D3 单双周：`FREQ=WEEKLY;INTERVAL=2`，DTSTART = 该段首个“相位正确”发生日（与学期锚点对齐）。
- D4 课程总数量（按天计）：导出为**显式 DTSTART+RDATE 列表**（保证与引擎语义一致；不伪造 COUNT 换算）。
- D5 时区：一律 **floating 时间**（无 TZID）；解析时忽略 `Z`/`TZID` 标记（单机/局域网同地语义）。
- D6 例外：`skip` → EXDATE；`move` → EXDATE + RDATE（目标日）；`retime` 暂不支持（忽略并报告）。
- D7 元数据：`SUMMARY`=名称、`DESCRIPTION`=备注、`X-SCHEDBUDDY-COLOR`=颜色、`X-SCHEDBUDDY-GROUP`=日程 id。

## 1. 编码（encode.ts）Schedule → VCALENDAR
| SchedBuddy 规则 | iCalendar |
| --- | --- |
| weekly（oddEven=none） | `FREQ=WEEKLY;INTERVAL=1;BYDAY=周几…`；UNTIL=activeTo（可无） |
| weekly（odd/even） | `FREQ=WEEKLY;INTERVAL=2;BYDAY=…`，DTSTART 取相位正确首日 |
| interval everyNDays=N | `FREQ=DAILY;INTERVAL=N` |
| once | 单 DTSTART/DTEND（skip/move 用 EXDATE/RDATE） |
| occurrenceLimit=N | 显式 `DTSTART` + `RDATE` 全量（引擎展开到第 N 个“发生天”） |
| 同一日程多时段 | 每时段独立 VEVENT（D2） |
| skip/move | EXDATE（源日）/ RDATE（目标日），按段匹配合法日 |

## 2. 解析（parse.ts）→ 支持子集
- VEVENT 字段：SUMMARY、DESCRIPTION、DTSTART、DTEND、RRULE（仅 `FREQ=WEEKLY|DAILY`、`INTERVAL`、`BYDAY`、`UNTIL`）、EXDATE、RDATE、`X-SCHEDBUDDY-*`。
- 折叠/转义：续行空格折叠、`\\`/`\;`/`\,`/`\n` 文本转义、参数 caret（`^`）RFC 6868 解码 —— 见 `ics/util.ts`。
- **忽略并报告**（不丢原文件）：MONTHLY/YEARLY、COUNT、BYMONTH、DURATION、VALARM、TZID/UTC 语义、all-day 等（列表将随 UI 展示"忽略 N 项"）。

## 3. 重建（eventsToSchedules）尽力而为
- 按 `X-SCHEDBUDDY-GROUP`（或 UID）分组；
- RRULE WEEKLY → weekly（interval2 → oddEven=odd + weekStart=首个发生周周一）；时段取各 VEVENT 并集；
- RRULE DAILY → interval；无 RRULE 且同日 → once；
- EXDATE → skip/move override（move 依据同事件 RDATE 判定）。
- 无法识别的模式进入 ignored（不产生半吊子日程）。

## 4. 接线与边界
- server（v0.3.10）：`GET /api/export.ics?from=&to=`（缺省今天起 365 天）、`POST /api/import.ics`（合并导入：支持子集重建 + 忽略清单 + 失败明细；X-GROUP 为合法 UUID 且库中已存在该 id 时按覆盖合并）。
- UI（v0.3.10）：设置 → 数据管理 分 `JSON 文件` / `ICS 文件` 两行，各带「导出数据 / 从文件导入…」。
- 导入 .ics 的“合并/覆盖”语义与 JSON 导入一致。
- CalDAV 服务端、与手机日历的双向同步、多时区/所有日、重复例外细化：backlog。

## 5. 往返无损声明
- **业务级**：受支持子集导出→再导入可还原为等价日程（名称/时段/单双周/例外/间隔）。
- 非目标：与“完整 JSON 备份”同级的字节级还原（JSON 往返口径见 `04-api.md`/设置面板说明）。
