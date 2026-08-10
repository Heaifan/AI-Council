# MEETING-RUNTIME-F1-T25-F4 · activeSpeaker → Workspace 自动同步 — 开发报告

> 轮次：T25-F4（真机暴露：右侧「B1 当前发言」但中央停在 A2 空席配置）｜ 基线：F3（Node 223/223 · Browser 308/308）｜ 交付：Node **223/223** · Browser **319/319**

## 一、六项只读确认结果（用户要求的 F4-01..06）

| # | 结论 |
| --- | --- |
| F4-01 | ✅ `activeSpeakerId` 在 A1 accept 后 = `agent-b1`（Runtime 推进 pending[0]，TEST-202 已锁） |
| F4-02 | `selectedSeatId` 保持用户上次点击值（截图 A2）——**accept 后无任何代码更新它** |
| F4-03 | `selectedSeat` 写入口仅 `setSelectedSeat`（点击，切 seat 模式）/ `selectOnly`（浏览）——accept/step 均不写 |
| F4-04 | ✅ **存在物理席位旧逻辑**：`seat-nav.js` 的 `navSeat` 用 `SeatLayout.SEATS`（A1→A2→A3→B1…）——1v1 中「下一席」会走进 A2 空席 |
| F4-05 | 中央 run/seat 由 `SeatLocalConfig.getMode()` 决定（CenterStage 双 wrap display 切换） |
| F4-06 | ❌ **无同步动作**：`autoOpenNext` 只对 web_relay 开 session，不写 selectedSeat、不切 mode；mock 席位完全无动作 |

根因一句话：**Runtime 推进 activeSpeaker 后，UI 调度投影（selectedSeat/workspace）无人接管**。

## 二、修复内容（严格限定 UI 调度投影，未动 Roster/Admission/Completion/Replay）

| 项 | 修复 | 落点 |
| --- | --- | --- |
| 不变量 | **Runtime 自动推进发言人 → selectedSeat 同步 + workspace 保持 meeting-run**：`ConsoleActions.followActiveSpeaker()`（按 activeSpeakerId 查席位 → `selectOnly`，只改查看不切模式） | console-actions.js（99 行） |
| 接线 1 | `WebRelayActions.accept` 成功 → `followActiveSpeaker()`（accept 后无论下一席是 web_relay 还是 mock，selectedSeat 都跟随） | web-relay-actions.js |
| 接线 2 | `MeetingActions.step`（mock 推进）成功 → `followActiveSpeaker()` | meeting-actions.js |
| F4-04 | **`navSeat` 改为遍历 Phase Roster**（1v1: A1↔B1，不经过空席）；无会议时才回退物理六席 | seat-nav.js（67 行） |
| W06 | `selectedSeat ≠ activeSpeaker` 时出现 **[回到当前发言]** 按钮 → 一键回调度焦点 | seat-nav.js |
| 单一写入口 | 确认 `SeatLocalConfig` 是唯一存储、无渲染反写（seat-config-panel 只读 selectedSeat），无双向竞争 | 确认项 |

用户手工浏览语义不变：点 A1 → selectedSeat=A1、activeSpeaker 仍 B1；「回到当前发言」→ B1。

## 三、测试

- **Browser +11（W01..W07b）**：
  - W01：1v1 A1 accept → activeSpeaker=B1 && **selectedSeat=B1**（自动同步）
  - W02/W02b：中央无 A2 配置可见 + **invariant（running 非配置模式时 selectedSeat==activeSpeaker 席位）**
  - W03/W04：B1=web_relay → accept 后 B1 工作区自动出现 + Prompt 身份正确（含「风险挑战方」，不含 A1 的「战略支持方」）
  - W05：1v1 导航列表 = [A1,B1]（空席永不参与）
  - W06..W06d：手工回看不污染 activeSpeaker + 回到当前发言恢复
  - W07b：三人流程每轮轮转 invariant 保持
- **回归**：Browser 308→319、Node 223 零丢失。

## 四、门禁

- Node **223/223** · Browser **319/319**（真实 Chrome fresh，含全量 R/B/H/S/M/W 系列 + F3 四视口）✓
- 全部 ≤100 行（meeting-runtime.js 303 行 D1 豁免）✓ · `git diff --check` PASS ✓ · 临时脚本零残留 ✓
- worktree 未提交（T26 前）✓

## 五、真机复验指引

1. 1v1（A1+B1 参会）→ 开始 → A1 中继 accept → **页面应自动切到 B1**（nav「B1 · 当前发言 · 1/2」+ selectedSeat=B1 + B1 工作区/Prompt）
2. B1 active 时点 A1 卡 → 只改查看（activeSpeaker 仍 B1）→ 点「回到当前发言」→ 回 B1
3. 下一席浏览：1v1 中「下一席」从 A1 直达 B1（不经过 A2/A3 空席）
4. 三人/六席回归：每轮轮转工作区与当前发言一致
