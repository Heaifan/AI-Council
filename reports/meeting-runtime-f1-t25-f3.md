# MEETING-RUNTIME-F1-T25-F3 · 可变参会名单与空席语义 — 开发报告

> 轮次：T25-F3（真机验收暴露：六席被误当「每场必须坐满」）｜ 基线：F2（Node 219/219 · Browser 298/298）｜ 交付：Node **223/223** · Browser **308/308**

## 一、建模纠正（用户裁定）

```
Physical Seats（六席 = 会议室容量）≠ Meeting Roster（本场参会名单）≠ Phase Roster（Protocol 在参会名单内解析）
```

F2 的 Admission 原则（参会但未配置 → 挡住）**保留**；错的是把六个物理席位默认全部当成 required participant。1v1（A1+B1 配置，A2..B3 空）是合法会议：`required=[A1,B1]`、`completion=2/2`、空席显示「未参会」完全不阻塞。

## 二、修复内容

| 项 | 修复 | 落点 |
| --- | --- | --- |
| F3-02/03 | **participants 即 Meeting Roster**（不复制第二份状态）：cfg-create 默认只带**已配置模型的席位**参会（chair 保留）；未配置 = 未参会，点名页可勾选。会议开始（preflight_confirmed）后名单冻结 | `meeting-draft.js`（buildMeeting 过滤） |
| F3-04 | `resolveParticipants` 本就在 participants 上解析（边界天然正确）——**required/进度分母自动动态**：1v1→2/2、三人→3/3、六席→6/6，无任何硬编码 6 | 既有（验证） |
| F3-12 | **点名页参会选择**：六席全显（☑ 参会 / ☐ 未参会），勾选 = 加入/移出 participants + **`reenterPhase` 重解析当前阶段 roster**（runtime 新增导出，仅未开始时允许）；勾选加入按**物理席位顺序重排**（A1→B3 发言顺序稳定）；配置取 draft 用户配置（未配置=无模型 → 勾选后立即 ⚠） | `preflight-panel.js`（100 行）、`meeting-runtime.js`（reenterPhase） |
| F3-06/07 | Preflight 只检查参会成员：`✓ A1 ChatGPT 已就绪` / `⚠ A2 未指定模型 无法入会`（阻塞开始）/ `○ A3 未参会`（不阻塞）；「N 个参会成员尚未就绪」+ [配置未就绪席位] [重新检查] | preflight-panel |
| F3-08/11 | 未参会席位 = 「未参会」（seat-status 原「空席」改语义）；点名标题「会议点名 · Round 1 · 本场 N 人」（去掉「x/6 已入会」误导） | `seat-status.js`、preflight-panel |
| F3-09/10 | 进度分母 = requiredParticipantIds.length（动态）；自动轮转只遍历参会者（1v1：A1→B1→2/2，绝不到空席） | 验证（TEST-201..203/R1T-M 系列） |
| F3-05 | Protocol 指定的人不在参会名单 → admission「不属于本阶段发言名单」阻塞（边界不变） | 既有 |
| Replay | 名单冻结在 meeting.participants（存档保留），Replay 用创建时 roster 重建，不拿当前六席配置重推 | 验证 |
| 附带 | **D4 测试修复**：D2 的 mt-save 残留存档导致后续 cfg-create 被禁用（测试隔离问题） | run-browser.js |

## 三、测试

- **Node +4（TEST-201..204）**：M01 1v1 roster=[A1,B1] 空席不阻塞 / M02 1v1 完整 2/2 / M04 未参会席永不进 activeSpeaker / M05 勾选未配置 → blocked + reenterPhase 名单冻结。
- **Browser +10（R1T-M01..M07b）**：1v1 点名（2 参会 + 4 未参会 + 标题「本场 2 人」）→ 开始 → A1 relay accept → 自动 B1 → 2/2 → READY_TO_ADVANCE；勾选未配置席 → ⚠ + 开始禁用 → 补配置自动恢复 → 三人会议 A1→A2→B1→3/3。
- **回归**：Node 219→223、Browser 298→308 零丢失（六席全会行为不变；TEST-149/replay buildMeeting 适配 F3 语义——未配置不参会）。

## 四、门禁

- Node **223/223** · Browser **308/308**（真实 Chrome fresh，含 F3 四视口 + 全量 R/B/H/S/M 系列）✓
- 全部 ≤100 行（meeting-runtime.js 303 行 D1 豁免）✓ · `git diff --check` PASS ✓ · 临时脚本已清理 ✓
- worktree 未提交（T26 前）✓

## 五、真机复验指引

1. **1v1**：配置 A1（ChatGPT）+ B1（DeepSeek），其余席位留空 → 新建会议 → 点名页：✓ A1/B1 已就绪 + 4 席「未参会」→「本场 2 人」→ 开始 → A1 accept → 自动 B1 → 2/2 → 进入下一阶段
2. **三人**：点名页勾选 A2（已配置）→ 本场 3 人 → A1→A2→B1 → 3/3
3. **勾选未配置**：勾选未配置席 → ⚠ 无法入会 + 开始禁用 → 配置后自动恢复
4. **六席回归**：全配 → 6/6 不变
